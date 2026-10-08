"""Illustrated state and congressional district maps for legislator pages.

`build()` turns public-domain boundary files (Census Bureau cartographic boundaries for the 119th
Congress, Natural Earth populated places) into one small JSON file per state under app/data/maps/,
already projected and simplified into SVG path strings. The app draws them itself, so no map tiles,
keys, or paid services are involved. Rebuild with `python -m app.cli build-maps` (needs the dev
requirements: pyshp, shapely).

Each file: {state, name, width, height, outline, districts: {"11": {path, bbox}}, cities: [...]}.
District "0" is an at-large seat or a non-voting delegate's whole territory.

`build_national()` writes US.json, a coarser nationwide map (Census 1:20m files) in the usual
Albers USA layout with Alaska, Hawaii, and Puerto Rico as insets: {width, height,
states: {"WA": {name, path, label, tag}}, districts: {"WA-8": path}}.

`build()` also writes district_bounds.json: every district's boundary in longitude/latitude at full
detail, which `locate()` uses to find the district containing a point.
"""

import io
import json
import math
import tempfile
import zipfile
from functools import lru_cache
from pathlib import Path

import httpx

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
MAPS_DIR = DATA_DIR / "maps"
BOUNDS_FILE = DATA_DIR / "district_bounds.json"
CENSUS = "https://www2.census.gov/geo/tiger/GENZ2024/shp"
CITIES_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
    "ne_10m_populated_places_simple.geojson"
)
WIDTH = 1000  # every state is scaled to this width (or height, if taller)
MAX_CITIES = 30


@lru_cache(maxsize=64)
def load(state: str) -> dict | None:
    """A state's map, or the national map for "US". Cached: the files only change on a rebuild."""
    path = MAPS_DIR / f"{state.upper()}.json"
    return json.loads(path.read_text()) if state.isalpha() and path.exists() else None


def district_keys(state: str) -> list[int]:
    """The state's district numbers ([0] for an at-large seat or delegate), or [] if unknown."""
    data = load(state) if state.upper() != "US" else None
    return sorted(int(n) for n in data["districts"]) if data else []


@lru_cache(maxsize=1)
def _bounds() -> dict:
    return json.loads(BOUNDS_FILE.read_text()) if BOUNDS_FILE.exists() else {}


def _inside(x: float, y: float, rings: list[list[float]]) -> bool:
    """Even-odd ray casting over every ring of a (multi)polygon, so holes count as outside."""
    inside = False
    for ring in rings:
        n = len(ring) // 2
        j = n - 1
        for i in range(n):
            xi, yi, xj, yj = ring[2 * i], ring[2 * i + 1], ring[2 * j], ring[2 * j + 1]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                inside = not inside
            j = i
    return inside


def locate(lat: float, lon: float) -> tuple[str, int] | None:
    """(state, district) containing the point, from the 119th Congress boundaries, or None."""
    for key, (bbox, rings) in _bounds().items():
        if bbox[0] <= lon <= bbox[2] and bbox[1] <= lat <= bbox[3] and _inside(lon, lat, rings):
            state, district = key.split("-")
            return state, int(district)
    return None


def _download(url: str, dest: Path) -> Path:
    with httpx.stream("GET", url, timeout=120, follow_redirects=True) as r:
        r.raise_for_status()
        dest.write_bytes(r.read())
    return dest


def _shapes(zip_path: Path):
    import shapefile
    from shapely.geometry import shape

    with zipfile.ZipFile(zip_path) as z:
        names = {Path(n).suffix: n for n in z.namelist()}
        reader = shapefile.Reader(
            shp=io.BytesIO(z.read(names[".shp"])), dbf=io.BytesIO(z.read(names[".dbf"])),
            shx=io.BytesIO(z.read(names[".shx"])),
        )
        for rec in reader.iterShapeRecords():
            yield rec.record.as_dict(), shape(rec.shape.__geo_interface__)


def _num(v: float) -> str:
    return f"{v:.1f}".rstrip("0").rstrip(".")


def _path(geom) -> str:
    """SVG path data for a projected (multi)polygon, coordinates rounded to 0.1."""
    parts = []
    for poly in getattr(geom, "geoms", [geom]):
        for ring in [poly.exterior, *poly.interiors]:
            pts = ring.coords[:-1]
            if len(pts) >= 3:
                parts.append("M" + "L".join(f"{_num(x)} {_num(y)}" for x, y in pts) + "Z")
    return "".join(parts)


def _main_bounds(geom):
    """Bounds of the polygons that make up the bulk of a shape, ignoring small far-off islands
    (e.g. the Farallon Islands in San Francisco's district), so a zoomed-in map frames the district."""
    from shapely.geometry import MultiPolygon

    polys = list(getattr(geom, "geoms", [geom]))
    biggest = max(p.area for p in polys)
    return MultiPolygon([p for p in polys if p.area >= biggest * 0.05]).bounds


def _unwrap(x, y, z=None):
    """Alaska's Aleutians cross the antimeridian: keep every longitude on the western side."""
    return (x - 360 if x > 0 else x), y


class _Projection:
    """Equirectangular projection centered on one state (plenty accurate at state scale),
    scaled so the state's longer side is WIDTH units, y pointing down as in SVG."""

    def __init__(self, state_geom):
        self.x0, _, x1, self.y1 = state_geom.bounds
        self.sx = math.cos(math.radians(state_geom.centroid.y))
        w, h = (x1 - self.x0) * self.sx, self.y1 - state_geom.bounds[1]
        self.scale = WIDTH / max(w, h)
        self.width, self.height = w * self.scale, h * self.scale

    def __call__(self, x, y, z=None):
        return (x - self.x0) * self.sx * self.scale, (self.y1 - y) * self.scale


def build(out_dir: Path = MAPS_DIR) -> int:
    from shapely.geometry import Point
    from shapely.ops import transform

    out_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        states = {
            rec["STATEFP"]: (rec["STUSPS"], rec["NAME"], geom)
            for rec, geom in _shapes(_download(f"{CENSUS}/cb_2024_us_state_500k.zip", tmp / "s.zip"))
        }
        districts: dict[str, list] = {}
        for rec, geom in _shapes(_download(f"{CENSUS}/cb_2024_us_cd119_500k.zip", tmp / "cd.zip")):
            number = int(rec["CD119FP"]) if rec["CD119FP"] not in ("98", "ZZ") else 0
            districts.setdefault(rec["STATEFP"], []).append((str(number), geom))
        cities = json.loads(_download(CITIES_URL, tmp / "c.json").read_text())["features"]
    _write_bounds(states, districts)

    written = 0
    for fips, (code, name, state_geom) in states.items():
        state_geom = transform(_unwrap, state_geom)
        project = _Projection(state_geom)

        def to_view(geom, project=project):
            return transform(project, transform(_unwrap, geom))

        state_view = to_view(state_geom)
        tolerance = 0.6
        out_districts = {}
        pieces = []
        for number, geom in districts.get(fips, []):
            view = to_view(geom)
            pieces.append((number, view))
            bx0, by0, bx1, by1 = view.bounds
            # Small urban districts get a finer tolerance so they still look right when zoomed in.
            tol = min(tolerance, max(bx1 - bx0, by1 - by0) * 0.004)
            out_districts[number] = {
                "path": _path(view.simplify(tol, preserve_topology=True)),
                "bbox": [round(v, 1) for v in _main_bounds(view)],
            }
        in_state = [
            f["properties"] for f in cities
            if f["properties"]["adm0_a3"] == "USA" and f["properties"]["adm1name"] == name
        ]
        in_state.sort(key=lambda c: -c["pop_max"])
        out_cities = []
        for c in in_state[:MAX_CITIES]:
            cx, cy = project(*_unwrap(c["longitude"], c["latitude"]))
            district = next((n for n, geom in pieces if geom.contains(Point(cx, cy))), None)
            out_cities.append({
                "name": c["name"], "x": round(cx, 1), "y": round(cy, 1), "pop": c["pop_max"], "district": district,
            })

        data = {
            "state": code,
            "name": name,
            "width": round(project.width, 1),
            "height": round(project.height, 1),
            "outline": _path(state_view.simplify(tolerance, preserve_topology=True)),
            "districts": out_districts,
            "cities": out_cities,
        }
        (out_dir / f"{code}.json").write_text(json.dumps(data, separators=(",", ":")))
        written += 1
    return written


def _write_bounds(states: dict, districts: dict[str, list]) -> None:
    """Full-detail boundaries for `locate()`, lightly simplified (about 10 m) and rounded to 4 decimals."""
    out = {}
    for fips, pieces in districts.items():
        code = states[fips][0] if fips in states else None
        if not code:
            continue
        for number, geom in pieces:
            geom = geom.simplify(0.0001, preserve_topology=True)
            rings = [
                [round(v, 4) for pt in ring.coords for v in pt[:2]]
                for poly in getattr(geom, "geoms", [geom])
                for ring in [poly.exterior, *poly.interiors]
            ]
            out[f"{code}-{number}"] = [[round(v, 4) for v in geom.bounds], rings]
    BOUNDS_FILE.write_text(json.dumps(out, separators=(",", ":")))


# ---------- nationwide map ----------

NATIONAL_W, NATIONAL_H = 960, 600
NATIONAL_SCALE = 1070
# Not drawn nationally (too small and far away); their own state maps and location lookup still work.
NATIONAL_SKIP = {"GU", "VI", "AS", "MP"}
# Too small to tap at national scale: their label moves to a tag off the East Coast, with a leader line.
CALLOUTS = ["VT", "NH", "MA", "RI", "CT", "NJ", "DE", "MD", "DC"]


class _Albers:
    """Albers equal-area conic, placed so `center` lands on `translate` (as in d3's geoAlbersUsa)."""

    def __init__(self, lon0, parallels, center, scale, translate):
        p1, p2 = (math.radians(p) for p in parallels)
        self.lon0, self.k, (self.tx, self.ty) = lon0, scale, translate
        self.n = (math.sin(p1) + math.sin(p2)) / 2
        self.c = math.cos(p1) ** 2 + 2 * self.n * math.sin(p1)
        self.cx, self.cy = 0.0, 0.0
        self.cx, self.cy = self._raw(*center)

    def _raw(self, lon, lat):
        rho = math.sqrt(max(self.c - 2 * self.n * math.sin(math.radians(lat)), 0)) / self.n
        theta = self.n * math.radians(lon - self.lon0)
        return rho * math.sin(theta), -rho * math.cos(theta)

    def __call__(self, x, y, z=None):
        rx, ry = self._raw(x, y)
        return self.tx + self.k * (rx - self.cx), self.ty - self.k * (ry - self.cy)


def _national_projection(code: str) -> _Albers:
    k = NATIONAL_SCALE
    if code == "AK":
        return _Albers(-154, (55, 65), (-156, 58.5), 0.35 * k, (480 - 0.307 * k, 250 + 0.201 * k))
    if code == "HI":
        return _Albers(-157, (8, 18), (-160, 19.9), k, (480 - 0.205 * k, 250 + 0.212 * k))
    if code == "PR":
        return _Albers(-66, (8, 18), (-66.4, 18.2), k, (800, 560))
    return _Albers(-96, (29.5, 45.5), (-96.6, 38.7), k, (480, 250))


def build_national(out_dir: Path = MAPS_DIR) -> None:
    from shapely.ops import transform

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        states = {
            rec["STATEFP"]: (rec["STUSPS"], rec["NAME"], geom)
            for rec, geom in _shapes(_download(f"{CENSUS}/cb_2024_us_state_20m.zip", tmp / "s.zip"))
        }
        cds = list(_shapes(_download(f"{CENSUS}/cb_2024_us_cd119_20m.zip", tmp / "cd.zip")))

    def to_view(code, geom):
        return transform(_national_projection(code), transform(_unwrap, geom))

    out_states: dict[str, dict] = {}
    for code, name, geom in states.values():
        if code in NATIONAL_SKIP:
            continue
        view = to_view(code, geom)
        main = max(getattr(view, "geoms", [view]), key=lambda p: p.area)
        point = main.representative_point() if code not in ("FL", "LA", "MI") else main.centroid
        x, y = point.x, point.y
        if code in ("HI", "PR"):  # island chains: the label goes just below them, not on top
            x0, _, x1, y1 = view.bounds
            x, y = (x0 + x1) / 2, y1 + 12
        out_states[code] = {
            "name": name,
            "path": _path(view.simplify(0.4, preserve_topology=True)),
            "label": [round(x, 1), round(y, 1)],
            "tag": None,
        }
    # Stack the callout tags down the right edge, north to south, spaced so 12 px tags don't overlap
    # when the map is phone-width (about 340 px, so 38 map units is about 13 px).
    y = 0.0
    for code in sorted((c for c in CALLOUTS if c in out_states), key=lambda c: out_states[c]["label"][1]):
        y = max(out_states[code]["label"][1], y + 38)
        out_states[code]["tag"] = [925, round(y, 1)]

    out_districts = {}
    for rec, geom in cds:
        code = states.get(rec["STATEFP"], ("",))[0]
        if not code or code in NATIONAL_SKIP:
            continue
        number = int(rec["CD119FP"]) if rec["CD119FP"] not in ("98", "ZZ") else 0
        out_districts[f"{code}-{number}"] = _path(to_view(code, geom).simplify(0.3, preserve_topology=True))

    data = {"width": NATIONAL_W, "height": NATIONAL_H, "states": out_states, "districts": out_districts}
    (out_dir / "US.json").write_text(json.dumps(data, separators=(",", ":")))

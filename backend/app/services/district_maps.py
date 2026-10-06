"""Illustrated state and congressional district maps for legislator pages.

`build()` turns public-domain boundary files (Census Bureau cartographic boundaries for the 119th
Congress, Natural Earth populated places) into one small JSON file per state under app/data/maps/,
already projected and simplified into SVG path strings. The app draws them itself, so no map tiles,
keys, or paid services are involved. Rebuild with `python -m app.cli build-maps` (needs the dev
requirements: pyshp, shapely).

Each file: {state, name, width, height, outline, districts: {"11": {path, bbox}}, cities: [...]}.
District "0" is an at-large seat or a non-voting delegate's whole territory.
"""

import io
import json
import math
import tempfile
import zipfile
from pathlib import Path

import httpx

MAPS_DIR = Path(__file__).resolve().parent.parent / "data" / "maps"
CENSUS = "https://www2.census.gov/geo/tiger/GENZ2024/shp"
CITIES_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
    "ne_10m_populated_places_simple.geojson"
)
WIDTH = 1000  # every state is scaled to this width (or height, if taller)
MAX_CITIES = 30


def load(state: str) -> dict | None:
    path = MAPS_DIR / f"{state.upper()}.json"
    return json.loads(path.read_text()) if state.isalpha() and path.exists() else None


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

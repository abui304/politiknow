import { Platform } from 'react-native';

/** Press handler props for react-native-svg shapes. On web the library turns `onPress` into
 *  `onClick` but also passes touch-responder props through to the DOM, which React warns about.
 *  So web gets a plain `onClick`, with `onPress: null`: the library only copies `onPress` over
 *  `onClick` when it isn't null. */
export function svgPress(handler: (() => void) | undefined): { onPress?: () => void } {
  if (!handler) return {};
  return Platform.OS === 'web'
    ? ({ onClick: handler, onPress: null } as unknown as { onPress?: () => void })
    : { onPress: handler };
}

type Shape = { bbox: [number, number, number, number]; rings: number[][] };
const shapes = new Map<string, Shape>();

/** The map files' paths are absolute "M x y L x y ... Z" polygons; parsed once and cached. */
function shape(d: string): Shape {
  let s = shapes.get(d);
  if (!s) {
    const rings = d
      .split('M')
      .filter(Boolean)
      .map((part) => part.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []);
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const r of rings) {
      for (let i = 0; i + 1 < r.length; i += 2) {
        x0 = Math.min(x0, r[i]);
        x1 = Math.max(x1, r[i]);
        y0 = Math.min(y0, r[i + 1]);
        y1 = Math.max(y1, r[i + 1]);
      }
    }
    s = { bbox: [x0, y0, x1, y1], rings };
    shapes.set(d, s);
  }
  return s;
}

/** Whether (x, y) is inside a map path (even-odd across its rings, so islands and holes work). Used for
 *  taps on zoomable maps, where the gesture handler sees the touch instead of the SVG shapes. */
export function pathContains(d: string, x: number, y: number): boolean {
  const { bbox, rings } = shape(d);
  if (x < bbox[0] || x > bbox[2] || y < bbox[1] || y > bbox[3]) return false;
  let inside = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 2; i + 1 < r.length; j = i, i += 2) {
      const [xi, yi, xj, yj] = [r[i], r[i + 1], r[j], r[j + 1]];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

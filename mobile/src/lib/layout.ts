import { Platform, useWindowDimensions } from 'react-native';

/** Widths where the web app switches to its desktop layout: a side navigation and wider pages. */
export const DESKTOP_MIN = 1024;
/** Wide enough for a right-hand column beside the main one (the feed's rail, the bill page's facts). */
export const RAIL_MIN = 1200;

/** True in a desktop-width browser window. Phones, tablets in portrait and native apps keep the phone layout. */
export function useWide() {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= DESKTOP_MIN;
}

/** True when there's room for a second column beside the main one. */
export function useRail() {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= RAIL_MIN;
}

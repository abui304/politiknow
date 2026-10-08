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

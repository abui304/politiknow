import { Platform } from 'react-native';

/**
 * True on web with a mouse or trackpad (a laptop or desktop), where keyboard shortcuts make sense.
 * False on phones and tablets, including a browser on an iPad, so "Ctrl K" hints never show on touch screens.
 */
export const hasKeyboard =
  Platform.OS === 'web' && typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: fine)').matches);

import * as Linking from 'expo-linking';
import { Platform, Share } from 'react-native';
import { create } from 'zustand';

import { plainText } from './format';
import { toast } from './toast';
import type { Bill } from './types';

/**
 * The public address of the PolitiKNOW web app, e.g. https://politiknow.app. Set EXPO_PUBLIC_WEB_URL when
 * it's deployed. On web it defaults to the site you're on; in the native apps without it, links use the
 * app's own politiknow:// scheme, which opens the app on phones that have it.
 */
function webBase(): string | null {
  const fromEnv = process.env.EXPO_PUBLIC_WEB_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  return null;
}

/** A link that opens this bill in PolitiKNOW. */
export function billLink(bill: Pick<Bill, 'id'>): string {
  const base = webBase();
  return base ? `${base}/bill/${bill.id}` : Linking.createURL(`/bill/${bill.id}`);
}

export async function shareBill(bill: Bill) {
  const url = billLink(bill);
  const text = `${bill.label}: ${bill.title}\n\n${plainText(bill.summary_simple ?? '').slice(0, 200)}…`;
  const message = `${text}\n\nRead it on PolitiKNOW: ${url}`;
  try {
    if (Platform.OS === 'web') {
      const nav = globalThis.navigator as Navigator | undefined;
      // The browser share sheet adds `url` itself, so it stays out of the text (or it shows up twice).
      if (nav?.share) return await nav.share({ title: bill.title, text, url });
      await nav?.clipboard?.writeText(message);
      return toast('Link copied', 'success');
    }
    await Share.share({ message, url });
  } catch {
    // user dismissed the share sheet
  }
}

/**
 * A shared bill link opened by someone who isn't signed in yet. The welcome screen says so, and once they've
 * signed in (and finished setup) the app opens the bill instead of the feed.
 */
export const usePendingLink = create<{ path: string | null; set: (path: string | null) => void }>((set) => ({
  path: null,
  set: (path) => set({ path }),
}));

/** "/bill/<id>" from a URL the app was opened with, or null. */
export function billPathFrom(url: string | null): string | null {
  if (!url) return null;
  const { path } = Linking.parse(url);
  const m = path?.match(/^\/?bill\/([\w-]+)$/);
  return m ? `/bill/${m[1]}` : null;
}

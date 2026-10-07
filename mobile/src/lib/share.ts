import { Platform, Share } from 'react-native';

import { toast } from './toast';
import type { Bill } from './types';

export async function shareBill(bill: Bill) {
  const url = bill.congress_url ?? 'https://www.congress.gov';
  const text = `${bill.label}: ${bill.title}\n\n${(bill.summary_simple ?? '').slice(0, 200)}…\n\nvia PolitiKNOW`;
  const message = `${text} · ${url}`;
  try {
    if (Platform.OS === 'web') {
      const nav = globalThis.navigator as Navigator | undefined;
      // The browser share sheet adds `url` itself, so it stays out of the text (or it shows up twice).
      if (nav?.share) return await nav.share({ title: bill.title, text, url });
      await nav?.clipboard?.writeText(message);
      return toast('Copied to clipboard!', 'success');
    }
    await Share.share({ message });
  } catch {
    // user dismissed the share sheet
  }
}

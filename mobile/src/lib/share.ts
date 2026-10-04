import { Platform, Share } from 'react-native';

import { toast } from './toast';
import type { Bill } from './types';

export async function shareBill(bill: Bill) {
  const url = bill.congress_url ?? 'https://www.congress.gov';
  const message = `${bill.label}: ${bill.title}\n\n${(bill.summary_simple ?? '').slice(0, 200)}…\n\nvia PolitiKNOW · ${url}`;
  try {
    if (Platform.OS === 'web') {
      const nav = globalThis.navigator as Navigator | undefined;
      if (nav?.share) return await nav.share({ title: bill.title, text: message, url });
      await nav?.clipboard?.writeText(message);
      return toast('Copied to clipboard!', 'success');
    }
    await Share.share({ message });
  } catch {
    // user dismissed the share sheet
  }
}

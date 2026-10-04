/** Display names: 3–30 letters, numbers or underscores (spec 6.2). */
export const NAME_RE = /^[A-Za-z0-9_]{3,30}$/;

export const STATUS_LABELS: Record<string, string> = {
  introduced: 'Introduced',
  in_committee: 'In committee',
  passed_house: 'Passed House',
  passed_senate: 'Passed Senate',
  to_president: 'On the President’s desk',
  became_law: 'Became law',
  vetoed: 'Vetoed',
};

export function statusOf(status: string) {
  return STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function timeAgo(iso: string): string {
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = secs / 60;
  if (mins < 60) return `${Math.floor(mins)}m`;
  const hrs = mins / 60;
  if (hrs < 24) return `${Math.floor(hrs)}h`;
  const days = hrs / 24;
  if (days < 7) return `${Math.floor(days)}d`;
  return shortDate(iso);
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

import { api } from './api';

/** The only events the app records (backend/app/routers/events.py). No free text, no search terms. */
export type EventName = 'recap_open' | 'since_item_open' | 'floor_week_open' | 'glossary_tap' | 'share' | 'contact_member';

/** Records a retention event. Fire-and-forget: never slows down or breaks what the person is doing. */
export function track(name: EventName, refId?: string) {
  api('/events', { method: 'POST', body: { name, ref_id: refId ?? null } }).catch(() => {});
}

/** Records that an alert was opened, and from where (once per alert; later opens are ignored). */
export function markAlertOpened(id: string, channel: 'in_app' | 'push' | 'email' = 'in_app') {
  api(`/notifications/${id}/open`, { method: 'POST', body: { channel } }).catch(() => {});
}

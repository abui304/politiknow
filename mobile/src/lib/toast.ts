import { AppState, Platform } from 'react-native';
import { create } from 'zustand';

type Toast = {
  id: number;
  message: string;
  tone: 'info' | 'error' | 'success';
  /** A button in the toast, e.g. Undo. Toasts with an action stay up longer so there's time to tap it. */
  action?: { label: string; onPress: () => void };
};

export const useToasts = create<{ toasts: Toast[] }>(() => ({ toasts: [] }));

let nextId = 1;

export function dismissToast(id: number) {
  useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

/** Cross-platform replacement for Alert.alert (which is a no-op on web). */
export function toast(message: string, tone: Toast['tone'] = 'info', action?: Toast['action']) {
  const id = nextId++;
  // Keep at most three on screen; the oldest goes first.
  useToasts.setState((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, tone, action }] }));
  setTimeout(() => dismissToast(id), action ? UNDO_WINDOW : 3200);
  return id;
}

export function toastError(e: unknown) {
  toast(e instanceof Error ? e.message : 'Something went wrong', 'error');
}

/** How long an Undo toast stays up, and how long a deferred action waits before it really happens. */
export const UNDO_WINDOW = 5000;

/**
 * Do something reversible right away and offer Undo. `undo` runs if the button is tapped.
 * For destructive actions, prefer `deferWithUndo`, which waits before calling the server at all.
 */
export function toastUndo(message: string, undo: () => void) {
  const id = toast(message, 'info', {
    label: 'Undo',
    onPress: () => {
      dismissToast(id);
      undo();
    },
  });
}

/**
 * Hide something now and only commit after the Undo window, so Undo never has to un-delete on the server.
 * `hide` updates the screen, `restore` puts it back, `commit` does the real work.
 */
export function deferWithUndo(message: string, { hide, restore, commit }: { hide: () => void; restore: () => void; commit: () => void }) {
  hide();
  const key = nextPending++;
  pending.set(key, commit);
  const id = toast(message, 'info', {
    label: 'Undo',
    onPress: () => {
      pending.delete(key);
      dismissToast(id);
      restore();
    },
  });
  setTimeout(() => runPending(key), UNDO_WINDOW);
}

/** Deferred actions waiting out their Undo window. They run early if the app is closed or backgrounded,
 *  so closing the tab right after "Delete" still deletes. */
const pending = new Map<number, () => void>();
let nextPending = 1;

function runPending(key: number) {
  const commit = pending.get(key);
  pending.delete(key);
  commit?.();
}

function flushPending() {
  [...pending.keys()].forEach(runPending);
}

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushPending);
} else {
  AppState.addEventListener('change', (state) => state === 'background' && flushPending());
}

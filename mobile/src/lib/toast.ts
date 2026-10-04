import { create } from 'zustand';

type Toast = { id: number; message: string; tone: 'info' | 'error' | 'success' };

export const useToasts = create<{ toasts: Toast[] }>(() => ({ toasts: [] }));

let nextId = 1;

/** Cross-platform replacement for Alert.alert (which is a no-op on web). */
export function toast(message: string, tone: Toast['tone'] = 'info') {
  const id = nextId++;
  useToasts.setState((s) => ({ toasts: [...s.toasts, { id, message, tone }] }));
  setTimeout(() => useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3200);
}

export function toastError(e: unknown) {
  toast(e instanceof Error ? e.message : 'Something went wrong', 'error');
}

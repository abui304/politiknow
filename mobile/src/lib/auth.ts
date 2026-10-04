import { create } from 'zustand';

import { storage } from './storage';
import type { Tokens } from './types';

const ACCESS = 'pk.access';
const REFRESH = 'pk.refresh';
const STAGE = 'pk.stage';

/** Where the user is in sign-up: picking a display name, picking topics, or done. */
export type Stage = 'needs_name' | 'needs_topics' | 'ready';

type AuthState = {
  hydrated: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  stage: Stage;
  hydrate: () => Promise<void>;
  setTokens: (t: Tokens) => Promise<void>;
  setStage: (s: Stage) => Promise<void>;
  signOut: (callServer?: boolean) => Promise<void>;
};

function stageFrom(t: Tokens): Stage {
  if (t.needs_display_name) return 'needs_name';
  if (t.needs_onboarding) return 'needs_topics';
  return 'ready';
}

export const useAuth = create<AuthState>((set, get) => ({
  hydrated: false,
  accessToken: null,
  refreshToken: null,
  stage: 'ready',

  async hydrate() {
    const [accessToken, refreshToken, stage] = await Promise.all([
      storage.get(ACCESS),
      storage.get(REFRESH),
      storage.get(STAGE),
    ]);
    set({ accessToken, refreshToken, stage: (stage as Stage) ?? 'ready', hydrated: true });
  },

  async setTokens(t) {
    const stage = stageFrom(t);
    await Promise.all([
      storage.set(ACCESS, t.access_token),
      storage.set(REFRESH, t.refresh_token),
      storage.set(STAGE, stage),
    ]);
    set({ accessToken: t.access_token, refreshToken: t.refresh_token, stage });
  },

  async setStage(stage) {
    await storage.set(STAGE, stage);
    set({ stage });
  },

  async signOut(callServer = true) {
    const { refreshToken } = get();
    if (callServer && refreshToken) {
      const { api } = await import('./api');
      api('/auth/logout', { method: 'POST', body: { refresh_token: refreshToken }, auth: false }).catch(() => {});
    }
    await Promise.all([storage.remove(ACCESS), storage.remove(REFRESH), storage.remove(STAGE)]);
    set({ accessToken: null, refreshToken: null, stage: 'ready' });
  },
}));

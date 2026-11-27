import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Keeps glossary underlines to a term's first use on each screen. Every piece of text that contains a term
 * claims it; the first claimant underlines it and the rest show it plain. When that text goes away (a list
 * scrolls, a section closes), the next claimant takes over. Every Screen has one of these.
 */
type Scope = {
  owners: Record<string, string[]>;
  claim: (ids: string[], owner: string) => void;
  release: (owner: string) => void;
};

const ScopeContext = createContext<Scope | null>(null);

export function GlossaryScope({ children }: { children: ReactNode }) {
  const [owners, setOwners] = useState<Record<string, string[]>>({});
  const claim = useCallback((ids: string[], owner: string) => {
    setOwners((prev) => {
      let next = prev;
      for (const id of ids) {
        if (prev[id]?.includes(owner)) continue;
        next = { ...next, [id]: [...(prev[id] ?? []), owner] };
      }
      return next;
    });
  }, []);
  const release = useCallback((owner: string) => {
    setOwners((prev) => {
      let changed = false;
      const next: Record<string, string[]> = {};
      for (const [id, list] of Object.entries(prev)) {
        const kept = list.filter((o) => o !== owner);
        if (kept.length !== list.length) changed = true;
        if (kept.length) next[id] = kept;
      }
      return changed ? next : prev;
    });
  }, []);
  const value = useMemo(() => ({ owners, claim, release }), [owners, claim, release]);
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export const useGlossaryScope = () => useContext(ScopeContext);

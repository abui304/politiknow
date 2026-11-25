import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const KEY = 'pk.recentSearches';
const MAX = 5;

/** The last few searches, saved on this device only, newest first. */
export function useRecentSearches() {
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => setRecent(v ? (JSON.parse(v) as string[]) : []))
      .catch(() => {});
  }, []);
  const save = (next: string[]) => {
    setRecent(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  };
  const add = useCallback((q: string) => {
    const term = q.trim();
    if (term.length < 2) return;
    setRecent((prev) => {
      const next = [term, ...prev.filter((p) => p.toLowerCase() !== term.toLowerCase())].slice(0, MAX);
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);
  return { recent, add, clear: () => save([]) };
}

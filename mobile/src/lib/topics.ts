import type { Tag } from './types';

/**
 * Official topics an everyday word belongs to, most central first: "abortion" → Health, Civil Rights.
 * Mirrors backend topic_words.topics_for, using the words the server sends with each topic.
 */
export function topicsFor(tags: Tag[], term: string): string[] {
  const t = term.trim().toLowerCase();
  if (t.length < 2) return [];
  const exact = tags
    .filter((tag) => tag.words.includes(t))
    .sort((a, b) => a.words.indexOf(t) / a.words.length - b.words.indexOf(t) / b.words.length)
    .map((tag) => tag.name);
  const prefix =
    t.length >= 3 ? tags.filter((tag) => !exact.includes(tag.name) && tag.words.some((w) => w.startsWith(t))).map((tag) => tag.name) : [];
  const named = tags
    .filter((tag) => !exact.includes(tag.name) && !prefix.includes(tag.name) && tag.name.toLowerCase().includes(t))
    .map((tag) => tag.name);
  return [...exact, ...prefix, ...named];
}

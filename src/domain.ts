import type { Moment, Tag } from './types';
export function canonical(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en-GB')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
export function makeTag(text: string): Tag {
  const label = text.trim().replace(/\s+/g, ' ').slice(0, 80),
    key = canonical(label);
  if (!key) throw new Error('Give your tag a name.');
  return { id: encodeURIComponent(key), label, canonical: key };
}
export const starterTags = [
  'First word',
  'Funny',
  'Milestone',
  'Sweet moment',
  'Outing',
  'Running',
  'Travel',
].map(makeTag);
export function rankTags(tags: Tag[], moments: Moment[], profile: string, search = ''): Tag[] {
  const q = canonical(search);
  const rank = (tag: Tag) =>
    !q
      ? 0
      : tag.canonical === q
        ? 0
        : tag.canonical.startsWith(q)
          ? 1
          : tag.canonical.split(' ').some((s) => s.startsWith(q))
            ? 2
            : tag.canonical.includes(q)
              ? 3
              : 4;
  const scores = new Map<string, number>();
  // Derived once from unique current records; retries never increment a counter.
  for (const m of new Map(moments.map((m) => [m.id, m])).values())
    if (!m.deletedAt) {
      const recency = Math.max(
        0,
        1 - (Date.now() - Date.parse(m.updatedAt || m.eventAt)) / (90 * 86400000),
      );
      for (const id of new Set(m.tagIds))
        scores.set(id, (scores.get(id) || 0) + (m.profileId === profile ? 10 : 1) + recency);
    }
  return [...new Map(tags.map((t) => [t.id, t])).values()]
    .filter((t) => rank(t) < 4)
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (scores.get(b.id) || 0) - (scores.get(a.id) || 0) ||
        a.label.localeCompare(b.label),
    );
}
export function validateCapture(text: string, count: number, eventAt: string) {
  if (!text.trim() && !count) throw new Error('Add a thought or an attachment first.');
  if (text.length > 20000) throw new Error('Keep each moment under 20,000 characters.');
  if (count > 6) throw new Error('You can attach up to 6 files to one moment.');
  if (!Number.isFinite(Date.parse(eventAt))) throw new Error('Choose a valid date and time.');
}
export function londonInput(iso: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
export function fromLondonInput(value: string) {
  const target = Date.parse(value + 'Z');
  if (!Number.isFinite(target)) throw new Error('Choose a valid date.');
  // Search both offsets; DST gaps are rejected and repeated hours choose the earlier occurrence.
  const options = [target - 3600000, target].filter(
    (t) => londonInput(new Date(t).toISOString()) === value,
  );
  if (!options.length)
    throw new Error(
      'That time does not exist in London because the clocks change. Choose another time.',
    );
  return new Date(options[0]).toISOString();
}
export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
export const formatTime = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
export async function hashBlob(blob: Blob) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
}

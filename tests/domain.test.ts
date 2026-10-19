import { describe, expect, it } from 'vitest';
import {
  canonical,
  fromLondonInput,
  londonInput,
  makeTag,
  rankTags,
  validateCapture,
} from '../src/domain';
import { fileType, MB } from '../src/media';
import type { Moment } from '../src/types';
const moment = (id: string, profileId: string, tagIds: string[]): Moment => ({
  id,
  profileId,
  tagIds,
  text: 'Hello',
  attachments: [],
  eventAt: new Date().toISOString(),
  createdAt: '',
  updatedAt: '',
  createdByUid: 'u',
  updatedByUid: 'u',
  revision: 1,
  deletedAt: null,
  schemaVersion: 1,
  lastOpId: id,
});
describe('tag catalogue', () => {
  it('normalises case, accents, spaces and punctuation', () => {
    expect(canonical('  FÍRST---Word! ')).toBe('first word');
    expect(makeTag('FIRST WORD').id).toBe(makeTag('First Word').id);
  });
  it('prioritises exact, prefix, word-prefix and substring matches', () => {
    const tags = [
      'My first word',
      'First',
      'The first',
      'First word',
      'Not relevant',
      'Veryfirst',
    ].map(makeTag);
    expect(rankTags(tags, [], 'giulia', 'fir').map((t) => t.label)).toEqual([
      'First',
      'First word',
      'My first word',
      'The first',
      'Veryfirst',
    ]);
  });
  it('searches substring and accent-insensitively', () => {
    expect(
      rankTags(['Café outing', 'Milestone'].map(makeTag), [], 'giulia', 'AFE').map((t) => t.label),
    ).toEqual(['Café outing']);
  });
  it('ranks use separately by profile and never double counts retries', () => {
    const a = makeTag('Running'),
      b = makeTag('Milestone');
    const rows = [moment('1', 'me', [a.id]), moment('2', 'giulia', [b.id])];
    expect(rankTags([a, b], rows, 'me')[0].id).toBe(a.id);
    expect(rankTags([a, b], rows, 'giulia')[0].id).toBe(b.id);
    expect(rankTags([a, b], [...rows, ...rows, ...rows], 'giulia')).toEqual(
      rankTags([a, b], rows, 'giulia'),
    );
    rows[1].tagIds = [];
    expect(rankTags([a, b], rows, 'giulia')[0].id).toBe(a.id);
    rows[0].deletedAt = 'now';
    expect(rankTags([a, b], rows, 'me')[0].label).toBe('Milestone');
  });
  it('rejects punctuation-only tags', () => expect(() => makeTag('!!!')).toThrow());
});
describe('capture and media', () => {
  it('rejects empty capture including tags-only, allows photo-only', () => {
    expect(() => validateCapture('  ', 0, new Date().toISOString())).toThrow();
    expect(() => validateCapture('', 1, new Date().toISOString())).not.toThrow();
  });
  it('enforces realistic file limits and safe types', () => {
    expect(fileType({ name: 'clip.mp4', type: 'video/mp4', size: 100 * MB }).kind).toBe('video');
    expect(() => fileType({ name: 'clip.mp4', type: 'video/mp4', size: 100 * MB + 1 })).toThrow(
      '100 MB',
    );
    expect(fileType({ name: 'scan.pdf', type: '', size: 2000 }).mime).toBe('application/pdf');
    expect(() => fileType({ name: 'x.html', type: 'text/html', size: 100 })).toThrow();
    expect(() => fileType({ name: 'x.pdf', type: 'application/pdf', size: 20 * MB + 1 })).toThrow();
  });
  it('edits London times independently of device timezone', () => {
    expect(fromLondonInput('2026-07-01T12:00')).toBe('2026-07-01T11:00:00.000Z');
    expect(londonInput('2026-12-01T12:00:00.000Z')).toBe('2026-12-01T12:00');
  });
  it('rejects DST gaps and documents a deterministic repeated-hour choice', () => {
    expect(() => fromLondonInput('2026-03-29T01:30')).toThrow('clocks');
    expect(fromLondonInput('2026-10-25T01:30')).toBe('2026-10-25T00:30:00.000Z');
  });
});

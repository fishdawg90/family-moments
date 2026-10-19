import { describe, expect, it } from 'vitest';
import { exploreModes, pickUnseen, sampleMoments, sharedTagLinks } from '../src/explore-data';

describe('memory exploration', () => {
  it('offers five distinct modes and keeps fictional examples profile scoped', () => {
    expect(new Set(exploreModes.map((m) => m.id)).size).toBe(5);
    const samples = sampleMoments('nina');
    expect(samples).toHaveLength(12);
    expect(
      samples.every((m) => m.profileId === 'nina' && m.createdByUid === 'fictional-example'),
    ).toBe(true);
    expect(samples.some((m) => m.attachments.some((a) => a.kind === 'audio'))).toBe(true);
  });
  it('draws only actual shared-tag connections, including an isolated untagged memory', () => {
    const [a, b, c] = sampleMoments('me');
    a.tagIds = ['funny'];
    b.tagIds = ['funny', 'outing'];
    c.tagIds = [];
    expect(sharedTagLinks([a, b, c])).toEqual([[0, 1]]);
    expect(sharedTagLinks([])).toEqual([]);
  });
  it('never repeats lucky draws until the caller resets, and handles zero or one moment', () => {
    const memories = sampleMoments('me'),
      seen: string[] = [];
    for (let i = 0; i < memories.length; i++) {
      const next = pickUnseen(memories, seen, () => 0.99)!;
      expect(seen).not.toContain(next.id);
      seen.push(next.id);
    }
    expect(pickUnseen(memories, seen)).toBeNull();
    expect(pickUnseen([], [])).toBeNull();
    expect(pickUnseen([memories[0]], [])?.id).toBe(memories[0].id);
  });
});

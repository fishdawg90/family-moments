import type { Moment } from './types';
import { makeTag } from './domain';

export const exploreModes = [
  {
    id: 'scrapbook',
    name: 'Scrapbook',
    symbol: '▧',
    intro: 'Little scraps of a life together.',
    description: 'A playful wall of photos, personal notes and tiny keepsakes.',
  },
  {
    id: 'sky',
    name: 'Night Sky',
    symbol: '✧',
    intro: 'See the threads between your memories.',
    description: 'Each memory is a star. Shared tags draw the constellations.',
  },
  {
    id: 'river',
    name: 'Story River',
    symbol: '〰',
    intro: 'Follow the days that made you.',
    description: 'Wander downstream through dates, small firsts and ordinary lovely days.',
  },
  {
    id: 'radio',
    name: 'Listening Room',
    symbol: '◉',
    intro: 'Some things are better heard again.',
    description: 'A private record collection of voices, giggles and sounds worth keeping.',
  },
  {
    id: 'lucky',
    name: 'Lucky Dip',
    symbol: '✉',
    intro: 'Let an ordinary day surprise you.',
    description: 'Pick a folded memory, open it slowly, then reach for another.',
  },
] as const;
export type ExploreMode = (typeof exploreModes)[number]['id'];
export function sharedTagLinks(moments: Moment[]) {
  const links: Array<[number, number]> = [];
  for (let i = 0; i < moments.length; i++)
    for (let j = i + 1; j < moments.length; j++)
      if (moments[i].tagIds.some((id) => moments[j].tagIds.includes(id))) links.push([i, j]);
  return links;
}
export function pickUnseen(moments: Moment[], seen: string[], random = Math.random) {
  const pool = moments.filter((m) => !seen.includes(m.id));
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] || null;
}
export function sampleMoments(profileId: string): Moment[] {
  const stories = [
    ['Said “butterfly”, then looked so pleased about it.', 'First word', 'audio'],
    ['Rain boots, a very large puddle, and absolutely no regrets.', 'Outing', 'image'],
    ['A sleepy little giggle during the bedtime story.', 'Sweet moment', 'audio'],
    ['We called it a picnic. Mostly we chased the napkins.', 'Funny', 'image'],
    ['The first wobbly steps across the kitchen.', 'Milestone', 'video'],
    ['An ordinary morning, held onto a little longer.', 'Sweet moment', ''],
    ['A tiny drawing with an enormous story behind it.', 'Sweet moment', 'document'],
    ['The longest walk yet. With plenty of snack stops.', 'Outing', 'image'],
    ['“Again!” The smallest word, the biggest enthusiasm.', 'First word', 'audio'],
    ['A train ride, a window seat, a whole world going past.', 'Travel', 'image'],
    ['Made everyone laugh without meaning to.', 'Funny', ''],
    ['A little brave thing that deserves remembering.', 'Milestone', ''],
  ];
  return stories.map(([text, label, kind], i) => {
    const at = new Date(Date.UTC(2026, Math.floor(i / 2), 3 + i * 2, 12)).toISOString();
    return {
      id: `example-${i}`,
      profileId,
      text,
      tagIds: [makeTag(label).id, ...(i % 3 === 0 ? [makeTag('Sweet moment').id] : [])].filter(
        (id, index, list) => list.indexOf(id) === index,
      ),
      eventAt: at,
      createdAt: at,
      updatedAt: at,
      createdByUid: 'fictional-example',
      updatedByUid: 'fictional-example',
      revision: 1,
      deletedAt: null,
      schemaVersion: 1,
      lastOpId: 'example',
      attachments: kind
        ? [
            {
              id: `example-media-${i}`,
              kind: kind as 'image' | 'audio' | 'video' | 'document',
              name: kind === 'audio' ? 'Illustrative sound.wav' : 'Illustrative attachment',
              mime: kind === 'audio' ? 'audio/wav' : '',
              size: 0,
              hash: '',
              path: '',
              remote: false,
            },
          ]
        : [],
    };
  });
}
// A quiet generated chime for sample playback; never presented as a real voice.
export function sampleSound() {
  const rate = 8000,
    count = rate,
    data = new Uint8Array(44 + count * 2),
    view = new DataView(data.buffer);
  const word = (at: number, value: string) =>
    [...value].forEach((c, i) => (data[at + i] = c.charCodeAt(0)));
  word(0, 'RIFF');
  view.setUint32(4, data.length - 8, true);
  word(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  word(36, 'data');
  view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++)
    view.setInt16(
      44 + i * 2,
      Math.sin((i / rate) * 440 * Math.PI * 2) * Math.exp((-i / rate) * 5) * 2800,
      true,
    );
  let binary = '';
  for (const byte of data) binary += String.fromCharCode(byte);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

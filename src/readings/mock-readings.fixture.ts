import type { ReadingSummary } from './reading-summary.schema';

export const MOCK_READINGS: readonly ReadingSummary[] = [
  {
    id: 'mock-reading-4',
    readAt: '2026-09-18T19:42:00.000Z',
    topic: 'career',
    spread: 'three-card',
    cards: [
      { name: 'Eight of Pentacles', reversed: false },
      { name: 'The Chariot', reversed: true },
      { name: 'Ace of Wands', reversed: false },
    ],
    summary:
      'Patient craft is paying off, but forcing the pace stalls it; a new spark is close.',
  },
  {
    id: 'mock-reading-3',
    readAt: '2026-09-02T08:15:00.000Z',
    topic: 'relationships',
    spread: 'single',
    cards: [{ name: 'Two of Cups', reversed: false }],
    summary:
      'A mutual connection deepens when both sides say plainly what they want.',
  },
  {
    id: 'mock-reading-2',
    readAt: '2026-08-21T22:03:00.000Z',
    topic: 'career',
    spread: 'three-card',
    cards: [
      { name: 'Five of Swords', reversed: false },
      { name: 'The Hermit', reversed: false },
      { name: 'Six of Pentacles', reversed: true },
    ],
    summary:
      'A tense team conflict invites stepping back before choosing a side.',
  },
  {
    id: 'mock-reading-1',
    readAt: '2026-08-04T12:30:00.000Z',
    topic: 'personal growth',
    spread: 'single',
    cards: [{ name: 'The Star', reversed: false }],
    summary:
      'Recovery after a hard season; small hopeful habits matter more than big plans.',
  },
];

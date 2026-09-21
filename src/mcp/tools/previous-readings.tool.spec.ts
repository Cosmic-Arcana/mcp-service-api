import { MockReadingHistoryAdapter } from '../../readings/mock-reading-history.adapter';
import { MOCK_READINGS } from '../../readings/mock-readings.fixture';
import { ReadingHistoryPort } from '../../readings/reading-history.port';
import { PreviousReadingsTool, previousReadingsOutputSchema } from './previous-readings.tool';

describe('PreviousReadingsTool', () => {
  it('returns the most recent readings up to the requested limit', async () => {
    const tool = new PreviousReadingsTool(new MockReadingHistoryAdapter());

    const result = await tool.handle(2);

    const { readings } = previousReadingsOutputSchema.parse(result.structuredContent);
    expect(readings.map((reading) => reading.id)).toEqual(['mock-reading-4', 'mock-reading-3']);
  });

  it('mirrors the structured output in a text block for clients without structured content support', async () => {
    const tool = new PreviousReadingsTool(new MockReadingHistoryAdapter());

    const result = await tool.handle(1);

    const [block] = result.content;
    expect(block.type).toBe('text');
    expect(JSON.parse(block.type === 'text' ? block.text : '')).toEqual(result.structuredContent);
  });

  it('passes the limit to the history port', async () => {
    const findRecent = jest.fn().mockResolvedValue([]);
    const history: ReadingHistoryPort = { findRecent };
    const tool = new PreviousReadingsTool(history);

    await tool.handle(7);

    expect(findRecent).toHaveBeenCalledWith(7);
  });

  it('keeps the mock fixture valid against the advertised output schema', () => {
    expect(() => previousReadingsOutputSchema.parse({ readings: MOCK_READINGS })).not.toThrow();
  });
});

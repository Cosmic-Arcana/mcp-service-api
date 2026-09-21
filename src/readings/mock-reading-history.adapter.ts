import { Injectable } from '@nestjs/common';
import { ReadingHistoryPort } from './reading-history.port';
import type { ReadingSummary } from './reading-summary.schema';
import { MOCK_READINGS } from './mock-readings.fixture';

@Injectable()
export class MockReadingHistoryAdapter implements ReadingHistoryPort {
  findRecent(limit: number): Promise<ReadingSummary[]> {
    return Promise.resolve(MOCK_READINGS.slice(0, limit));
  }
}

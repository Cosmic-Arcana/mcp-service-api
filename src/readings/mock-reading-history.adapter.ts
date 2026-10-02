import { Injectable } from '@nestjs/common';
import { ReadingHistoryPort } from './reading-history.port';
import type { ReadingSummaryV1 } from '@cosmic-arcana/sdk';
import { MOCK_READINGS } from './mock-readings.fixture';

@Injectable()
export class MockReadingHistoryAdapter implements ReadingHistoryPort {
  findRecent(limit: number): Promise<ReadingSummaryV1[]> {
    return Promise.resolve(MOCK_READINGS.slice(0, limit));
  }
}

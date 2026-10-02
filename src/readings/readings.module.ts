import { Module } from '@nestjs/common';
import { ReadingHistoryPort } from './reading-history.port';
import { MockReadingHistoryAdapter } from './mock-reading-history.adapter';

@Module({
  providers: [{ provide: ReadingHistoryPort, useClass: MockReadingHistoryAdapter }],
  exports: [ReadingHistoryPort],
})
export class ReadingsModule {}

import { Module } from '@nestjs/common';
import { SnapshotsController } from './snapshots.controller.js';
import { SnapshotsService } from './snapshots.service.js';

@Module({
  controllers: [SnapshotsController],
  providers: [SnapshotsService],
  exports: [SnapshotsService],
})
export class SnapshotsModule {}

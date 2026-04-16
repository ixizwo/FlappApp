import { Module } from '@nestjs/common';
import { SnapshotsModule } from '../snapshots/snapshots.module.js';
import { DraftsController } from './drafts.controller.js';
import { DraftsService } from './drafts.service.js';

@Module({
  imports: [SnapshotsModule],
  controllers: [DraftsController],
  providers: [DraftsService],
  exports: [DraftsService],
})
export class DraftsModule {}

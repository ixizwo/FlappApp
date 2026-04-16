import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { SnapshotCreateSchema } from '@flappapp/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { SnapshotsService } from './snapshots.service.js';

@Controller('snapshots')
export class SnapshotsController {
  constructor(private readonly svc: SnapshotsService) {}

  @Get()
  list(@Query('domainId') domainId: string) {
    return this.svc.list(domainId);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Post()
  create(
    @Query('domainId') domainId: string,
    @Body(new ZodValidationPipe(SnapshotCreateSchema))
    dto: ReturnType<typeof SnapshotCreateSchema.parse>,
  ) {
    return this.svc.create(domainId, dto);
  }

  /** Diff two snapshots against each other. */
  @Get('diff/:beforeId/:afterId')
  diff(
    @Param('beforeId') beforeId: string,
    @Param('afterId') afterId: string,
  ) {
    return this.svc.diff(beforeId, afterId);
  }

  /** Diff a single snapshot against the current live model. */
  @Get(':id/diff-live')
  diffLive(@Param('id') id: string) {
    return this.svc.diffAgainstLive(id);
  }

  /** The current live payload — used by the web app to diff in the browser. */
  @Get('live/:domainId')
  live(@Param('domainId') domainId: string) {
    return this.svc.captureLive(domainId);
  }
}

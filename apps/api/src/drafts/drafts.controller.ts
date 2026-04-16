import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { DraftCreateSchema, DraftUpdateSchema } from '@flappapp/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DraftsService } from './drafts.service.js';

@Controller('drafts')
export class DraftsController {
  constructor(private readonly svc: DraftsService) {}

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
    @Body(new ZodValidationPipe(DraftCreateSchema))
    dto: ReturnType<typeof DraftCreateSchema.parse>,
  ) {
    return this.svc.create(domainId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(DraftUpdateSchema))
    dto: ReturnType<typeof DraftUpdateSchema.parse>,
  ) {
    return this.svc.update(id, dto);
  }

  @Get(':id/preview-promote')
  previewPromote(@Param('id') id: string) {
    return this.svc.previewPromote(id);
  }

  @Post(':id/promote')
  promote(@Param('id') id: string) {
    return this.svc.promote(id);
  }

  @Post(':id/discard')
  discard(@Param('id') id: string) {
    return this.svc.discard(id);
  }
}

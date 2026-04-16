import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TagAssignmentSchema, TagUpdateSchema } from '@flappapp/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { TagsService } from './tags.service.js';

const CreateTagSchema = z.object({
  domainId: z.string().min(1),
  name: z.string().min(1).max(100),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'color must be a 6-digit hex')
    .optional(),
});
type CreateTagDto = z.infer<typeof CreateTagSchema>;

@Controller('tags')
export class TagsController {
  constructor(private readonly svc: TagsService) {}

  @Get()
  list(@Query('domainId') domainId: string) {
    return this.svc.list(domainId);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateTagSchema))
    dto: CreateTagDto,
  ) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(TagUpdateSchema))
    dto: ReturnType<typeof TagUpdateSchema.parse>,
  ) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
  }

  @Post('assign')
  assign(
    @Body(new ZodValidationPipe(TagAssignmentSchema))
    dto: ReturnType<typeof TagAssignmentSchema.parse>,
  ) {
    return this.svc.assignBulk(dto);
  }
}

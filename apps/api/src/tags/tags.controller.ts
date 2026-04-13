import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
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

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
  }
}

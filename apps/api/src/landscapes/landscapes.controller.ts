import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { LandscapesService } from './landscapes.service.js';

const CreateLandscapeSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
});
type CreateLandscapeDto = z.infer<typeof CreateLandscapeSchema>;

@Controller('landscapes')
export class LandscapesController {
  constructor(private readonly svc: LandscapesService) {}

  @Get()
  list(@Query('organizationId') organizationId?: string) {
    return this.svc.list(organizationId);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateLandscapeSchema))
    dto: CreateLandscapeDto,
  ) {
    return this.svc.create(dto);
  }
}

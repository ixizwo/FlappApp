import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { OrganizationsService } from './organizations.service.js';

const CreateOrganizationSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/, 'slug must be kebab-case'),
});
type CreateOrganizationDto = z.infer<typeof CreateOrganizationSchema>;

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly svc: OrganizationsService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateOrganizationSchema))
    dto: CreateOrganizationDto,
  ) {
    return this.svc.create(dto);
  }
}

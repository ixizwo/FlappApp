import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DomainsService } from './domains.service.js';

const CreateDomainSchema = z.object({
  landscapeId: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  ownerTeamId: z.string().min(1).optional(),
});
type CreateDomainDto = z.infer<typeof CreateDomainSchema>;

@Controller('domains')
export class DomainsController {
  constructor(private readonly svc: DomainsService) {}

  @Get()
  list(@Query('landscapeId') landscapeId?: string) {
    return this.svc.list(landscapeId);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateDomainSchema))
    dto: CreateDomainDto,
  ) {
    return this.svc.create(dto);
  }
}

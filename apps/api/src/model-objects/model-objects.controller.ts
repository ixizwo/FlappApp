import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ModelObjectCreateSchema,
  ModelObjectUpdateSchema,
  ObjectStatus,
  ObjectType,
} from '@flappapp/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ModelObjectsService } from './model-objects.service.js';

@Controller('model-objects')
export class ModelObjectsController {
  constructor(private readonly svc: ModelObjectsService) {}

  /**
   * List objects in a Domain with optional filters. The Domain scope is
   * required — there is no "list across the whole workspace" use case
   * because Domains are the unit of tenancy / RBAC.
   */
  @Get()
  list(
    @Query('domainId') domainId: string,
    @Query('type') type?: ObjectType,
    @Query('status') status?: ObjectStatus,
    @Query('parentId') parentId?: string,
    @Query('techChoiceId') techChoiceId?: string,
    @Query('hasDescription') hasDescription?: string,
    @Query('search') search?: string,
  ) {
    if (!domainId) {
      throw new NotFoundException('domainId query param is required');
    }
    return this.svc.list({
      domainId,
      ...(type !== undefined && { type }),
      ...(status !== undefined && { status }),
      ...(parentId !== undefined && {
        parentId: parentId === 'null' ? null : parentId,
      }),
      ...(techChoiceId !== undefined && { techChoiceId }),
      ...(hasDescription !== undefined && {
        hasDescription: hasDescription === 'true',
      }),
      ...(search !== undefined && { search }),
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Get(':id/deletion-impact')
  deletionImpact(@Param('id') id: string) {
    return this.svc.deletionImpact(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(ModelObjectCreateSchema))
    dto: ReturnType<typeof ModelObjectCreateSchema.parse>,
  ) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ModelObjectUpdateSchema))
    dto: ReturnType<typeof ModelObjectUpdateSchema.parse>,
  ) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
  }
}

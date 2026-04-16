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
import {
  FlowCreateSchema,
  FlowStepCreateSchema,
  FlowStepUpdateSchema,
  FlowUpdateSchema,
} from '@flappapp/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { FlowsService } from './flows.service.js';

@Controller('flows')
export class FlowsController {
  constructor(private readonly svc: FlowsService) {}

  @Get()
  list(@Query('diagramId') diagramId: string) {
    return this.svc.listByDiagram(diagramId);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Post()
  create(
    @Query('diagramId') diagramId: string,
    @Body(new ZodValidationPipe(FlowCreateSchema))
    dto: ReturnType<typeof FlowCreateSchema.parse>,
  ) {
    return this.svc.create(diagramId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(FlowUpdateSchema))
    dto: ReturnType<typeof FlowUpdateSchema.parse>,
  ) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
  }

  // ── Steps ────────────────────────────────────────────────────────

  @Post(':id/steps')
  addStep(
    @Param('id') flowId: string,
    @Body(new ZodValidationPipe(FlowStepCreateSchema))
    dto: ReturnType<typeof FlowStepCreateSchema.parse>,
  ) {
    return this.svc.addStep(flowId, dto);
  }

  @Patch('steps/:stepId')
  updateStep(
    @Param('stepId') stepId: string,
    @Body(new ZodValidationPipe(FlowStepUpdateSchema))
    dto: ReturnType<typeof FlowStepUpdateSchema.parse>,
  ) {
    return this.svc.updateStep(stepId, dto);
  }

  @Delete('steps/:stepId')
  @HttpCode(204)
  async removeStep(@Param('stepId') stepId: string) {
    await this.svc.removeStep(stepId);
  }
}

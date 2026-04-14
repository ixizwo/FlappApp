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
  DiagramCreateSchema,
  DiagramEdgeCreateSchema,
  DiagramEdgeUpdateSchema,
  DiagramNodeCreateSchema,
  DiagramNodeUpdateSchema,
  DiagramUpdateSchema,
  DiagramZoomOverrideUpsertSchema,
} from '@flappapp/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DiagramsService } from './diagrams.service.js';

/**
 * REST surface for diagrams. Node + edge routes are nested under the
 * owning diagram so a 404 on the diagram id happens naturally.
 */
@Controller('diagrams')
export class DiagramsController {
  constructor(private readonly svc: DiagramsService) {}

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
    @Body(new ZodValidationPipe(DiagramCreateSchema))
    dto: ReturnType<typeof DiagramCreateSchema.parse>,
  ) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(DiagramUpdateSchema))
    dto: ReturnType<typeof DiagramUpdateSchema.parse>,
  ) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
  }

  // ── Nodes ────────────────────────────────────────────────────────

  @Post(':id/nodes')
  addNode(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(DiagramNodeCreateSchema))
    dto: ReturnType<typeof DiagramNodeCreateSchema.parse>,
  ) {
    return this.svc.addNode(id, dto);
  }

  @Patch('nodes/:nodeId')
  updateNode(
    @Param('nodeId') nodeId: string,
    @Body(new ZodValidationPipe(DiagramNodeUpdateSchema))
    dto: ReturnType<typeof DiagramNodeUpdateSchema.parse>,
  ) {
    return this.svc.updateNode(nodeId, dto);
  }

  @Delete('nodes/:nodeId')
  @HttpCode(204)
  async removeNode(@Param('nodeId') nodeId: string) {
    await this.svc.removeNode(nodeId);
  }

  // ── Edges ────────────────────────────────────────────────────────

  @Post(':id/edges')
  addEdge(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(DiagramEdgeCreateSchema))
    dto: ReturnType<typeof DiagramEdgeCreateSchema.parse>,
  ) {
    return this.svc.addEdge(id, dto);
  }

  @Patch('edges/:edgeId')
  updateEdge(
    @Param('edgeId') edgeId: string,
    @Body(new ZodValidationPipe(DiagramEdgeUpdateSchema))
    dto: ReturnType<typeof DiagramEdgeUpdateSchema.parse>,
  ) {
    return this.svc.updateEdge(edgeId, dto);
  }

  @Delete('edges/:edgeId')
  @HttpCode(204)
  async removeEdge(@Param('edgeId') edgeId: string) {
    await this.svc.removeEdge(edgeId);
  }

  // ── Drill-down + zoom overrides ──────────────────────────────────

  @Get(':id/drilldown/:objectId')
  drilldown(
    @Param('id') diagramId: string,
    @Param('objectId') objectId: string,
  ) {
    return this.svc.resolveDrilldown(diagramId, objectId);
  }

  @Get(':id/zoom-overrides')
  listZoomOverrides(@Param('id') diagramId: string) {
    return this.svc.listZoomOverrides(diagramId);
  }

  @Post(':id/zoom-overrides')
  upsertZoomOverride(
    @Param('id') diagramId: string,
    @Body(new ZodValidationPipe(DiagramZoomOverrideUpsertSchema))
    dto: ReturnType<typeof DiagramZoomOverrideUpsertSchema.parse>,
  ) {
    return this.svc.upsertZoomOverride(diagramId, dto);
  }

  @Delete(':id/zoom-overrides/:objectId')
  @HttpCode(204)
  async removeZoomOverride(
    @Param('id') diagramId: string,
    @Param('objectId') objectId: string,
  ) {
    await this.svc.removeZoomOverride(diagramId, objectId);
  }
}

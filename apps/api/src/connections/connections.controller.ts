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
  ConnectionCreateSchema,
  ConnectionDirection,
  LineShape,
  ObjectStatus,
} from '@flappapp/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ConnectionsService } from './connections.service.js';

const UpdateConnectionSchema = z.object({
  direction: z.nativeEnum(ConnectionDirection).optional(),
  status: z.nativeEnum(ObjectStatus).optional(),
  lineShape: z.nativeEnum(LineShape).optional(),
  description: z.string().max(500).optional(),
  viaId: z.string().min(1).nullable().optional(),
});

@Controller('connections')
export class ConnectionsController {
  constructor(private readonly svc: ConnectionsService) {}

  @Get()
  list(
    @Query('domainId') domainId?: string,
    @Query('senderId') senderId?: string,
    @Query('receiverId') receiverId?: string,
    @Query('viaId') viaId?: string,
    @Query('status') status?: ObjectStatus,
  ) {
    return this.svc.list({
      ...(domainId !== undefined && { domainId }),
      ...(senderId !== undefined && { senderId }),
      ...(receiverId !== undefined && { receiverId }),
      ...(viaId !== undefined && { viaId }),
      ...(status !== undefined && { status }),
    });
  }

  @Get('implied')
  implied(
    @Query('domainId') domainId: string,
    @Query('level') level: string,
  ) {
    const parsed = Number(level);
    if (parsed !== 1 && parsed !== 2 && parsed !== 3) {
      throw new Error('level must be 1, 2, or 3');
    }
    return this.svc.resolveImplied(domainId, parsed);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(ConnectionCreateSchema))
    dto: ReturnType<typeof ConnectionCreateSchema.parse>,
  ) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateConnectionSchema))
    dto: z.infer<typeof UpdateConnectionSchema>,
  ) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
  }
}

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
  GroupCreateSchema,
  GroupMembershipSchema,
  GroupUpdateSchema,
} from '@flappapp/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { GroupsService } from './groups.service.js';

@Controller('groups')
export class GroupsController {
  constructor(private readonly svc: GroupsService) {}

  @Get()
  list(@Query('diagramId') diagramId: string) {
    return this.svc.list(diagramId);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Post()
  create(
    @Query('diagramId') diagramId: string,
    @Body(new ZodValidationPipe(GroupCreateSchema))
    dto: ReturnType<typeof GroupCreateSchema.parse>,
  ) {
    return this.svc.create(diagramId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(GroupUpdateSchema))
    dto: ReturnType<typeof GroupUpdateSchema.parse>,
  ) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
  }

  @Post('membership')
  assignMembership(
    @Body(new ZodValidationPipe(GroupMembershipSchema))
    dto: ReturnType<typeof GroupMembershipSchema.parse>,
  ) {
    return this.svc.assignMembership(dto);
  }
}

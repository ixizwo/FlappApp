import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  TechChoiceCreateSchema,
  TechChoiceUpdateSchema,
} from '@flappapp/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { TechChoicesService } from './tech-choices.service.js';

@Controller('tech-choices')
export class TechChoicesController {
  constructor(private readonly svc: TechChoicesService) {}

  @Get()
  list(@Query('category') category?: string) {
    return this.svc.list(category);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(TechChoiceCreateSchema))
    dto: ReturnType<typeof TechChoiceCreateSchema.parse>,
  ) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(TechChoiceUpdateSchema))
    dto: ReturnType<typeof TechChoiceUpdateSchema.parse>,
  ) {
    return this.svc.update(id, dto);
  }
}

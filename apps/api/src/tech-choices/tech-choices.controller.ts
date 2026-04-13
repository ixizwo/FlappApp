import { Controller, Get, Query } from '@nestjs/common';
import { TechChoicesService } from './tech-choices.service.js';

@Controller('tech-choices')
export class TechChoicesController {
  constructor(private readonly svc: TechChoicesService) {}

  @Get()
  list(@Query('category') category?: string) {
    return this.svc.list(category);
  }
}

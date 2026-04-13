import { Module } from '@nestjs/common';
import { TechChoicesController } from './tech-choices.controller.js';
import { TechChoicesService } from './tech-choices.service.js';

@Module({
  controllers: [TechChoicesController],
  providers: [TechChoicesService],
})
export class TechChoicesModule {}

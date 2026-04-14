import { Module } from '@nestjs/common';
import { DiagramsController } from './diagrams.controller.js';
import { DiagramsService } from './diagrams.service.js';

@Module({
  controllers: [DiagramsController],
  providers: [DiagramsService],
  exports: [DiagramsService],
})
export class DiagramsModule {}

import { Module } from '@nestjs/common';
import { ModelObjectsController } from './model-objects.controller.js';
import { ModelObjectsService } from './model-objects.service.js';

@Module({
  controllers: [ModelObjectsController],
  providers: [ModelObjectsService],
  exports: [ModelObjectsService],
})
export class ModelObjectsModule {}

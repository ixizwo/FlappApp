import { Module } from '@nestjs/common';
import { LandscapesController } from './landscapes.controller.js';
import { LandscapesService } from './landscapes.service.js';

@Module({
  controllers: [LandscapesController],
  providers: [LandscapesService],
})
export class LandscapesModule {}

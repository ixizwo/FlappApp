import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok'; uptime: number; now: string } {
    return {
      status: 'ok',
      uptime: process.uptime(),
      now: new Date().toISOString(),
    };
  }
}

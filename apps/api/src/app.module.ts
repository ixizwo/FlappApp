import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller.js';

/**
 * Root application module.
 *
 * Phase 0 ships only the HealthController so the service is bootable and
 * CI can exercise a full build. Phase 1 will add:
 *   - PrismaModule
 *   - OrganizationsModule, LandscapesModule, DomainsModule
 *   - ModelObjectsModule, ConnectionsModule
 *   - AuthModule (Auth.js adapter)
 */
@Module({
  imports: [],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { ConnectionsModule } from './connections/connections.module.js';
import { DiagramsModule } from './diagrams/diagrams.module.js';
import { DomainsModule } from './domains/domains.module.js';
import { HealthController } from './health/health.controller.js';
import { LandscapesModule } from './landscapes/landscapes.module.js';
import { ModelObjectsModule } from './model-objects/model-objects.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { TagsModule } from './tags/tags.module.js';
import { TechChoicesModule } from './tech-choices/tech-choices.module.js';

/**
 * Root application module.
 *
 * Phase 1 adds the full model CRUD stack on top of the Phase 0 health
 * endpoint. Auth, diagrams, flows, groups, snapshots, and collaboration
 * land in later phases (see PLAN.md).
 */
@Module({
  imports: [
    PrismaModule,
    OrganizationsModule,
    LandscapesModule,
    DomainsModule,
    ModelObjectsModule,
    ConnectionsModule,
    DiagramsModule,
    TagsModule,
    TechChoicesModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}

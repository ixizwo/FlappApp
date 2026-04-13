/**
 * Database seed.
 *
 * Produces a small but realistic C4 landscape that exercises every object
 * type, a via-routed connection, a tag, and a couple of tech choices.
 * Running the seed a second time is a no-op — we look up by scope-unique
 * fields and skip if already present (Prisma cannot upsert compound
 * uniques containing a nullable column).
 *
 * Run with: pnpm --filter @flappapp/api prisma db seed
 */
import { ObjectType, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function upsertModelObject(args: {
  domainId: string;
  parentId: string | null;
  type: ObjectType;
  name: string;
  internal?: boolean;
  displayDescription?: string;
  techChoiceId?: string;
}) {
  const existing = await prisma.modelObject.findFirst({
    where: {
      domainId: args.domainId,
      parentId: args.parentId,
      name: args.name,
    },
  });
  if (existing) return existing;
  return prisma.modelObject.create({
    data: {
      domainId: args.domainId,
      parentId: args.parentId,
      type: args.type,
      name: args.name,
      ...(args.internal !== undefined && { internal: args.internal }),
      ...(args.displayDescription !== undefined && {
        displayDescription: args.displayDescription,
      }),
      ...(args.techChoiceId !== undefined && { techChoiceId: args.techChoiceId }),
    },
  });
}

async function upsertConnection(
  senderId: string,
  receiverId: string,
  viaId: string | null,
  description: string,
) {
  const existing = await prisma.connection.findFirst({
    where: { senderId, receiverId, viaId },
  });
  if (existing) return existing;
  return prisma.connection.create({
    data: { senderId, receiverId, viaId, description },
  });
}

async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: 'acme' },
    update: {},
    create: { name: 'Acme', slug: 'acme' },
  });

  const landscape = await prisma.landscape.upsert({
    where: { organizationId_name: { organizationId: org.id, name: 'Retail' } },
    update: {},
    create: {
      organizationId: org.id,
      name: 'Retail',
      description: 'Customer-facing retail platform',
    },
  });

  const domain = await prisma.domain.upsert({
    where: { landscapeId_name: { landscapeId: landscape.id, name: 'Checkout' } },
    update: {},
    create: {
      landscapeId: landscape.id,
      name: 'Checkout',
      description: 'Cart, payment, and order fulfilment',
    },
  });

  // Tech choices (seeded catalog)
  const [react, postgres, kafka, nestjs] = await Promise.all([
    prisma.techChoice.upsert({
      where: { name: 'React' },
      update: {},
      create: { name: 'React', category: 'Frontend', icon: 'react' },
    }),
    prisma.techChoice.upsert({
      where: { name: 'PostgreSQL' },
      update: {},
      create: { name: 'PostgreSQL', category: 'Database', icon: 'postgres' },
    }),
    prisma.techChoice.upsert({
      where: { name: 'Kafka' },
      update: {},
      create: { name: 'Kafka', category: 'Messaging', icon: 'kafka' },
    }),
    prisma.techChoice.upsert({
      where: { name: 'NestJS' },
      update: {},
      create: { name: 'NestJS', category: 'Backend', icon: 'nestjs' },
    }),
  ]);

  // Tag
  const riskTag = await prisma.tag.upsert({
    where: { domainId_name: { domainId: domain.id, name: 'High Risk' } },
    update: {},
    create: { domainId: domain.id, name: 'High Risk', color: '#ef4444' },
  });

  // Level 1 — Context
  const customer = await upsertModelObject({
    domainId: domain.id,
    parentId: null,
    type: ObjectType.ACTOR,
    name: 'Customer',
    internal: false,
    displayDescription: 'A retail customer checking out an order',
  });

  const checkoutSystem = await upsertModelObject({
    domainId: domain.id,
    parentId: null,
    type: ObjectType.SYSTEM,
    name: 'Checkout System',
    displayDescription: 'Handles the cart → payment → order pipeline',
  });

  const paymentsSystem = await upsertModelObject({
    domainId: domain.id,
    parentId: null,
    type: ObjectType.SYSTEM,
    name: 'Payments System',
    internal: false,
    displayDescription: 'External payment provider',
  });

  // Level 2 — Containers inside Checkout System
  const webApp = await upsertModelObject({
    domainId: domain.id,
    parentId: checkoutSystem.id,
    type: ObjectType.APP,
    name: 'Web App',
    displayDescription: 'React SPA served from CloudFront',
    techChoiceId: react.id,
  });

  const checkoutApi = await upsertModelObject({
    domainId: domain.id,
    parentId: checkoutSystem.id,
    type: ObjectType.APP,
    name: 'Checkout API',
    displayDescription: 'NestJS REST API',
    techChoiceId: nestjs.id,
  });

  const ordersDb = await upsertModelObject({
    domainId: domain.id,
    parentId: checkoutSystem.id,
    type: ObjectType.STORE,
    name: 'Orders DB',
    displayDescription: 'Postgres — orders, line items, payment refs',
    techChoiceId: postgres.id,
  });

  const kafkaBus = await upsertModelObject({
    domainId: domain.id,
    parentId: checkoutSystem.id,
    type: ObjectType.STORE,
    name: 'Order Events Topic',
    displayDescription: 'Kafka topic for downstream consumers',
    techChoiceId: kafka.id,
  });

  // Level 3 — Components inside Checkout API
  const cartController = await upsertModelObject({
    domainId: domain.id,
    parentId: checkoutApi.id,
    type: ObjectType.COMPONENT,
    name: 'CartController',
    displayDescription: 'HTTP handler for cart operations',
  });

  const paymentService = await upsertModelObject({
    domainId: domain.id,
    parentId: checkoutApi.id,
    type: ObjectType.COMPONENT,
    name: 'PaymentService',
    displayDescription: 'Charges the external payment provider',
  });

  // Tag the high-risk payment component
  await prisma.modelObjectTag.upsert({
    where: {
      modelObjectId_tagId: {
        modelObjectId: paymentService.id,
        tagId: riskTag.id,
      },
    },
    update: {},
    create: { modelObjectId: paymentService.id, tagId: riskTag.id },
  });

  // Connections. Two of these are level-3 / level-2 so the implied-connection
  // resolver has something meaningful to project up to L1.
  await upsertConnection(customer.id, webApp.id, null, 'Places an order');
  await upsertConnection(webApp.id, checkoutApi.id, null, 'REST /checkout');
  await upsertConnection(paymentService.id, paymentsSystem.id, null, 'Charges card');
  await upsertConnection(cartController.id, ordersDb.id, null, 'Persists order');
  // Via a Kafka topic — exercises PRD §4.1 "Via Property"
  await upsertConnection(
    checkoutApi.id,
    paymentsSystem.id,
    kafkaBus.id,
    'Emits order.paid events',
  );

  // eslint-disable-next-line no-console
  console.log('Seed complete:', {
    organization: org.slug,
    landscape: landscape.name,
    domain: domain.name,
  });
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

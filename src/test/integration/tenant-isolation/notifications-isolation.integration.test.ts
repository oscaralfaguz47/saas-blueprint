import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "../_harness/auth-helpers-mocks";
import {
  applyMigrations,
  createTestPrismaClient,
  disconnectTestPrismaClient,
  resetDb,
  seedTwoTenants,
  startPostgresContainer,
  stopPostgresContainer,
} from "../_harness";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { PrismaClient } from "@prisma/client";

describe("tenant isolation — notifications", () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let userAId: string;
  let userBId: string;
  let notifBId: string;

  beforeAll(async () => {
    const started = await startPostgresContainer();
    container = started.container;
    const { connectionString } = started;

    process.env.DATABASE_URL = connectionString;
    process.env.DATABASE_DIRECT_URL = connectionString;

    applyMigrations(connectionString);

    prisma = createTestPrismaClient(connectionString);
    const { setPrismaClient } = await import("@/server/db");
    setPrismaClient(prisma);

    await resetDb(prisma);
    const seeded = await seedTwoTenants(prisma);
    userAId = seeded.userA.id;
    userBId = seeded.userB.id;

    const { createNotification } = await import(
      "@/server/services/notifications/notification-service"
    );

    await createNotification({
      userId: userAId,
      type: "SUPPORT_TICKET_REPLY",
      title: "For A",
      entityType: "SupportTicket",
      entityId: "ticket-a",
    });

    const outB = await createNotification({
      userId: userBId,
      type: "SUPPORT_TICKET_REPLY",
      title: "For B",
      entityType: "SupportTicket",
      entityId: "ticket-b",
    });
    notifBId = outB.notificationId!;
  }, 120_000);

  afterAll(async () => {
    const { clearPrismaClientOverride } = await import("@/server/db");
    clearPrismaClientOverride();
    await disconnectTestPrismaClient(prisma);
    await stopPostgresContainer(container);
  });

  it("listNotifications for user A does not include user B rows", async () => {
    const { listNotifications } = await import(
      "@/server/services/notifications/notification-service"
    );
    const listA = await listNotifications({ userId: userAId, limit: 20 });
    expect(listA.items.some((i) => i.entityId === "ticket-b")).toBe(false);
    expect(listA.items.some((i) => i.entityId === "ticket-a")).toBe(true);
  });

  it("markNotificationsAsRead for user A cannot mark user B notification ids", async () => {
    const { markNotificationsAsRead } = await import(
      "@/server/services/notifications/notification-service"
    );
    const markOut = await markNotificationsAsRead({
      userId: userAId,
      notificationIds: [notifBId],
    });
    expect(markOut.markedCount).toBe(0);
  });
});

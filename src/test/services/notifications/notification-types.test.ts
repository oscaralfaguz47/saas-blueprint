import { describe, expect, it } from "vitest";
import {
  NotificationType,
  NotificationType as PrismaType,
  NotificationCategory,
} from "@prisma/client";
import { NotificationType as ClientType } from "@/lib/notification-type-constants";
import { getCategoryForType, TYPE_TO_CATEGORY } from "@/server/services/notifications/notification-types";

describe("TYPE_TO_CATEGORY + getCategoryForType", () => {
  it("getCategoryForType returns correct category for each NotificationType", () => {
    expect(getCategoryForType(PrismaType.SUPPORT_TICKET_REPLY)).toBe(
      NotificationCategory.SOCIAL
    );
    expect(getCategoryForType(PrismaType.SUPPORT_TICKET_USER_REPLIED)).toBe(
      NotificationCategory.SOCIAL
    );
    expect(getCategoryForType(PrismaType.SUPPORT_TICKET_STATUS_CHANGED)).toBe(
      NotificationCategory.WORKFLOW
    );
    expect(getCategoryForType(PrismaType.SUPPORT_TICKET_ASSIGNED)).toBe(
      NotificationCategory.WORKFLOW
    );
    expect(getCategoryForType(PrismaType.RECORD_APPROVAL_FULLY_COMPLETED)).toBe(
      NotificationCategory.WORKFLOW
    );
    expect(getCategoryForType(PrismaType.RECORD_FINANCE_ASSIGNED)).toBe(
      NotificationCategory.FINANCE
    );
    expect(getCategoryForType(PrismaType.RECORD_PAYMENT_STATUS_CHANGED)).toBe(
      NotificationCategory.FINANCE
    );
  });

  it("TYPE_TO_CATEGORY has a mapping for every Prisma NotificationType (exhaustive)", () => {
    for (const v of Object.values(PrismaType) as NotificationType[]) {
      expect(TYPE_TO_CATEGORY[v]).toBeDefined();
    }
  });

  it("client-safe NotificationType constants match Prisma enum", () => {
    const prismaKeys = Object.keys(PrismaType)
      .filter((k) => Number.isNaN(Number(k)))
      .sort();
    const clientKeys = Object.keys(ClientType).sort();
    expect(clientKeys).toEqual(prismaKeys);
    for (const k of clientKeys) {
      expect(
        ClientType[k as keyof typeof ClientType] ===
          PrismaType[k as keyof typeof PrismaType]
      ).toBe(true);
    }
  });
});

import "server-only";

import { prisma } from "@/server/db";
import type {
  NotificationChannel,
  DbTx,
  NotificationDeliveryInput,
  NotificationDeliveryResult,
} from "./notification-channel";

/**
 * In-app: persists to `UserNotification`. Uses caller transaction when provided.
 */
export const inAppChannel: NotificationChannel = {
  key: "IN_APP",

  canDeliver: () => true,

  deliver: async (
    input: NotificationDeliveryInput,
    tx?: DbTx
  ): Promise<NotificationDeliveryResult> => {
    const db: DbTx = tx ?? prisma;
    const row = await db.userNotification.create({
      data: {
        userId: input.userId,
        notificationType: input.type,
        category: input.category,
        title: input.title,
        body: input.body ?? null,
        entityType: input.entityType,
        entityId: input.entityId,
        actionUrl: input.actionUrl ?? null,
      },
      select: { id: true },
    });
    return { delivered: true, notificationId: row.id };
  },
};

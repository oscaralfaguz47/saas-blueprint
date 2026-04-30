import "server-only";

import { prisma } from "@/server/db";
import type { NotificationType, NotificationCategory } from "@prisma/client";
import { getCategoryForType } from "./notification-types";
import type { NotificationChannelKey } from "./notification-types";
import { inAppChannel } from "./channels/in-app-channel";
import { emailChannel } from "./channels/email-channel";
import type { NotificationDeliveryInput } from "./channels/notification-channel";
import type { DbTx } from "./channels/notification-channel";

const byKey = {
  IN_APP: inAppChannel,
  EMAIL: emailChannel,
} as const;

function toDeliveryInput(input: {
  userId: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  body?: string | null;
  entityType: string;
  entityId: string;
  actionUrl?: string | null;
}): NotificationDeliveryInput {
  return input;
}

/**
 * Create notifications for one or more channels. `IN_APP` persists; `EMAIL` is stubbed until EPIC.
 */
export async function createNotification(input: {
  userId: string;
  type: NotificationType;
  category?: NotificationCategory;
  title: string;
  body?: string | null;
  entityType: string;
  entityId: string;
  actionUrl?: string | null;
  channels?: NotificationChannelKey[];
  tx?: DbTx;
}): Promise<{
  notificationId: string | null;
  channelsDelivered: NotificationChannelKey[];
  channelsFailed: Array<{ channel: NotificationChannelKey; reason: string }>;
}> {
  const category = input.category ?? getCategoryForType(input.type);
  const channelKeys = input.channels ?? (["IN_APP"] satisfies NotificationChannelKey[]);
  const base = toDeliveryInput({
    userId: input.userId,
    type: input.type,
    category,
    title: input.title,
    body: input.body,
    entityType: input.entityType,
    entityId: input.entityId,
    actionUrl: input.actionUrl,
  });

  const delivered: NotificationChannelKey[] = [];
  const failed: Array<{ channel: NotificationChannelKey; reason: string }> = [];
  let notificationId: string | null = null;

  for (const chKey of channelKeys) {
    const ch = byKey[chKey];
    if (!ch) {
      failed.push({ channel: chKey, reason: "UNKNOWN_CHANNEL" });
      continue;
    }
    if (!ch.canDeliver(base)) {
      failed.push({
        channel: chKey,
        reason: "EMAIL_CHANNEL_NOT_IMPLEMENTED",
      });
      continue;
    }
    const result = await ch.deliver(base, input.tx);
    if (result.delivered) {
      delivered.push(chKey);
      if (chKey === "IN_APP" && result.notificationId) {
        notificationId = result.notificationId;
      }
    } else {
      // Discriminated union: !result.delivered narrows to { delivered: false; reason: string }
      failed.push({ channel: chKey, reason: result.reason });
    }
  }

  return { notificationId, channelsDelivered: delivered, channelsFailed: failed };
}

export async function getUserNotificationById(
  userId: string,
  id: string
): Promise<{ id: string; readAt: Date | null } | null> {
  return prisma.userNotification.findFirst({
    where: { id, userId },
    select: { id: true, readAt: true },
  });
}

export async function markNotificationsAsRead(params: {
  userId: string;
  notificationIds?: string[];
}): Promise<{ markedCount: number }> {
  const result = await prisma.userNotification.updateMany({
    where: {
      userId: params.userId,
      readAt: null,
      ...(params.notificationIds?.length
        ? { id: { in: params.notificationIds } }
        : {}),
    },
    data: { readAt: new Date() },
  });
  return { markedCount: result.count };
}

export async function listUnreadCount(params: { userId: string }): Promise<number> {
  return prisma.userNotification.count({
    where: { userId: params.userId, readAt: null },
  });
}

export async function listNotifications(params: {
  userId: string;
  limit?: number;
  cursor?: string;
}): Promise<{
  items: Array<{
    id: string;
    notificationType: NotificationType;
    category: NotificationCategory;
    title: string;
    body: string | null;
    entityType: string;
    entityId: string;
    actionUrl: string | null;
    readAt: Date | null;
    createdAt: Date;
  }>;
  nextCursor: string | null;
  unreadCount: number;
}> {
  const limit = params.limit ?? 20;
  const whereBase = { userId: params.userId } as const;
  const where = params.cursor
    ? {
        ...whereBase,
        createdAt: { lt: new Date(params.cursor) },
      }
    : whereBase;

  const [unreadCount, rows] = await prisma.$transaction([
    prisma.userNotification.count({
      where: { userId: params.userId, readAt: null },
    }),
    prisma.userNotification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        notificationType: true,
        category: true,
        title: true,
        body: true,
        entityType: true,
        entityId: true,
        actionUrl: true,
        readAt: true,
        createdAt: true,
      },
    }),
  ]);

  const nextCursor =
    rows.length === limit
      ? rows[rows.length - 1]!.createdAt.toISOString()
      : null;

  const items = rows.map((r) => ({
    id: r.id,
    notificationType: r.notificationType,
    category: r.category,
    title: r.title,
    body: r.body,
    entityType: r.entityType,
    entityId: r.entityId,
    actionUrl: r.actionUrl,
    readAt: r.readAt,
    createdAt: r.createdAt,
  }));

  return { items, nextCursor, unreadCount };
}

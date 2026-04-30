import "server-only";

import type { PrismaClient } from "@prisma/client";
import type { NotificationType, NotificationCategory } from "@prisma/client";
import type { NotificationChannelKey } from "../notification-types";

export type DbTx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export type NotificationDeliveryInput = {
  userId: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  body?: string | null;
  entityType: string;
  entityId: string;
  actionUrl?: string | null;
};

export type NotificationDeliveryResult =
  | { delivered: true; notificationId?: string }
  | { delivered: false; reason: string };

/**
 * One physical delivery channel. `IN_APP` = DB row; `EMAIL` = future EPIC.
 */
export interface NotificationChannel {
  readonly key: NotificationChannelKey;
  readonly canDeliver: (input: NotificationDeliveryInput) => boolean;
  readonly deliver: (
    input: NotificationDeliveryInput,
    tx?: DbTx
  ) => Promise<NotificationDeliveryResult>;
}

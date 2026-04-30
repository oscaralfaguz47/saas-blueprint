import "server-only";

import type {
  NotificationChannel,
  NotificationDeliveryInput,
  NotificationDeliveryResult,
} from "./notification-channel";

/**
 * Ephemeral channel. EPIC Phase D will implement `deliver` using invitation-email + email-templates.
 */
export const emailChannel: NotificationChannel = {
  key: "EMAIL",

  canDeliver: () => false,

  deliver: async (
    _input: NotificationDeliveryInput
  ): Promise<NotificationDeliveryResult> => {
    // EPIC Phase D will implement this. See email-templates.ts for existing email infrastructure.
    return { delivered: false, reason: "EMAIL_CHANNEL_NOT_IMPLEMENTED" };
  },
};

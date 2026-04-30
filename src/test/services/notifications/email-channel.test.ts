import { describe, expect, it } from "vitest";
import { NotificationType, NotificationCategory } from "@prisma/client";
import { emailChannel } from "@/server/services/notifications/channels/email-channel";

const baseInput = {
  userId: "u1",
  type: NotificationType.SUPPORT_TICKET_REPLY,
  category: NotificationCategory.SOCIAL,
  title: "t",
  body: null as string | null,
  entityType: "X",
  entityId: "e1",
  actionUrl: null as string | null,
};

describe("emailChannel", () => {
  it("canDeliver returns false", () => {
    expect(emailChannel.canDeliver({ ...baseInput })).toBe(false);
  });

  it("deliver returns EMAIL_CHANNEL_NOT_IMPLEMENTED", async () => {
    const r = await emailChannel.deliver({ ...baseInput });
    expect(r).toEqual({ delivered: false, reason: "EMAIL_CHANNEL_NOT_IMPLEMENTED" });
  });
});

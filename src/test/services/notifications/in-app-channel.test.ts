import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationType, NotificationCategory } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  create: vi.fn().mockResolvedValue({ id: "n1" }),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    userNotification: { create: mocks.create },
  },
}));

import { inAppChannel } from "@/server/services/notifications/channels/in-app-channel";

describe("inAppChannel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockResolvedValue({ id: "n1" });
  });

  it("canDeliver always returns true", () => {
    expect(
      inAppChannel.canDeliver({
        userId: "u1",
        type: NotificationType.SUPPORT_TICKET_REPLY,
        category: NotificationCategory.SOCIAL,
        title: "t",
        entityType: "X",
        entityId: "e1",
      })
    ).toBe(true);
  });

  it("deliver creates UserNotification with correct fields", async () => {
    const r = await inAppChannel.deliver({
      userId: "u1",
      type: NotificationType.SUPPORT_TICKET_REPLY,
      category: NotificationCategory.SOCIAL,
      title: "Hello",
      body: "subj",
      entityType: "SupportTicket",
      entityId: "t1",
      actionUrl: "/x",
    });

    expect(r).toEqual({ delivered: true, notificationId: "n1" });
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        notificationType: NotificationType.SUPPORT_TICKET_REPLY,
        category: NotificationCategory.SOCIAL,
        title: "Hello",
        body: "subj",
        entityType: "SupportTicket",
        entityId: "t1",
        actionUrl: "/x",
      },
      select: { id: true },
    });
  });

  it("deliver uses transaction client when provided", async () => {
    const txCreate = vi.fn().mockResolvedValue({ id: "n2" });
    const tx = { userNotification: { create: txCreate } };

    const r = await inAppChannel.deliver(
      {
        userId: "u1",
        type: NotificationType.SUPPORT_TICKET_ASSIGNED,
        category: NotificationCategory.WORKFLOW,
        title: "t",
        body: null,
        entityType: "SupportTicket",
        entityId: "e1",
        actionUrl: null,
      },
      tx as never
    );

    expect(r).toEqual({ delivered: true, notificationId: "n2" });
    expect(txCreate).toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

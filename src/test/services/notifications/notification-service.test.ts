import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationType, NotificationCategory } from "@prisma/client";
import {
  createNotification,
  getUserNotificationById,
  listNotifications,
  listUnreadCount,
  markNotificationsAsRead,
} from "@/server/services/notifications/notification-service";

const mocks = vi.hoisted(() => ({
  userNotificationCreate: vi.fn(),
  userNotificationUpdateMany: vi.fn(),
  userNotificationCount: vi.fn(),
  userNotificationFindMany: vi.fn(),
  userNotificationFindFirst: vi.fn(),
  $transaction: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    userNotification: {
      create: mocks.userNotificationCreate,
      updateMany: mocks.userNotificationUpdateMany,
      count: mocks.userNotificationCount,
      findMany: mocks.userNotificationFindMany,
      findFirst: mocks.userNotificationFindFirst,
    },
    $transaction: mocks.$transaction,
  },
}));

describe("createNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userNotificationCreate.mockResolvedValue({ id: "n-new" });
  });

  it("default IN_APP writes with category derived from type", async () => {
    await createNotification({
      userId: "u1",
      type: NotificationType.SUPPORT_TICKET_REPLY,
      title: "T",
      body: "B",
      entityType: "SupportTicket",
      entityId: "e1",
    });

    expect(mocks.userNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u1",
          notificationType: NotificationType.SUPPORT_TICKET_REPLY,
          category: NotificationCategory.SOCIAL,
          title: "T",
        }),
      })
    );
  });

  it("explicit category is respected", async () => {
    await createNotification({
      userId: "u1",
      type: NotificationType.SUPPORT_TICKET_REPLY,
      category: NotificationCategory.SECURITY,
      title: "T",
      entityType: "X",
      entityId: "e1",
    });
    expect(mocks.userNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          category: NotificationCategory.SECURITY,
        }),
      })
    );
  });

  it("IN_APP+EMAIL: IN_APP delivered, EMAIL in failed", async () => {
    const r = await createNotification({
      userId: "u1",
      type: NotificationType.SUPPORT_TICKET_REPLY,
      title: "T",
      entityType: "X",
      entityId: "e1",
      channels: ["IN_APP", "EMAIL"],
    });
    expect(r.channelsDelivered).toEqual(["IN_APP"]);
    expect(r.channelsFailed).toEqual([
      { channel: "EMAIL", reason: "EMAIL_CHANNEL_NOT_IMPLEMENTED" },
    ]);
    expect(r.notificationId).toBe("n-new");
  });

  it("passes transaction client to in-app deliver", async () => {
    const txCreate = vi.fn().mockResolvedValue({ id: "tx1" });
    const tx = { userNotification: { create: txCreate } } as const;

    const r = await createNotification({
      userId: "u1",
      type: NotificationType.SUPPORT_TICKET_ASSIGNED,
      title: "T",
      entityType: "SupportTicket",
      entityId: "e1",
      category: NotificationCategory.WORKFLOW,
      tx: tx as never,
    });
    expect(r.notificationId).toBe("tx1");
    expect(txCreate).toHaveBeenCalled();
    expect(mocks.userNotificationCreate).not.toHaveBeenCalled();
  });
});

describe("markNotificationsAsRead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userNotificationUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("marks only listed ids for user", async () => {
    const r = await markNotificationsAsRead({ userId: "u1", notificationIds: ["a", "b"] });
    expect(r.markedCount).toBe(1);
    expect(mocks.userNotificationUpdateMany).toHaveBeenCalledWith({
      where: { userId: "u1", readAt: null, id: { in: ["a", "b"] } },
      data: { readAt: expect.any(Date) as Date },
    });
  });

  it("marks all unread when no ids", async () => {
    await markNotificationsAsRead({ userId: "u1" });
    expect(mocks.userNotificationUpdateMany).toHaveBeenCalledWith({
      where: { userId: "u1", readAt: null },
      data: { readAt: expect.any(Date) as Date },
    });
  });

  it("does not affect other user rows (where includes userId)", async () => {
    await markNotificationsAsRead({ userId: "user-a", notificationIds: ["n1"] });
    const where = mocks.userNotificationUpdateMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ userId: "user-a" });
  });
});

describe("listUnreadCount", () => {
  beforeEach(() => {
    mocks.userNotificationCount.mockResolvedValue(5);
  });
  it("returns count of unread for user", async () => {
    const n = await listUnreadCount({ userId: "u1" });
    expect(n).toBe(5);
    expect(mocks.userNotificationCount).toHaveBeenCalledWith({
      where: { userId: "u1", readAt: null },
    });
  });
});

describe("getUserNotificationById", () => {
  beforeEach(() => {
    mocks.userNotificationFindFirst.mockResolvedValue(null);
  });
  it("returns row when found", async () => {
    mocks.userNotificationFindFirst.mockResolvedValue({
      id: "n1",
      readAt: null,
    });
    const r = await getUserNotificationById("u1", "n1");
    expect(r).toEqual({ id: "n1", readAt: null });
  });
});

describe("listNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns items, nextCursor, unreadCount", async () => {
    const row = {
      id: "n1",
      notificationType: NotificationType.SUPPORT_TICKET_REPLY,
      category: NotificationCategory.SOCIAL,
      title: "T",
      body: null,
      entityType: "X",
      entityId: "e1",
      actionUrl: null,
      readAt: null,
      createdAt: new Date("2026-01-10T00:00:00.000Z"),
    };
    mocks.$transaction.mockImplementation(async () => [2, [row]]);

    const out = await listNotifications({ userId: "u1", limit: 1 });
    expect(out.unreadCount).toBe(2);
    expect(out.items[0]!.notificationType).toBe(NotificationType.SUPPORT_TICKET_REPLY);
    expect(out.items[0]!.category).toBe(NotificationCategory.SOCIAL);
    expect(out.nextCursor).toBe(row.createdAt.toISOString());
  });
});

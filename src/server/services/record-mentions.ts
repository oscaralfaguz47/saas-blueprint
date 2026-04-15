import "server-only";

import { prisma } from "@/server/db";

/** @mentions: @handle at word boundary; handle may include spaces (display names). */
const MENTION_REGEX = /(?<![^\s,([])@([^@\n]+)(?=\s|$)/g;

function parseMentionHandles(content: string): string[] {
  const handles = new Set<string>();
  let match: RegExpExecArray | null;
  MENTION_REGEX.lastIndex = 0;
  while ((match = MENTION_REGEX.exec(content)) !== null) {
    const h = match[1]?.trim();
    if (h && h.length > 0) handles.add(h.toLowerCase());
  }
  return Array.from(handles);
}

/**
 * F3 — Process @mentions in a comment (after commit).
 * Resolves handles to active tenant members by display name (case-insensitive contains match).
 * Invalid handles are ignored. Never escalates beyond VIEW auto-share.
 */
export async function processMentions({
  tenantId,
  recordId,
  commentId,
  content,
  actorUserId,
}: {
  tenantId: string;
  recordId: string;
  commentId: string;
  content: string;
  actorUserId: string;
}): Promise<void> {
  const handles = parseMentionHandles(content);
  if (handles.length === 0) return;

  const members = await prisma.tenantMembership.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      user: {
        OR: [
          ...handles.map((h) => ({
            name: { contains: h, mode: "insensitive" as const },
          })),
          ...handles.map((h) => ({
            email: { equals: h, mode: "insensitive" as const },
          })),
        ],
      },
    },
    select: {
      userId: true,
      user: { select: { name: true, email: true } },
    },
  });

  if (members.length === 0) return;

  const uniqueMembers = Array.from(new Map(members.map((m) => [m.userId, m])).values());

  for (const member of uniqueMembers) {
    const userId = member.userId;
    if (userId === actorUserId) continue;

    try {
      await prisma.$transaction(async (tx) => {
        const existingMention = await tx.recordCommentMention.findUnique({
          where: {
            commentId_mentionedUserId: { commentId, mentionedUserId: userId },
          },
          select: { id: true },
        });
        if (existingMention) return;

        await tx.recordCommentMention.create({
          data: {
            tenantId,
            recordId,
            commentId,
            mentionedUserId: userId,
            isRead: false,
          },
        });

        const existingAccess = await tx.recordAccess.findUnique({
          where: { recordId_userId: { recordId, userId } },
          select: { id: true, accessType: true },
        });

        const isNewShare = !existingAccess;

        if (isNewShare) {
          await tx.recordAccess.create({
            data: {
              tenantId,
              recordId,
              userId,
              accessType: "VIEW",
              reason: "MENTION_AUTO_SHARE",
              grantedByUserId: actorUserId,
              grantedBySystem: true,
            },
          });
        }

        await tx.recordEvent.create({
          data: {
            tenantId,
            recordId,
            eventType: "USER_MENTIONED",
            actorUserId,
            metadata: {
              commentId,
              mentionedUserId: userId,
              autoAccessGranted: isNewShare,
            },
          },
        });

        if (isNewShare) {
          await tx.recordEvent.create({
            data: {
              tenantId,
              recordId,
              eventType: "RECORD_SHARED",
              actorUserId,
              metadata: {
                sharedWithUserId: userId,
                accessType: "VIEW",
                reason: "MENTION_AUTO_SHARE",
              },
            },
          });
        }
      });
    } catch (err) {
      console.error("[mentions] failed for userId", userId, err);
    }
  }
}

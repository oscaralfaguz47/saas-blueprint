import "server-only";

import { prisma } from "@/server/db";
import { hasTenantPermission } from "@/server/security/tenant-authorization";

/** @mentions: @handle at word boundary; handle may include spaces (display names). */
const MENTION_REGEX = /(?<![^\s,([])@([^@\n]+)(?=\s|$)/g;

function parseMentionHandles(content: string): string[] {
  const handles = new Set<string>();
  let match: RegExpExecArray | null;
  MENTION_REGEX.lastIndex = 0;
  while ((match = MENTION_REGEX.exec(content)) !== null) {
    const raw = match[1]?.trim();
    if (!raw || raw.length === 0) continue;
    // Add the full captured string
    handles.add(raw.toLowerCase());
    // Also add each prefix by removing trailing words one at a time.
    // Handles the case where greedy capture includes post-mention words:
    // "@Oscar Emilio Guzmán como" → also try "oscar emilio guzmán", "oscar emilio", "oscar"
    const words = raw.split(/\s+/);
    for (let i = words.length - 1; i >= 1; i--) {
      handles.add(words.slice(0, i).join(" ").toLowerCase());
    }
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

  // Check if the actor can assign viewers via mentions
  // Only creators, approvers, and users with elevated tenant role can auto-assign viewers
  const canActorAssignViewers = await (async () => {
    // Use read_all as the privilege indicator — Owner/Admin/Finance have it, Member does not
    const hasElevatedRole = await hasTenantPermission({
      userId: actorUserId,
      tenantId,
      permission: "tenant.requests.read_all",
    });
    if (hasElevatedRole) return true;

    // Check if actor is the request creator
    const record = await prisma.record.findFirst({
      where: { id: recordId, tenantId },
      select: { createdByUserId: true },
    });
    if (record?.createdByUserId === actorUserId) return true;

    // Check if actor is an active non-revoked APPROVER on this request
    const isApprover = await prisma.recordParticipant.findFirst({
      where: {
        recordId,
        tenantId,
        userId: actorUserId,
        participantRole: "APPROVER",
        participantType: "INTERNAL",
        revokedAt: null,
      },
      select: { id: true },
    });
    if (isApprover) return true;

    return false;
  })();

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

        let isNewShare = false;
        // Only create RecordAccess and RecordParticipant if actor can assign viewers
        if (canActorAssignViewers) {
          const existingAccess = await tx.recordAccess.findUnique({
            where: { recordId_userId: { recordId, userId } },
            select: { id: true, accessType: true },
          });

          isNewShare = !existingAccess;

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

          // Add as VIEWER participant
          const existingParticipant = await tx.recordParticipant.findFirst({
            where: { recordId, tenantId, userId, participantRole: "VIEWER" },
            select: { id: true, revokedAt: true },
          });

          if (existingParticipant) {
            if (existingParticipant.revokedAt) {
              await tx.recordParticipant.update({
                where: { id: existingParticipant.id },
                data: { revokedAt: null, status: "PENDING", respondedAt: null, responseReason: null },
              });
            }
          } else {
            await tx.recordParticipant.create({
              data: {
                tenantId,
                recordId,
                participantType: "INTERNAL",
                participantRole: "VIEWER",
                userId,
                status: "PENDING",
                createdByUserId: actorUserId,
              },
            });
          }

          // RECORD_SHARED event only when new share happened
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
        } // end canActorAssignViewers block

        await tx.recordEvent.create({
          data: {
            tenantId,
            recordId,
            eventType: "USER_MENTIONED",
            actorUserId,
            metadata: {
              commentId,
              mentionedUserId: userId,
              mentionedUserName: member.user.name ?? null,
              mentionedUserEmail: member.user.email ?? null,
              autoAccessGranted: isNewShare,
            },
          },
        });
      });
    } catch (err) {
      console.error("[mentions] failed for userId", userId, err);
    }
  }
}

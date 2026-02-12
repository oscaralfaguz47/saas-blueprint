import "server-only";

import { Resend } from "resend";

/**
 * Send invitation email for workspace invite (A3).
 * Uses Resend (same as auth magic links). Requires RESEND_API_KEY and EMAIL_FROM.
 * Never log or persist the raw token.
 */
export async function sendInvitationEmail(params: {
  tenantName: string;
  invitedEmail: string;
  rawToken: string;
  baseUrl: string;
}): Promise<void> {
  const { tenantName, invitedEmail, baseUrl } = params;
  const inviteLink = `${baseUrl.replace(/\/$/, "")}/invite?token=${encodeURIComponent(params.rawToken)}`;

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[invitation-email] RESEND_API_KEY or EMAIL_FROM not set; skipping send.", {
        tenantName,
        invitedEmail,
      });
      return;
    }
    throw new Error("RESEND_API_KEY and EMAIL_FROM must be set to send invitation emails.");
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: invitedEmail,
    subject: `You're invited to join ${tenantName}`,
    html: `
      <p>You've been invited to join the workspace <strong>${escapeHtml(tenantName)}</strong>.</p>
      <p><a href="${inviteLink}">Accept invitation</a></p>
      <p>This link expires in 7 days. If you didn't expect this invite, you can ignore this email.</p>
    `,
  });

  if (error) {
    throw new Error(`Failed to send invitation email: ${error.message}`);
  }
}

/**
 * Notify the inviter (workspace owner/admin) that an invitee declined the invitation.
 * A5: Good practice so the inviter knows without checking the Invites table.
 */
export async function sendInvitationDeclinedNotificationToInviter(params: {
  inviterEmail: string | null;
  workspaceName: string;
  declinedEmail: string;
}): Promise<void> {
  const { inviterEmail, workspaceName, declinedEmail } = params;
  if (!inviterEmail?.trim()) return;

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[invitation-email] RESEND_API_KEY or EMAIL_FROM not set; skipping declined notification.", {
        workspaceName,
        declinedEmail,
      });
      return;
    }
    return;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: inviterEmail,
    subject: `Invitation declined: ${declinedEmail} — ${workspaceName}`,
    html: `
      <p>Someone declined your workspace invitation.</p>
      <p><strong>Workspace:</strong> ${escapeHtml(workspaceName)}</p>
      <p><strong>Declined by:</strong> ${escapeHtml(declinedEmail)}</p>
      <p>You can send a new invitation from your workspace Invites settings if you want to invite them again.</p>
    `,
  });

  if (error) {
    // Log but do not throw — reject action must succeed even if email fails
    console.error("[invitation-email] Failed to send declined notification:", error.message);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

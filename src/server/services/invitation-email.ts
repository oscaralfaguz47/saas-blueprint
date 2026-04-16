import "server-only";

import { Resend } from "resend";
import { env } from "@/lib/env";

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

  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;
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

  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;
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

/**
 * Reusable email send via Resend. Uses RESEND_API_KEY and EMAIL_FROM.
 * Used by cron jobs and other server-only flows (e.g. daily digest, billing overage alerts).
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY and EMAIL_FROM must be set to send emails.");
  }
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

/**
 * Send platform admin invite email for vendor user onboarding.
 * Used when inviting a user by email to the Platform Admin area.
 */
export async function sendVendorInviteEmail(params: {
  invitedEmail: string;
  roleName: string;
  rawToken: string;
  baseUrl: string;
  appName?: string;
}): Promise<void> {
  const { invitedEmail, roleName, baseUrl } = params;
  const appName = params.appName ?? env.APP_NAME ?? "Relitrue";
  const signUpLink = `${baseUrl.replace(/\/$/, "")}/auth/sign-in?vendorInvite=${encodeURIComponent(params.rawToken)}`;

  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;
  if (!apiKey || !from) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[vendor-invite-email] RESEND_API_KEY or EMAIL_FROM not set; skipping.", {
        invitedEmail,
      });
      return;
    }
    throw new Error("RESEND_API_KEY and EMAIL_FROM must be set to send vendor invite emails.");
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: invitedEmail,
    subject: `You've been invited to join ${appName} as ${roleName}`,
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="padding:32px 40px 0;background:#09090b;text-align:center;">
          <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">${escapeHtml(appName)}</p>
        </td></tr>
        <tr><td style="padding:28px 40px 0;">
          <p style="margin:0;font-size:15px;color:#3f3f46;">You've been invited to join the <strong>${escapeHtml(appName)}</strong> platform admin team as <strong>${escapeHtml(roleName)}</strong>.</p>
          <p style="margin:16px 0 0;font-size:14px;color:#71717a;">Sign in or create your account to accept this invitation. Two-factor authentication (2FA) is required for all platform admin accounts.</p>
        </td></tr>
        <tr><td style="padding:24px 40px 32px;text-align:center;">
          <a href="${signUpLink}" style="display:inline-block;background:#09090b;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:600;">Accept invitation</a>
          <p style="margin:16px 0 0;font-size:12px;color:#a1a1aa;">This invitation expires in 7 days. If you didn't expect this, you can safely ignore this email.</p>
        </td></tr>
        <tr><td style="padding:20px 40px;background:#fafafa;border-top:1px solid #e4e4e7;text-align:center;">
          <p style="margin:0;font-size:12px;color:#a1a1aa;">© ${escapeHtml(appName)}. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });

  if (error) {
    throw new Error(`Failed to send vendor invite email: ${error.message}`);
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

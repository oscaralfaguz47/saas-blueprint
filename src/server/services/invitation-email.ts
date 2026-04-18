import "server-only";
import { Resend } from "resend";
import { env } from "@/lib/env";
import {
  escapeHtml,
  buildEmailShell,
  buildCtaButton,
  buildHighlightBox,
  resolveSender,
  EMAIL_THEME,
  stripHtmlToText,
} from "./email-templates";

function tryResolveNotificationsSender(): string | null {
  try {
    return resolveSender("notifications");
  } catch {
    return null;
  }
}

// ─── Workspace invitation ────────────────────────────────────────────────────

export async function sendInvitationEmail(params: {
  tenantName: string;
  invitedEmail: string;
  rawToken: string;
  baseUrl: string;
  role?: string;
}): Promise<void> {
  const { tenantName, invitedEmail, baseUrl, role } = params;
  const appName = env.APP_NAME ?? "Relitrue";
  const inviteLink = `${baseUrl.replace(/\/$/, "")}/invite?token=${encodeURIComponent(params.rawToken)}`;
  const t = EMAIL_THEME;

  const from = tryResolveNotificationsSender();
  if (!from) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[invitation-email] RESEND_API_KEY or notification sender not set; skipping send.", {
        tenantName,
        invitedEmail,
      });
      return;
    }
    throw new Error(
      "RESEND_API_KEY and notification email sender must be set to send invitation emails."
    );
  }

  const bodyHtml = `
    <p style="margin:0;font-size:15px;color:${t.colorTextBody};">
      You've been invited to join the workspace
      <strong style="color:${t.colorTextPrimary};">${escapeHtml(tenantName)}</strong>
      as <strong style="color:${t.colorTextPrimary};">${escapeHtml(role ?? "Member")}</strong>.
    </p>
    <p style="margin:12px 0 0;font-size:14px;color:${t.colorTextMuted};">
      Click the button below to accept your invitation and get started.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
           style="border-collapse:collapse;margin-top:24px;">
      <tr>
        <td align="center" style="padding:0;">
          ${buildCtaButton("Accept invitation", inviteLink)}
        </td>
      </tr>
    </table>
    <p style="margin:16px 0 0;font-size:12px;color:${t.colorTextFaint};text-align:center;">
      This invitation expires in 7 days. If you didn't expect this, you can safely ignore this email.
    </p>`;

  const html = buildEmailShell({
    title: `You're invited to join ${appName}`,
    preheader: `You've been invited to join ${tenantName} on ${appName}`,
    bodyHtml,
    footerNote: `You're receiving this because someone invited you to ${appName}.`,
  });

  await _send({
    from,
    to: invitedEmail,
    subject: `You've been invited to join ${escapeHtml(tenantName)} on ${escapeHtml(appName)}`,
    html,
  });
}

// ─── Invitation declined notification ────────────────────────────────────────

export async function sendInvitationDeclinedNotificationToInviter(params: {
  inviterEmail: string | null;
  workspaceName: string;
  declinedEmail: string;
}): Promise<void> {
  const { inviterEmail, workspaceName, declinedEmail } = params;
  if (!inviterEmail?.trim()) return;

  const from = tryResolveNotificationsSender();
  if (!from) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[invitation-email] notification sender not set; skipping declined notification.", {
        workspaceName,
        declinedEmail,
      });
    }
    return;
  }

  const t = EMAIL_THEME;
  const bodyHtml = `
    <p style="margin:0;font-size:15px;color:${t.colorTextBody};">
      Someone declined your workspace invitation.
    </p>
    ${buildHighlightBox(`
      <p style="margin:0;font-size:13px;color:${t.colorTextMuted};font-family:${t.fontStack};">Workspace</p>
      <p style="margin:4px 0 0;font-size:15px;font-weight:600;color:${t.colorTextPrimary};font-family:${t.fontStack};">${escapeHtml(workspaceName)}</p>
      <p style="margin:8px 0 0;font-size:13px;color:${t.colorTextMuted};font-family:${t.fontStack};">Declined by</p>
      <p style="margin:4px 0 0;font-size:14px;color:${t.colorTextBody};font-family:${t.fontStack};">${escapeHtml(declinedEmail)}</p>
    `)}
    <p style="margin:16px 0 0;font-size:13px;color:${t.colorTextMuted};">
      You can send a new invitation from your workspace Invites settings if you want to invite them again.
    </p>`;

  const html = buildEmailShell({
    title: "Invitation declined",
    preheader: `${declinedEmail} declined your invitation to ${workspaceName}`,
    bodyHtml,
    footerNote: "You're receiving this because you sent a workspace invitation.",
  });

  try {
    await _send({
      from,
      to: inviterEmail,
      subject: `Invitation declined: ${declinedEmail} — ${workspaceName}`,
      html,
    });
  } catch (e) {
    // Log but do not throw — reject action must succeed even if notification fails
    console.error(
      "[invitation-email] Failed to send declined notification:",
      e instanceof Error ? e.message : e
    );
  }
}

// ─── Vendor / platform-admin invitation ─────────────────────────────────────

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
  const t = EMAIL_THEME;

  const from = tryResolveNotificationsSender();
  if (!from) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[vendor-invite-email] notification sender not set; skipping.", {
        invitedEmail,
      });
      return;
    }
    throw new Error("RESEND_API_KEY and notification email sender must be set to send vendor invite emails.");
  }

  const bodyHtml = `
    <p style="margin:0;font-size:15px;color:${t.colorTextBody};">
      You've been invited to join the <strong>${escapeHtml(appName)}</strong> platform admin team
      as <strong>${escapeHtml(roleName)}</strong>.
    </p>
    <p style="margin:12px 0 0;font-size:14px;color:${t.colorTextMuted};">
      Sign in or create your account to accept this invitation.
      Two-factor authentication (2FA) is required for all platform admin accounts.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
           style="border-collapse:collapse;margin-top:24px;">
      <tr>
        <td align="center" style="padding:0;">
          ${buildCtaButton("Accept invitation", signUpLink)}
        </td>
      </tr>
    </table>
    <p style="margin:16px 0 0;font-size:12px;color:${t.colorTextFaint};text-align:center;">
      This invitation expires in 7 days. If you didn't expect this, you can safely ignore this email.
    </p>`;

  const html = buildEmailShell({
    title: `You've been invited to ${appName}`,
    preheader: `You've been invited to join ${appName} as ${roleName}`,
    bodyHtml,
    footerNote: `You're receiving this because someone invited you to the ${appName} admin team.`,
  });

  await _send({
    from,
    to: invitedEmail,
    subject: `You've been invited to join ${escapeHtml(appName)} as ${escapeHtml(roleName)}`,
    html,
  });
}

// ─── Generic send (used by support, billing, and approval emails) ─────────────
/**
 * Generic email send. Callers MUST pass `from` using `resolveSender(type)`.
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  from: string;
}): Promise<void> {
  await _send(params);
}

// ─── Internal Resend transport ────────────────────────────────────────────────
async function _send(params: { from: string; to: string; subject: string; html: string }): Promise<void> {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[email] RESEND_API_KEY not set — skipping send to", params.to);
      return;
    }
    throw new Error("RESEND_API_KEY must be set to send emails.");
  }
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    ...params,
    text: stripHtmlToText(params.html),
  });
  if (error) throw new Error(`Email send failed: ${error.message}`);
}

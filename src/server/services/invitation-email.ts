import "server-only";

/**
 * Send invitation email for workspace invite (A3).
 * Stub: logs intent; replace with real provider (Resend, SendGrid, etc.) when available.
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

  // TODO: integrate with email provider (Resend, SendGrid, etc.)
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.info("[invitation-email] Would send invite:", {
      tenantName,
      invitedEmail,
      inviteLinkLength: inviteLink.length,
    });
  }
}

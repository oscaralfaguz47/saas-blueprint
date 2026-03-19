import "server-only";
import { Resend } from "resend";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * Sends the same magic link email that EmailProvider uses.
 * Used by both the NextAuth Email provider and the link-account flow.
 * Requires RESEND_API_KEY and a valid from address.
 */
export async function sendMagicLink(params: {
  email: string;
  url: string;
  from: string;
  otpCode?: string; // 6-digit code to show prominently
  appName?: string; // for email subject/branding
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  const resend = new Resend(apiKey);

  const appName = params.appName ?? process.env.APP_NAME ?? "Your Account";
  const safeAppName = escapeHtml(appName);
  const safeUrl = escapeHtml(params.url);

  const html = params.otpCode
    ? buildOtpEmail({
        code: params.otpCode,
        magicUrl: safeUrl,
        appName: safeAppName,
      })
    : buildMagicLinkOnlyEmail({
        magicUrl: safeUrl,
        appName: safeAppName,
      });

  await resend.emails.send({
    from: params.from,
    to: params.email,
    subject: params.otpCode ? `${params.otpCode} is your ${appName} verification code` : `Sign in to ${appName}`,
    html,
  });
}

function buildOtpEmail(params: { code: string; magicUrl: string; appName: string }): string {
  const { code, magicUrl, appName } = params;
  const codeDisplay = code; // no space — use CSS letter-spacing for visual spacing

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sign in to ${appName}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            <td style="padding:32px 40px 0;text-align:center;">
              <p style="margin:0;font-size:24px;font-weight:700;color:#09090b;">${appName}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 8px;">
              <p style="margin:0 0 8px;font-size:15px;color:#3f3f46;">
                Use this verification code to sign in:
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 40px 24px;text-align:center;">
              <div style="display:inline-block;background:#f4f4f5;border-radius:10px;padding:20px 40px;">
                <span style="font-size:40px;font-weight:800;letter-spacing:12px;color:#09090b;font-family:'Courier New',monospace;padding-left:12px;">${codeDisplay}</span>
              </div>
              <p style="margin:12px 0 0;font-size:13px;color:#71717a;">
                This code expires in <strong>10 minutes</strong> and can only be used once.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-top:1px solid #e4e4e7;"></td>
                  <td style="padding:0 12px;font-size:12px;color:#a1a1aa;white-space:nowrap;">or</td>
                  <td style="border-top:1px solid #e4e4e7;"></td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 40px 32px;text-align:center;">
              <p style="margin:0 0 16px;font-size:14px;color:#71717a;">
                You can also click the button below to sign in directly:
              </p>
              <a href="${magicUrl}"
                 style="display:inline-block;background:#09090b;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:600;">
                Sign in to ${appName}
              </a>
              <p style="margin:16px 0 0;font-size:12px;color:#a1a1aa;">
                This link expires in 10 minutes and can only be used once.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;background:#fafafa;border-top:1px solid #e4e4e7;text-align:center;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;">
                If you didn't request this, you can safely ignore this email.
                Your account remains secure.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildMagicLinkOnlyEmail(params: { magicUrl: string; appName: string }): string {
  const { magicUrl, appName } = params;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sign in to ${appName}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            <td style="padding:32px 40px 0;text-align:center;">
              <p style="margin:0;font-size:24px;font-weight:700;color:#09090b;">${appName}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 32px;text-align:center;">
              <p style="margin:0 0 24px;font-size:15px;color:#3f3f46;">
                Click the button below to sign in to your account.
              </p>
              <a href="${magicUrl}"
                 style="display:inline-block;background:#09090b;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:600;">
                Sign in to ${appName}
              </a>
              <p style="margin:16px 0 0;font-size:12px;color:#a1a1aa;">
                This link expires in 10 minutes and can only be used once.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;background:#fafafa;border-top:1px solid #e4e4e7;text-align:center;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;">
                If you didn't request this, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

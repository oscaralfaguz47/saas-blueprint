import "server-only";
import { Resend } from "resend";
import { env } from "@/lib/env";
import {
  stripHtmlToText,
  escapeHtml,
  buildEmailShell,
  buildCtaButton,
  EMAIL_THEME,
} from "./email-templates";

export async function sendMagicLink(params: {
  email: string;
  url: string;
  from: string;
  otpCode?: string;
  appName?: string;
  showMagicLink?: boolean;
}): Promise<void> {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

  const resend = new Resend(apiKey);
  const appName = params.appName ?? env.APP_NAME ?? "Relitrue";

  const html = params.otpCode
    ? buildOtpEmail({
        code: params.otpCode,
        magicUrl: params.url,
        appName,
        showMagicLink: params.showMagicLink ?? true,
      })
    : buildMagicLinkOnlyEmail({ magicUrl: params.url, appName });

  await resend.emails.send({
    from: params.from,
    to: params.email,
    subject: params.otpCode
      ? `${params.otpCode} is your ${appName} verification code`
      : `Sign in to ${appName}`,
    html,
    text: stripHtmlToText(html),
  });
}

function buildOtpEmail(params: {
  code: string;
  magicUrl: string;
  appName: string;
  showMagicLink: boolean;
}): string {
  const { code, magicUrl, appName, showMagicLink } = params;
  const t = EMAIL_THEME;

  const magicLinkSection = showMagicLink
    ? `
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
             style="border-collapse:collapse;margin:24px 0 0;">
        <tr>
          <td width="44%" height="1"
              style="font-size:0;line-height:0;border-bottom:1px solid ${t.borderColor};">&nbsp;</td>
          <td align="center" width="12%"
              style="padding:0 8px;font-size:12px;color:${t.colorTextFaint};
                     white-space:nowrap;font-family:${t.fontStack};">or</td>
          <td width="44%" height="1"
              style="font-size:0;line-height:0;border-bottom:1px solid ${t.borderColor};">&nbsp;</td>
        </tr>
      </table>
      <p style="margin:16px 0 8px;font-size:14px;color:${t.colorTextMuted};text-align:center;">
        You can also click the button below to sign in directly:
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
             style="border-collapse:collapse;margin-top:24px;">
        <tr>
          <td align="center" style="padding:0;">
            ${buildCtaButton(`Sign in to ${appName}`, magicUrl)}
          </td>
        </tr>
      </table>
      <p style="margin:12px 0 0;font-size:12px;color:${t.colorTextFaint};text-align:center;">
        This link expires in 10 minutes and can only be used once.
      </p>`
    : "";

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:15px;color:${t.colorTextBody};">Use this verification code to sign in:</p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
           style="border-collapse:collapse;">
      <tr>
        <td align="center" style="padding:0;">
          <table cellpadding="0" cellspacing="0" role="presentation"
                 style="border-collapse:collapse;background-color:${t.bgHighlight};">
            <tr>
              <td style="padding:20px 40px;background-color:${t.bgHighlight};"
                  align="center">
                <span style="font-size:40px;font-weight:800;letter-spacing:12px;
                             color:${t.colorTextPrimary};font-family:${t.fontMono};">${escapeHtml(code)}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    <p style="margin:12px 0 0;font-size:13px;color:${t.colorTextMuted};">
      This code expires in <strong>10 minutes</strong> and can only be used once.
    </p>
    ${magicLinkSection}`;

  return buildEmailShell({
    title: `Sign in to ${appName}`,
    preheader: `${code} is your ${appName} verification code`,
    bodyHtml,
    footerNote: "If you didn't request this, you can safely ignore this email. Your account remains secure.",
  });
}

function buildMagicLinkOnlyEmail(params: { magicUrl: string; appName: string }): string {
  const { magicUrl, appName } = params;
  const t = EMAIL_THEME;

  const bodyHtml = `
    <p style="margin:0 0 24px;font-size:15px;color:${t.colorTextBody};text-align:center;">
      Click the button below to sign in to your account.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
           style="border-collapse:collapse;margin-top:24px;">
      <tr>
        <td align="center" style="padding:0;">
          ${buildCtaButton(`Sign in to ${appName}`, magicUrl)}
        </td>
      </tr>
    </table>
    <p style="margin:16px 0 0;font-size:12px;color:${t.colorTextFaint};text-align:center;">
      This link expires in 10 minutes and can only be used once.
    </p>`;

  return buildEmailShell({
    title: `Sign in to ${appName}`,
    preheader: `Sign in to ${appName}`,
    bodyHtml,
    footerNote: "If you didn't request this, you can safely ignore this email.",
  });
}

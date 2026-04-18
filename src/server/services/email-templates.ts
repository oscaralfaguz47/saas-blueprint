import "server-only";
import { env } from "@/lib/env";

// ─── Theme tokens ────────────────────────────────────────────────────────────
// Change colors, fonts, and sizing here — all templates inherit these values.
export const EMAIL_THEME = {
  bgPage: "#f4f4f5",
  bgCard: "#ffffff",
  bgCardHeader: "#09090b",
  bgCardFooter: "#fafafa",
  bgHighlight: "#f4f4f5",
  bgQuote: "#fafafa",
  borderColor: "#e4e4e7",
  shadowCard: "none",
  colorTextPrimary: "#09090b",
  colorTextBody: "#3f3f46",
  colorTextMuted: "#71717a",
  colorTextFaint: "#a1a1aa",
  colorBrandHeader: "#ffffff",
  colorCtaBg: "#09090b",
  colorCtaText: "#ffffff",
  fontStack: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
  fontMono: "'Courier New',monospace",
  borderRadius: "12px",
  borderRadiusBtn: "8px",
  /** Numeric px for VML — must match borderRadius */
  borderRadiusPx: 12,
  /** Numeric px for VML — must match borderRadiusBtn */
  borderRadiusBtnPx: 8,
  maxWidth: "480px",
} as const;

// ─── Escape helper ───────────────────────────────────────────────────────────
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Shared shell ────────────────────────────────────────────────────────────
/**
 * Wraps any email body in the standard product card layout.
 * All emails must go through this shell for visual consistency.
 */
export function buildEmailShell(params: {
  /** Shown in browser tab / accessibility tree — not visible in email body. */
  title: string;
  /** Short text shown in inbox preview snippet (hidden in rendered email). */
  preheader?: string;
  /** Inner HTML content placed inside the card, below the header. */
  bodyHtml: string;
  /** Small text in the bottom footer band. */
  footerNote?: string;
}): string {
  const appName = escapeHtml(env.APP_NAME ?? "Relitrue");
  const { title, preheader, bodyHtml, footerNote } = params;
  const t = EMAIL_THEME;

  const preheaderRow = preheader
    ? `<div style="display:none;font-size:0;line-height:0;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;visibility:hidden;">${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>`
    : "";

  const footerText = footerNote
    ? escapeHtml(footerNote)
    : `You&#39;re receiving this email because of activity on your ${appName} account.`;

  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; padding: 0; background: ${t.bgPage}; }
    table { border-spacing: 0; }
    td { padding: 0; }
    img { border: 0; }
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .fluid { width: 100% !important; max-width: 100% !important; }
      .stack-column { display: block !important; width: 100% !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${t.bgPage};font-family:${t.fontStack};">
  ${preheaderRow}

  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background-color:${t.bgPage};padding:40px 16px;border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:0;">

        <!-- Card container — max 480px -->
        <table class="email-container" cellpadding="0" cellspacing="0" role="presentation"
               width="480" style="width:480px;max-width:480px;border-collapse:collapse;">

          <!-- ═══ BRAND HEADER ═══ -->
          <tr>
            <td style="background-color:${t.bgCardHeader};padding:24px 32px;
                       mso-padding-alt:24px 32px;">
              <!--[if mso]><table cellpadding="0" cellspacing="0" role="presentation" width="100%"><tr><td style="padding:0;"><![endif]-->
              <p style="margin:0;font-size:18px;font-weight:700;color:${t.colorBrandHeader};
                         letter-spacing:-0.3px;font-family:${t.fontStack};">${appName}</p>
              <!--[if mso]></td></tr></table><![endif]-->
            </td>
          </tr>

          <!-- ═══ CARD BODY ═══ -->
          <tr>
            <td style="background-color:${t.bgCard};
                       border-left:1px solid ${t.borderColor};
                       border-right:1px solid ${t.borderColor};
                       padding:28px 32px 0 32px;
                       mso-padding-alt:28px 32px 0 32px;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- ═══ FOOTER BAND ═══ -->
          <tr>
            <td style="background-color:${t.bgCardFooter};
                       padding:20px 32px;
                       border-top:1px solid ${t.borderColor};
                       border-left:1px solid ${t.borderColor};
                       border-right:1px solid ${t.borderColor};
                       border-bottom:1px solid ${t.borderColor};
                       mso-padding-alt:20px 32px;">
              <p style="margin:0;font-size:12px;color:${t.colorTextFaint};
                         line-height:1.5;font-family:${t.fontStack};">${footerText}</p>
            </td>
          </tr>

          <!-- ═══ COPYRIGHT ═══ -->
          <tr>
            <td style="padding:16px 0;" align="center">
              <p style="margin:0;font-size:11px;color:${t.colorTextFaint};
                         font-family:${t.fontStack};">© ${appName}. All rights reserved.</p>
            </td>
          </tr>

        </table>
        <!-- /Card container -->

      </td>
    </tr>
  </table>
  <!-- /Outer wrapper -->

</body>
</html>`;
}

// ─── CTA button helper ───────────────────────────────────────────────────────
export function buildCtaButton(label: string, href: string): string {
  const t = EMAIL_THEME;
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);
  // VML rounded button for Outlook + standard <a> for all other clients
  return `
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml"
             xmlns:w="urn:schemas-microsoft-com:office:word"
             href="${safeHref}"
             style="height:44px;v-text-anchor:middle;width:200px;"
             arcsize="18%"
             fillcolor="${t.colorCtaBg}"
             strokecolor="${t.colorCtaBg}">
  <w:anchorlock/>
  <center style="color:${t.colorCtaText};font-family:${t.fontStack};font-size:14px;font-weight:700;">${safeLabel}</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<a href="${safeHref}"
   style="display:inline-block;background-color:${t.colorCtaBg};color:${t.colorCtaText};
          text-decoration:none;padding:12px 28px;border-radius:${t.borderRadiusBtn};
          font-size:14px;font-weight:600;letter-spacing:0.1px;
          font-family:${t.fontStack};mso-hide:all;">${safeLabel}</a>
<!--<![endif]-->`;
}

// ─── Typed sender resolution ─────────────────────────────────────────────────
export type EmailSenderType = "security" | "notifications" | "support";

/**
 * Resolves the correct `from` address for a given email category.
 * Falls back to EMAIL_FROM if the specific sender is not configured (dev/staging convenience).
 * Throws if neither the specific nor the fallback is set.
 */
export function resolveSender(type: EmailSenderType): string {
  const specific =
    type === "security"
      ? env.EMAIL_FROM_SECURITY
      : type === "notifications"
        ? env.EMAIL_FROM_NOTIFICATIONS
        : env.EMAIL_FROM_SUPPORT;

  const address = specific?.trim() || env.EMAIL_FROM?.trim();

  if (!address) {
    throw new Error(
      `Email sender not configured. Set EMAIL_FROM_${type.toUpperCase()} (or EMAIL_FROM as fallback) in your environment.`
    );
  }

  const appName = env.APP_NAME ?? "Relitrue";

  const displayName =
    type === "security"
      ? `${appName} Security`
      : type === "notifications"
        ? `${appName} Notifications`
        : `${appName} Support`;

  // If the address already contains a display name (e.g. from env),
  // return it as-is to respect manual overrides.
  if (address.includes("<")) return address;

  return `${displayName} <${address}>`;
}

// ─── Highlight box helper ────────────────────────────────────────────────────
/**
 * Renders a highlighted info box using a table — compatible with Outlook.
 * Replaces: <div style="background:...;border-radius:8px;padding:14px 16px;">
 */
export function buildHighlightBox(contentHtml: string): string {
  const t = EMAIL_THEME;
  return `
<table width="100%" cellpadding="0" cellspacing="0" role="presentation"
       style="border-collapse:collapse;margin-top:16px;">
  <tr>
    <td style="background-color:${t.bgHighlight};padding:14px 16px;">
      ${contentHtml}
    </td>
  </tr>
</table>`;
}

// ─── Quote block helper ──────────────────────────────────────────────────────
/**
 * Renders a left-bordered quote block using a table — compatible with Outlook.
 * Replaces: <div style="border-left:3px solid ...;padding:10px 16px;">
 */
export function buildQuoteBlock(contentHtml: string): string {
  const t = EMAIL_THEME;
  return `
<table width="100%" cellpadding="0" cellspacing="0" role="presentation"
       style="border-collapse:collapse;margin-top:12px;">
  <tr>
    <td width="3" style="background-color:${t.borderColor};font-size:0;line-height:0;">&nbsp;</td>
    <td style="background-color:${t.bgCardFooter};padding:10px 16px;">
      ${contentHtml}
    </td>
  </tr>
</table>`;
}

/**
 * Converts an HTML email string to a plain text fallback.
 * Used as the `text` field in Resend to prevent Outlook/Exchange
 * from flagging HTML-only messages and converting them to plain text.
 */
export function stripHtmlToText(html: string): string {
  return html
    // Replace block-level elements with newlines
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/table>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    // Remove all remaining HTML tags
    .replace(/<[^>]+>/g, "")
    // Decode common HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&zwnj;/g, "")
    // Collapse multiple blank lines to max 2
    .replace(/\n{3,}/g, "\n\n")
    // Trim leading/trailing whitespace per line
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

import "server-only";
import { Resend } from "resend";

/**
 * Sends the same magic link email that EmailProvider uses.
 * Used by both the NextAuth Email provider and the link-account flow.
 * Requires RESEND_API_KEY and a valid from address.
 */
export async function sendMagicLink(params: {
  email: string;
  url: string;
  from: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: params.from,
    to: params.email,
    subject: "Sign in to your account",
    html: `
      <p>Click the link below to sign in:</p>
      <p><a href="${params.url}">Sign in</a></p>
      <p>If you did not request this, ignore this email.</p>
    `,
  });
}

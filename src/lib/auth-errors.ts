
export type AuthErrorCopy = {
  code: string;
  title: string;
  description: string;
};

/**
 * NextAuth error codes you can see in the URL:
 * /auth/error?error=...
 *
 * Common ones:
 * - Verification
 * - OAuthAccountNotLinked
 * - AccessDenied
 * - Configuration
 * - OAuthSignin / OAuthCallback / OAuthCreateAccount
 * - EmailSignin
 * - CredentialsSignin
 * - SessionRequired
 * - Default
 */
export function getAuthErrorCopy(error?: string | null): AuthErrorCopy {
  const code = (error ?? "").trim() || "Verification";

  switch (code) {
    // Magic link invalid / expired / already used
    case "Verification":
      return {
        code,
        title: "This sign-in link is no longer valid",
        description:
          "Magic links can only be used once and may expire after a few minutes. Please request a new link and try again.",
      };

    /**
     * NextAuth sometimes returns "Default" for cases that *feel* like Verification to the user
     * (expired token, already used, malformed callback, etc.).
     * In a passwordless flow, it’s better to be helpful and actionable.
     */
    case "Default":
      return {
        code,
        title: "This sign-in link is no longer valid",
        description:
          "The link may have expired, already been used, or is incomplete. Please request a new magic link and try again.",
      };

    // Email provider failed to send / provider error
    case "EmailSignin":
      return {
        code,
        title: "We couldn't send the magic link",
        description:
          "Please try again in a moment. If the issue persists, verify your email address or check your email provider settings.",
      };

    // User tried Google after already using Magic link (or vice versa) without linking accounts
    case "OAuthAccountNotLinked":
      return {
        code,
        title: "This email is already registered",
        description:
          "This email was previously used with a different sign-in method. Please sign in using the same method as before (Google or Magic link).",
      };

    case "AccessDenied":
      return {
        code,
        title: "Access denied",
        description:
          "You do not have permission to sign in. If you believe this is a mistake, please contact support.",
      };

    // Misconfiguration (NEXTAUTH_URL, provider secrets, callbacks, etc.)
    case "Configuration":
      return {
        code,
        title: "Authentication is not configured correctly",
        description:
          "There is a configuration issue with the authentication setup. Please contact support (or check server logs in development).",
      };

    // OAuth flow issues
    case "OAuthSignin":
    case "OAuthCallback":
    case "OAuthCreateAccount":
      return {
        code,
        title: "Google sign-in failed",
        description:
          "We couldn’t complete Google sign-in. Please try again. If it keeps happening, contact support.",
      };

    case "CredentialsSignin":
      return {
        code,
        title: "Sign-in failed",
        description:
          "We couldn’t sign you in with the provided credentials. Please try again.",
      };

    case "SessionRequired":
      return {
        code,
        title: "Session required",
        description:
          "You must be signed in to access this page. Please sign in and try again.",
      };

    // Session expired (inactivity, revoked, or user no longer exists)
    case "SessionExpired":
      return {
        code,
        title: "Session expired",
        description:
          "Your session expired due to inactivity or was signed out. Please sign in again.",
      };

    default:
      return {
        code,
        title: "Sign-in error",
        description:
          "Something went wrong while trying to sign you in. Please try again.",
      };
  }
}

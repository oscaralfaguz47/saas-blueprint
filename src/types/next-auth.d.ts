import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      /** A7: JWT iat (seconds) for step-up / recent-auth checks (e.g. transfer ownership). */
      iat?: number;
      /** L1: Session token for inactivity and 2FA verification. */
      sessionToken?: string;
      /** L1: True if this session passed 2FA challenge. */
      mfaVerified?: boolean;
      /** L1: User has TOTP 2FA enabled (needed to redirect to challenge). */
      totpEnabled?: boolean;
      /** E6: Admin-forced 2FA; must complete setup before app access. */
      mfaEnforced?: boolean;
      /** Security 2FA/sessions: FULL or PENDING_MFA. */
      authLevel?: "FULL" | "PENDING_MFA";
      /** Inactivity auto-logout (client activity tracker). */
      autoLogoutEnabled?: boolean;
      autoLogoutMinutes?: number;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sub?: string;
    email?: string;
    /** Issued-at (seconds); set in jwt callback for A7 step-up. */
    iat?: number;
    /** L1: Session token for inactivity check and 2FA. */
    sessionToken?: string;
    /** L1: Set in jwt callback from DB so layout sees 2FA verified after challenge. */
    mfaVerified?: boolean;
    /** Security 2FA/sessions: FULL or PENDING_MFA. */
    authLevel?: "FULL" | "PENDING_MFA";
  }
}

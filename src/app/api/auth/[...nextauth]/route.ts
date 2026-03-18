import NextAuth from "next-auth";
import { authOptions } from "@/server/auth-options";

// Standard NextAuth v4 handler.
// Link challenge cookie is handled by /api/link/pending, which is triggered
// by the sign-in page when it detects ?error=AccessDenied.
const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };

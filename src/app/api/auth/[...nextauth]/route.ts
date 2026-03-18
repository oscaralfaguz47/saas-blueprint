import NextAuth from "next-auth";
import { authOptions } from "@/server/auth-options";
import { runWithNextAuthCookieHeaderAsync } from "@/server/nextauth-cookie-header";

const handler = NextAuth(authOptions);

/** NextAuth picks App Router vs Pages API by `context.params`; omitting it breaks sign-in (req.query undefined). */
type NextAuthContext = { params: Promise<{ nextauth: string[] }> };

export function GET(req: Request, context: NextAuthContext) {
  return runWithNextAuthCookieHeaderAsync(req.headers.get("cookie") ?? "", () =>
    handler(req, context)
  );
}

export function POST(req: Request, context: NextAuthContext) {
  return runWithNextAuthCookieHeaderAsync(req.headers.get("cookie") ?? "", () =>
    handler(req, context)
  );
}

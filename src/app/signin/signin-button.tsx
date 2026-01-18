"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

export default function SignInButton() {
  const searchParams = useSearchParams();

  // NextAuth uses callbackUrl; default fallback
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

  async function handleSignIn() {
    // IMPORTANT: do NOT hardcode dashboard/member here
    await signIn("github", { callbackUrl });
  }

  return (
    <button
      onClick={handleSignIn}
      style={{ padding: "10px 14px", cursor: "pointer" }}
    >
      Continue with GitHub
    </button>
  );
}

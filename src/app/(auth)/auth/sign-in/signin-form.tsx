"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

export default function SignInForm() {
  const searchParams = useSearchParams();

  const callbackUrl = searchParams.get("callbackUrl") ?? "/app";

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleGoogle() {
    setLoading(true);
    try {
      await signIn("google", { callbackUrl });
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    try {
      await signIn("email", { email, callbackUrl });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <button
        onClick={handleGoogle}
        disabled={loading}
        style={{ padding: "10px 14px", cursor: "pointer" }}
      >
        Continue with Google
      </button>

      <div style={{ opacity: 0.7 }}>or</div>

      <form onSubmit={handleMagicLink} style={{ display: "grid", gap: 8 }}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          type="email"
          autoComplete="email"
          disabled={loading}
          style={{ padding: "10px 12px" }}
        />

        <button
          type="submit"
          disabled={loading || !email.trim()}
          style={{ padding: "10px 14px", cursor: "pointer" }}
        >
          Send magic link
        </button>
      </form>
    </div>
  );
}

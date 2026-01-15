"use client";

import { signIn } from "next-auth/react";

export default function SignInButton() {
  return (
    <button
      type="button"
      onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
      style={{
        marginTop: 12,
        padding: "10px 14px",
        border: "1px solid #ccc",
        borderRadius: 8,
        cursor: "pointer",
      }}
    >
      Continue with GitHub
    </button>
  );
}

"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

export function TwoFaChallengeForm() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Enter your 6-digit code or backup code.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/account/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.message ?? json?.error ?? "Invalid code. Try again.");
        setLoading(false);
        return;
      }
      // Full page navigation so the server gets a fresh request and sees updated Session.mfaVerifiedAt
      window.location.href = "/app";
    } catch {
      setError("Something went wrong. Try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="code" className="sr-only">
          Authentication code
        </label>
        <Input
          id="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000 or backup code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="text-center text-lg tracking-widest"
          maxLength={10}
          disabled={loading}
        />
      </div>
      {error ? (
        <p className="text-sm text-(--color-danger)">{error}</p>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className="w-full inline-flex h-11 items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:opacity-60"
      >
        {loading ? "Verifying…" : "Verify"}
      </button>
    </form>
  );
}

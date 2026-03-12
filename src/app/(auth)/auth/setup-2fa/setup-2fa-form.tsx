"use client";

import { useState, useEffect } from "react";
import { signOut } from "next-auth/react";
import QRCode from "qrcode";
import { Input } from "@/components/ui/input";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { Spinner } from "@/components/ui/spinner";

export function Setup2faForm() {
  const apiFetch = useApiFetch();
  const [step, setStep] = useState<"idle" | "qr" | "verify">("idle");
  const [setupData, setSetupData] = useState<{ otpauthUri: string; manualKey: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signOutLoading, setSignOutLoading] = useState(false);

  useEffect(() => {
    if (!setupData?.otpauthUri) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(setupData.otpauthUri, { width: 200, margin: 2 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [setupData?.otpauthUri]);

  const handleStartSetup = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch("/api/account/2fa/setup", { method: "POST" });
      const data = (await res.json()) as {
        data?: { otpauthUri?: string; manualKey?: string };
        error?: { code?: string; message?: string };
      };
      if (!res.ok) {
        setError(data.error?.message ?? data.error?.code ?? "Failed to start setup.");
        setLoading(false);
        return;
      }
      if (data.data?.otpauthUri && data.data?.manualKey) {
        setSetupData({ otpauthUri: data.data.otpauthUri, manualKey: data.data.manualKey });
        setStep("qr");
      }
      setLoading(false);
    } catch {
      setError("Something went wrong.");
      setLoading(false);
    }
  };

  const handleVerifySetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyCode.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch("/api/account/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: verifyCode.trim() }),
      });
      const data = (await res.json()) as {
        data?: { backupCodes?: string[]; verified?: boolean };
        error?: { code?: string; message?: string };
      };
      if (!res.ok) {
        setError(data.error?.message ?? data.error?.code ?? "Invalid code.");
        setLoading(false);
        return;
      }
      if (data.data?.backupCodes) {
        setBackupCodes(data.data.backupCodes);
        setStep("idle");
        setSetupData(null);
        setVerifyCode("");
      }
      setLoading(false);
    } catch {
      setError("Something went wrong.");
      setLoading(false);
    }
  };

  const handleContinueToApp = () => {
    // Full page load so the server gets a fresh session (totpEnabled from DB); avoids redirect loop with app layout
    window.location.href = "/auth/2fa";
  };

  const handleSignOut = async () => {
    setSignOutLoading(true);
    await signOut({ callbackUrl: "/auth/sign-in" });
  };

  return (
    <div className="space-y-6">
      {!backupCodes || backupCodes.length === 0 ? (
        <>
          {step === "idle" && !setupData && (
            <div className="space-y-4">
              <p className="text-sm text-(--text-secondary)">
                Your workspace requires two-factor authentication. Set it up below using an
                authenticator app (e.g. Google Authenticator or Authy).
              </p>
              <button
                type="button"
                onClick={handleStartSetup}
                disabled={loading}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-(--color-primary) px-4 text-sm font-semibold text-white hover:bg-(--color-primary-hover) disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Spinner size="sm" className="text-white" />
                    Starting…
                  </>
                ) : (
                  "Set up 2FA"
                )}
              </button>
            </div>
          )}

          {step === "qr" && setupData && (
            <div className="space-y-4">
              <p className="text-sm text-(--text-secondary)">
                Scan this QR code with your authenticator app, or enter the key manually:
              </p>
              <div className="flex flex-wrap items-start gap-4">
                {qrDataUrl && (
                  <div className="rounded-lg border border-(--border-subtle) bg-white p-2">
                    <img
                      src={qrDataUrl}
                      alt="Scan with your authenticator app"
                      width={200}
                      height={200}
                    />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-xs text-(--text-muted)">Manual entry key:</p>
                  <p className="font-mono break-all rounded-lg bg-(--bg-surface-elev) p-3 text-sm text-(--text-primary)">
                    {setupData.manualKey}
                  </p>
                </div>
              </div>
              <form onSubmit={handleVerifySetup} className="flex flex-wrap items-end gap-3">
                <div>
                  <label htmlFor="setup-verify-code" className="sr-only">
                    Verification code
                  </label>
                  <Input
                    id="setup-verify-code"
                    type="text"
                    inputMode="numeric"
                    placeholder="000000"
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value)}
                    maxLength={6}
                    className="w-32"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || verifyCode.length !== 6}
                  className="inline-flex h-11 items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:opacity-60"
                >
                  {loading ? "Verifying…" : "Verify and enable"}
                </button>
              </form>
            </div>
          )}

          {error && (
            <p className="text-center text-sm text-(--color-danger)" role="alert">
              {error}
            </p>
          )}
        </>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-(--color-warning) bg-(--bg-surface-elev) p-3 sm:p-4">
            <p className="text-sm font-medium text-(--text-primary)">
              Save these backup codes. Each can be used once.
            </p>
            <p className="mt-1 text-xs text-(--text-muted)">
              Copy them now — they won&apos;t be shown again after you leave this page.
            </p>
            <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-sm text-(--text-secondary)">
              {backupCodes.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            onClick={handleContinueToApp}
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-semibold text-white hover:bg-(--color-primary-hover)"
          >
            Continue to sign in
          </button>
        </div>
      )}

      <div className="border-t border-(--border-subtle) pt-4">
        <p className="mb-2 text-xs text-(--text-muted)">
          Using a different account? Sign out and sign in with the correct one.
        </p>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signOutLoading}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-60"
        >
          {signOutLoading ? (
            <>
              <Spinner size="sm" className="mr-2" />
              Signing out…
            </>
          ) : (
            "Sign out"
          )}
        </button>
      </div>
    </div>
  );
}

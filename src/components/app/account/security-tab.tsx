"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Input } from "@/components/ui/input";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { getApiErrorMessage } from "@/lib/api-client";
import type { AccountSecurity } from "./account-settings-tabs";

/** Human-readable label for auto-logout duration (e.g. "15 minutes", "1 hour"). */
function formatAutoLogoutLabel(minutes: number): string {
  switch (minutes) {
    case 15:
      return "15 minutes";
    case 30:
      return "30 minutes";
    case 60:
      return "1 hour";
    case 300:
      return "5 hours";
    case 480:
      return "8 hours";
    default:
      return "5 hours";
  }
}

const AUTO_LOGOUT_OPTIONS: { value: number; label: string }[] = [
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 300, label: "5 hours" },
  { value: 480, label: "8 hours" },
];

function formatBackupCodesDate(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null;
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString(undefined, { dateStyle: "medium" });
  } catch {
    return null;
  }
}

type Props = { security: AccountSecurity };

export function SecurityTab({ security: initialSecurity }: Props) {
  const router = useRouter();
  const apiFetch = useApiFetch();
  const [totpSetupStep, setTotpSetupStep] = useState<"idle" | "qr" | "verify">("idle");
  const [setupData, setSetupData] = useState<{ otpauthUri: string; manualKey: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disableCode, setDisableCode] = useState("");
  const [regenerateCode, setRegenerateCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingDisable, setLoadingDisable] = useState(false);
  const [loadingRegenerate, setLoadingRegenerate] = useState(false);
  const [autoLogoutEnabled, setAutoLogoutEnabled] = useState(initialSecurity.autoLogoutEnabled);
  /** When enabled from server: server value. When user just turned on: null until they select. */
  const [autoLogoutMinutes, setAutoLogoutMinutes] = useState<number | null>(
    initialSecurity.autoLogoutEnabled ? initialSecurity.autoLogoutMinutes : null
  );
  const [autoLogoutLoading, setAutoLogoutLoading] = useState(false);
  const [autoLogoutError, setAutoLogoutError] = useState<string | null>(null);

  const totpEnabled = initialSecurity.totpEnabled;

  // QR is only shown after user clicks "Enable 2FA" in this session; we do not restore pending setup on mount
  // so returning to the tab shows only the button and avoids confusion that 2FA is already enabled.

  // Generate QR code data URL when we have otpauthUri
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
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        setError(data.message ?? data.error ?? "Failed to start setup.");
        setLoading(false);
        return;
      }
      if (data.data?.otpauthUri && data.data?.manualKey) {
        setSetupData({ otpauthUri: data.data.otpauthUri, manualKey: data.data.manualKey });
        setTotpSetupStep("qr");
      }
      setLoading(false);
      router.refresh();
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
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        setError(data.message ?? data.error ?? "Invalid code.");
        setLoading(false);
        return;
      }
      if (data.data?.backupCodes) {
        setBackupCodes(data.data.backupCodes);
        setTotpSetupStep("idle");
        setSetupData(null);
        setVerifyCode("");
        // Do NOT call router.refresh() here: it re-runs the layout and redirects to /auth/2fa
        // before the user can copy the backup codes. User stays on this tab to copy codes.
      }
      setLoading(false);
    } catch {
      setError("Something went wrong.");
      setLoading(false);
    }
  };

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disableCode.trim()) return;
    setError(null);
    setLoadingDisable(true);
    try {
      const res = await apiFetch("/api/account/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: disableCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(getApiErrorMessage(res, data as { error?: string; message?: string }));
        if ((data as { details?: { code?: string } }).details?.code === "STEP_UP_REQUIRED") {
          setError("Sign in again to disable 2FA.");
        }
        setLoadingDisable(false);
        return;
      }
      setDisableCode("");
      setLoadingDisable(false);
      router.refresh();
    } catch {
      setError("Something went wrong.");
      setLoadingDisable(false);
    }
  };

  const handleRegenerateBackupCodes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regenerateCode.trim()) return;
    setError(null);
    setLoadingRegenerate(true);
    try {
      const res = await apiFetch("/api/account/2fa/backup-codes/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: regenerateCode.trim() }),
      });
      const data = (await res.json()) as {
        data?: { backupCodes?: string[] };
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        setError(getApiErrorMessage(res, data));
        if ((data as { details?: { code?: string } }).details?.code === "STEP_UP_REQUIRED") {
          setError("Sign in again to regenerate backup codes.");
        }
        setLoadingRegenerate(false);
        return;
      }
      if (data.data?.backupCodes) setBackupCodes(data.data.backupCodes);
      setRegenerateCode("");
      setLoadingRegenerate(false);
      router.refresh();
    } catch {
      setError("Something went wrong.");
      setLoadingRegenerate(false);
    }
  };

  const handleAutoLogoutToggle = (enabled: boolean) => {
    setAutoLogoutError(null);
    if (enabled) {
      setAutoLogoutEnabled(true);
      setAutoLogoutMinutes(null);
      return;
    }
    setAutoLogoutLoading(true);
    apiFetch("/api/account/auto-logout", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setAutoLogoutError(
            (data as { details?: { code?: string } }).details?.code === "STEP_UP_REQUIRED"
              ? "Sign in again to change this setting."
              : getApiErrorMessage(res, data as { error?: string; message?: string })
          );
          return;
        }
        setAutoLogoutEnabled(false);
        setAutoLogoutMinutes(null);
        router.refresh();
      })
      .catch(() => setAutoLogoutError("Something went wrong."))
      .finally(() => setAutoLogoutLoading(false));
  };

  const handleAutoLogoutDurationChange = (minutes: number) => {
    setAutoLogoutMinutes(minutes);
    setAutoLogoutError(null);
    setAutoLogoutLoading(true);
    apiFetch("/api/account/auto-logout", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true, minutes }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setAutoLogoutError(
            (data as { details?: { code?: string } }).details?.code === "STEP_UP_REQUIRED"
              ? "Sign in again to change this setting."
              : getApiErrorMessage(res, data as { error?: string; message?: string })
          );
          return;
        }
        setAutoLogoutEnabled(true);
        setAutoLogoutMinutes(minutes);
        router.refresh();
      })
      .catch(() => setAutoLogoutError("Something went wrong."))
      .finally(() => setAutoLogoutLoading(false));
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Two-Factor Authentication */}
      <section className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-4 sm:p-6">
        <h2 className="text-base font-semibold text-(--text-primary)">
          Two-Factor Authentication
        </h2>
        <p className="mt-1 text-sm text-(--text-secondary)">
          Add an extra layer of security with an authenticator app.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {totpEnabled || (backupCodes && backupCodes.length > 0) ? (
            <span className="rounded-md border border-(--color-success) bg-(--bg-surface-elev) px-2 py-1 text-sm font-medium text-(--color-success)">
              Enabled
            </span>
          ) : (
            <span className="rounded-md border border-(--border-subtle) bg-(--bg-surface-elev) px-2 py-1 text-sm text-(--text-secondary)">
              Not enabled
            </span>
          )}
        </div>

        {!totpEnabled && !(backupCodes && backupCodes.length > 0) && !(totpSetupStep === "qr" && setupData) && (
          <div className="mt-4">
            <button
              type="button"
              onClick={handleStartSetup}
              disabled={loading}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:opacity-60"
            >
              {loading ? "Starting…" : "Enable 2FA"}
            </button>
          </div>
        )}

        {totpSetupStep === "qr" && setupData && (
          <div className="mt-4 space-y-4 sm:mt-6">
            <p className="text-sm text-(--text-secondary)">
              Scan this QR code with your authenticator app (e.g. Google Authenticator), or enter
              the key manually:
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
                <p className="text-xs text-(--text-muted) mb-1">Manual entry key:</p>
                <p className="font-mono text-sm break-all text-(--text-primary) bg-(--bg-surface-elev) p-3 rounded-lg">
                  {setupData.manualKey}
                </p>
              </div>
            </div>
            <form onSubmit={handleVerifySetup} className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="verify-code" className="sr-only">
                  Verification code
                </label>
                <Input
                  id="verify-code"
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
                className="inline-flex h-10 items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:opacity-60"
              >
                {loading ? "Verifying…" : "Verify and enable"}
              </button>
            </form>
          </div>
        )}

        {backupCodes && backupCodes.length > 0 && (
          <div className="mt-4 rounded-lg border border-(--color-warning) bg-(--bg-surface-elev) p-3 sm:p-4">
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
        )}

        {totpEnabled && (
          <>
            <form onSubmit={handleDisable} className="mt-4 flex flex-wrap items-end gap-3 sm:mt-6">
              <div>
                <label htmlFor="disable-code" className="block text-sm text-(--text-secondary)">
                  Disable 2FA (enter code)
                </label>
                <Input
                  id="disable-code"
                  type="text"
                  inputMode="numeric"
                  placeholder="000000 or backup code"
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value)}
                  className="mt-1 w-44"
                />
              </div>
              <button
                type="submit"
                disabled={loadingDisable || loadingRegenerate || !disableCode.trim()}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-(--border-subtle) px-4 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-60"
              >
                {loadingDisable ? "Disabling…" : "Disable 2FA"}
              </button>
            </form>
            <form onSubmit={handleRegenerateBackupCodes} className="mt-4 flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="regen-code" className="block text-sm text-(--text-secondary)">
                  Regenerate backup codes (enter current app code)
                </label>
                <Input
                  id="regen-code"
                  type="text"
                  inputMode="numeric"
                  placeholder="000000"
                  value={regenerateCode}
                  onChange={(e) => setRegenerateCode(e.target.value)}
                  maxLength={6}
                  className="mt-1 w-32"
                />
              </div>
              <button
                type="submit"
                disabled={loadingDisable || loadingRegenerate || regenerateCode.length !== 6}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-(--border-subtle) px-4 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-60"
              >
                {loadingRegenerate ? "Regenerating…" : "Regenerate codes"}
              </button>
            </form>
          </>
        )}

        {formatBackupCodesDate(initialSecurity.backupCodesGeneratedAt) && (
          <p className="mt-2 text-sm text-(--text-muted)">
            Backup codes generated:{" "}
            {formatBackupCodesDate(initialSecurity.backupCodesGeneratedAt)}
          </p>
        )}
        {error && <p className="mt-4 text-sm text-(--color-danger)">{error}</p>}
      </section>

      {/* Inactivity auto-logout */}
      <section className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-4 sm:p-6">
        <h2 className="text-base font-semibold text-(--text-primary)">
          Inactivity auto-logout
        </h2>
        <p className="mt-1 text-sm text-(--text-secondary)">
          Global for your account (all devices). Log me out after{" "}
          {autoLogoutEnabled && autoLogoutMinutes != null
            ? formatAutoLogoutLabel(autoLogoutMinutes)
            : !autoLogoutEnabled && initialSecurity.autoLogoutMinutes
              ? formatAutoLogoutLabel(initialSecurity.autoLogoutMinutes)
              : "…"}{" "}
          of inactivity.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={autoLogoutEnabled}
            onClick={() => handleAutoLogoutToggle(!autoLogoutEnabled)}
            disabled={autoLogoutLoading}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-(--color-primary) disabled:opacity-60 ${
              autoLogoutEnabled
                ? "border-(--color-primary) bg-(--color-primary)"
                : "border-(--border-subtle) bg-(--bg-surface-elev)"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                autoLogoutEnabled ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
          <span className="text-sm text-(--text-secondary)">
            {autoLogoutEnabled ? "On" : "Off"}
          </span>
          {autoLogoutEnabled && (
            <select
              value={autoLogoutMinutes ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") return;
                handleAutoLogoutDurationChange(Number(v));
              }}
              disabled={autoLogoutLoading}
              className="ml-2 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2 text-sm text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary) disabled:opacity-60"
              aria-label="Inactivity duration"
            >
              <option value="">Select time</option>
              {AUTO_LOGOUT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
        </div>
        {autoLogoutError && (
          <p className="mt-2 text-sm text-(--color-danger)">{autoLogoutError}</p>
        )}
      </section>
    </div>
  );
}

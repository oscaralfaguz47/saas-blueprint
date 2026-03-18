"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useOAuthPopup, getOAuthAuthorizationUrl } from "@/hooks/use-oauth-popup";
import QRCode from "qrcode";
import { Input } from "@/components/ui/input";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { getApiErrorMessage } from "@/lib/api-client";
import type { AccountSecurity } from "./account-settings-tabs";

/** Human-readable label for auto-logout duration. Includes legacy values (1, 300) for display only. */
function formatAutoLogoutLabel(minutes: number): string {
  switch (minutes) {
    case 1:
      return "1 minute";
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
    case 10080:
      return "7 days";
    case 21600:
      return "15 days";
    default:
      return "15 days";
  }
}

/** Select options only (15m, 30m, 1h, 8h, 7d). Default 15 days (21600) is not in the list. */
const AUTO_LOGOUT_OPTIONS: { value: number; label: string }[] = [
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 480, label: "8 hours" },
  { value: 10080, label: "7 days" },
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

type Props = {
  security: AccountSecurity;
  linkedProviders: string[];
  authLevel: string;
  currentUserEmail: string | null;
};

function MicrosoftIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 21 21" className="h-5 w-5" focusable="false">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.3l6.7-6.7C35.6 2.3 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6.1C12.3 13.3 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-2.8-.4-4.1H24v7.8h12.6c-.3 2-1.7 5-4.8 7.1l7.4 5.8c4.3-4 6.9-9.9 6.9-16.6z" />
      <path fill="#FBBC05" d="M10.4 28.6c-.5-1.4-.8-2.8-.8-4.6s.3-3.2.8-4.6l-7.8-6.1C1 16.6 0 20.2 0 24s1 7.4 2.6 10.7l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.4-5.8c-2 1.4-4.7 2.4-7.8 2.4-6.3 0-11.7-3.8-13.6-9.1l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
  );
}

export function SecurityTab({
  security: initialSecurity,
  linkedProviders,
  authLevel,
  currentUserEmail,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openPopup } = useOAuthPopup();
  const apiFetch = useApiFetch();
  const [totpSetupStep, setTotpSetupStep] = useState<"idle" | "qr" | "verify">("idle");
  const [setupData, setSetupData] = useState<{ otpauthUri: string; manualKey: string } | null>(
    null,
  );
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
    initialSecurity.autoLogoutEnabled ? initialSecurity.autoLogoutMinutes : null,
  );
  const [autoLogoutLoading, setAutoLogoutLoading] = useState(false);
  const [autoLogoutError, setAutoLogoutError] = useState<string | null>(null);

  const urlError = searchParams.get("error");
  const urlProvider = searchParams.get("provider");
  const [linkError, setLinkError] = useState<string | null>(() => {
    if (urlError === "link_email_mismatch") {
      const emailHint = currentUserEmail ? ` (${currentUserEmail})` : "";
      if (urlProvider === "azure-ad") {
        return `The Microsoft account you selected uses a different email address than your account${emailHint}. Please select the Microsoft account that uses this same email address.`;
      }
      if (urlProvider === "google") {
        return `The Google account you selected uses a different email address than your account${emailHint}. Please select the Google account that uses this same email address.`;
      }
      return `The account you selected uses a different email address than your account${emailHint}. Please select an account with the same email address.`;
    }
    return null;
  });
  const [linkingProvider, setLinkingProvider] = useState<string | null>(null);

  const totpEnabled = initialSecurity.totpEnabled;

  useEffect(() => {
    if (urlError === "link_email_mismatch") {
      const url = new URL(window.location.href);
      url.searchParams.delete("error");
      url.searchParams.delete("provider");
      window.history.replaceState({}, "", url.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- strip params once after OAuth redirect
  }, []);

  async function handleLinkProvider(provider: "azure-ad" | "google") {
    setLinkError(null);
    setLinkingProvider(provider);
    try {
      const res = await fetch("/api/account/link-provider/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !data.token) {
        setLinkError(data.error ?? "Failed to initiate linking. Please try again.");
        setLinkingProvider(null);
        return;
      }
      const cookieName = `__link_intent_${provider.replace(/-/g, "_")}`;
      document.cookie = `${cookieName}=${encodeURIComponent(data.token)}; Path=/; Max-Age=300; SameSite=Lax`;

      const popupCallbackUrl = `${window.location.origin}/auth/popup-callback`;
      const authUrl = await getOAuthAuthorizationUrl(provider, popupCallbackUrl);

      if (!authUrl) {
        await signIn(provider, { callbackUrl: "/app/account?tab=security" });
        setLinkingProvider(null);
        return;
      }

      const result = await openPopup(authUrl);

      if (result.success) {
        setLinkingProvider(null);
        window.location.href = "/app/account?tab=security";
        return;
      }
      if (result.error === "popup_blocked") {
        await signIn(provider, { callbackUrl: "/app/account?tab=security" });
        return;
      }
      if (result.error === "cancelled") {
        setLinkingProvider(null);
        return;
      }
      if (!result.success && result.error === "error") {
        if (result.errorCode === "link_email_mismatch") {
          const emailHint = currentUserEmail ? ` (${currentUserEmail})` : "";
          const providerName = provider === "azure-ad" ? "Microsoft" : "Google";
          setLinkError(
            `The ${providerName} account you selected uses a different email address than your account${emailHint}. Please select the ${providerName} account that uses this same email address.`,
          );
        } else if (result.errorCode === "AccessDenied") {
          setLinkError("Access was denied. Please try again.");
        } else {
          setLinkError("Something went wrong. Please try again.");
        }
        setLinkingProvider(null);
        return;
      }
      setLinkError("Something went wrong. Please try again.");
      setLinkingProvider(null);
    } catch {
      setLinkError("Something went wrong. Please try again.");
      setLinkingProvider(null);
    }
  }

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
        error?: { code?: string; message?: string };
      };
      if (!res.ok) {
        setError(data.error?.message ?? "Failed to start setup.");
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
        error?: { code?: string; message?: string };
      };
      if (!res.ok) {
        setError(data.error?.message ?? "Invalid code.");
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
      const data = (await res.json()) as {
        error?: { code?: string; message?: string; details?: { code?: string } };
      };
      if (!res.ok) {
        setError(getApiErrorMessage(res, data));
        if (data.error?.details?.code === "STEP_UP_REQUIRED") {
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
        error?: { code?: string; message?: string; details?: { code?: string } };
      };
      if (!res.ok) {
        setError(getApiErrorMessage(res, data));
        if (data.error?.details?.code === "STEP_UP_REQUIRED") {
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
      // Only update local state; API is called when they select a duration (handleAutoLogoutDurationChange).
      setAutoLogoutEnabled(true);
      setAutoLogoutMinutes(null);
      return;
    }
    // Turning off: if they never selected a duration, just revert local state; otherwise call API.
    if (autoLogoutMinutes == null && !initialSecurity.autoLogoutEnabled) {
      setAutoLogoutEnabled(false);
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
        const data = (await res.json()) as {
          error?: { code?: string; message?: string; details?: { code?: string } };
        };
        if (!res.ok) {
          setAutoLogoutError(
            data.error?.details?.code === "STEP_UP_REQUIRED"
              ? "Sign in again to change this setting."
              : getApiErrorMessage(res, data),
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
        const data = (await res.json()) as {
          error?: { code?: string; message?: string; details?: { code?: string } };
        };
        if (!res.ok) {
          setAutoLogoutError(
            data.error?.details?.code === "STEP_UP_REQUIRED"
              ? "Sign in again to change this setting."
              : getApiErrorMessage(res, data),
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

  const hasGoogle = linkedProviders.includes("google");
  const hasMicrosoft = linkedProviders.includes("azure-ad");
  const canLink = authLevel === "FULL";
  const canLinkGoogle = canLink && !hasGoogle;
  const canLinkMicrosoft = canLink && !hasMicrosoft;
  const hasUnlinkedProviders = canLinkGoogle || canLinkMicrosoft;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Sign-in methods */}
      <section className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-4 sm:p-6">
        <h2 className="text-base font-semibold text-(--text-primary)">Sign-in methods</h2>
        <p className="mt-1 text-sm text-(--text-secondary)">
          Linked sign-in methods you can use to access your account.
        </p>

        {linkError && (
          <div className="mt-4 rounded-xl border border-(--color-danger) bg-(--bg-surface) px-4 py-3 text-sm">
            <div className="font-semibold text-(--text-primary)">Account not linked</div>
            <div className="mt-1 text-(--text-secondary)">{linkError}</div>
            <button
              type="button"
              onClick={() => setLinkError(null)}
              className="mt-3 inline-flex text-xs font-medium text-(--text-secondary) hover:text-(--text-primary)"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Linked providers list */}
        <ul className="mt-4 space-y-2 text-sm text-(--text-secondary)">
          {linkedProviders.includes("google") && (
            <li className="flex items-center gap-2">
              <GoogleIcon />
              <span className="font-medium text-(--text-primary)">Google</span>
              <span className="rounded-md border border-(--border-subtle) px-1.5 py-0.5 text-xs">
                Linked
              </span>
            </li>
          )}
          {linkedProviders.includes("azure-ad") && (
            <li className="flex items-center gap-2">
              <MicrosoftIcon />
              <span className="font-medium text-(--text-primary)">Microsoft</span>
              <span className="rounded-md border border-(--border-subtle) px-1.5 py-0.5 text-xs">
                Linked
              </span>
            </li>
          )}
          {linkedProviders.includes("email") && (
            <li className="flex items-center gap-2">
              <span className="font-medium text-(--text-primary)">Magic link / Email</span>
              <span className="rounded-md border border-(--border-subtle) px-1.5 py-0.5 text-xs">
                Linked
              </span>
            </li>
          )}
        </ul>

        {/* Link buttons — only for providers not yet linked */}
        {authLevel === "FULL" && hasUnlinkedProviders && (
          <div className="mt-4 flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              {canLinkGoogle && (
                <button
                  type="button"
                  disabled={!!linkingProvider}
                  onClick={() => handleLinkProvider("google")}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <GoogleIcon />
                  {linkingProvider === "google" ? "Redirecting…" : "Link Google"}
                </button>
              )}
              {canLinkMicrosoft && (
                <button
                  type="button"
                  disabled={!!linkingProvider}
                  onClick={() => handleLinkProvider("azure-ad")}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <MicrosoftIcon />
                  {linkingProvider === "azure-ad" ? "Redirecting…" : "Link Microsoft"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Hint when MFA is pending — show when user could link OAuth after completing sign-in */}
        {authLevel !== "FULL" && (!hasGoogle || !hasMicrosoft) && (
          <p className="mt-2 text-xs text-(--text-muted)">
            Complete sign-in (including 2FA if required) to link additional sign-in methods.
          </p>
        )}
      </section>

      {/* Two-Factor Authentication */}
      <section className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-4 sm:p-6">
        <h2 className="text-base font-semibold text-(--text-primary)">Two-Factor Authentication</h2>
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

        {!totpEnabled &&
          !(backupCodes && backupCodes.length > 0) &&
          !(totpSetupStep === "qr" && setupData) && (
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
                <p className="mb-1 text-xs text-(--text-muted)">Manual entry key:</p>
                <p className="rounded-lg bg-(--bg-surface-elev) p-3 font-mono text-sm break-all text-(--text-primary)">
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
            <form
              onSubmit={handleRegenerateBackupCodes}
              className="mt-4 flex flex-wrap items-end gap-3"
            >
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
            Backup codes generated: {formatBackupCodesDate(initialSecurity.backupCodesGeneratedAt)}
          </p>
        )}
        {error && <p className="mt-4 text-sm text-(--color-danger)">{error}</p>}
      </section>

      {/* Inactivity auto-logout */}
      <section className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-4 sm:p-6">
        <h2 className="text-base font-semibold text-(--text-primary)">Inactivity auto-logout</h2>
        <p className="mt-1 text-sm text-(--text-secondary)">
          {autoLogoutEnabled
            ? autoLogoutMinutes != null
              ? `Log me out after ${formatAutoLogoutLabel(autoLogoutMinutes)} of inactivity.`
              : "Select a duration below to enable auto-logout."
            : "The default auto-logout is 15 days. Turn on the switch to change it."}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={autoLogoutEnabled}
            onClick={() => handleAutoLogoutToggle(!autoLogoutEnabled)}
            disabled={autoLogoutLoading}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus:ring-2 focus:ring-(--color-primary) focus:outline-none disabled:opacity-60 ${
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
              value={
                autoLogoutMinutes != null &&
                AUTO_LOGOUT_OPTIONS.some((o) => o.value === autoLogoutMinutes)
                  ? autoLogoutMinutes
                  : ""
              }
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") return;
                handleAutoLogoutDurationChange(Number(v));
              }}
              disabled={autoLogoutLoading}
              className="ml-2 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2 text-sm text-(--text-primary) focus:ring-2 focus:ring-(--color-primary) focus:outline-none disabled:opacity-60"
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
        {autoLogoutError && <p className="mt-2 text-sm text-(--color-danger)">{autoLogoutError}</p>}
      </section>
    </div>
  );
}

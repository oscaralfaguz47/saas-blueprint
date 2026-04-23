"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { useOAuthPopup, getOAuthAuthorizationUrl } from "@/hooks/use-oauth-popup";
import { registerPasskey } from "@/hooks/use-passkey";
import QRCode from "qrcode";
import { Input } from "@/components/ui/input";
import { StepUpModal } from "@/components/app/step-up-modal";
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

type StepUpSecurityPending =
  | { kind: "disable2fa" }
  | { kind: "regenerateBackup" }
  | { kind: "autoLogoutOff" }
  | { kind: "autoLogoutOn"; minutes: number };

type LinkInitiateResponseBody = {
  data?: { token?: string };
  error?: { code?: string; message?: string };
};

export function parseLinkInitiateResponse(
  resOk: boolean,
  body: LinkInitiateResponseBody
): { token: string | null; errorMessage: string | null } {
  const token = body.data?.token ?? null;
  if (!resOk || !token) {
    return {
      token: null,
      errorMessage: body.error?.message ?? "Failed to initiate linking. Please try again.",
    };
  }
  return { token, errorMessage: null };
}

export function buildLinkIntentCookieValue(
  provider: "azure-ad" | "google",
  token: string
): string {
  const cookieName = `__link_intent_${provider.replace(/-/g, "_")}`;
  // Secure flag: required in HTTPS environments; silently ignored on http://localhost.
  // SameSite=Lax allows the cookie to be sent on the OAuth callback redirect.
  return `${cookieName}=${encodeURIComponent(token)}; Path=/; Max-Age=300; SameSite=Lax; Secure`;
}

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

function DeviceIcon({ deviceType }: { deviceType: string }) {
  if (deviceType === "mobile") {
    return (
      <svg
        className="h-5 w-5 shrink-0 text-(--text-muted)"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <rect x="7" y="2" width="10" height="20" rx="2" ry="2" />
        <line x1="12" y1="18" x2="12.01" y2="18" />
      </svg>
    );
  }
  if (deviceType === "tablet") {
    return (
      <svg
        className="h-5 w-5 shrink-0 text-(--text-muted)"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
        <line x1="12" y1="18" x2="12.01" y2="18" />
      </svg>
    );
  }
  // desktop / unknown
  return (
    <svg
      className="h-5 w-5 shrink-0 text-(--text-muted)"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
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
  const { update: updateSession, data: sessionData } = useSession();
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
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [stepUpPending, setStepUpPending] = useState<StepUpSecurityPending | null>(null);
  const hasTwoFactor = initialSecurity.totpEnabled ?? false;

  const [passkeys, setPasskeys] = useState<
    Array<{
      id: string;
      name: string | null;
      deviceType: string;
      backedUp: boolean;
      createdAt: string;
      lastUsedAt: string | null;
    }>
  >([]);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [registeringPasskey, setRegisteringPasskey] = useState(false);
  const [removingPasskeyId, setRemovingPasskeyId] = useState<string | null>(null);

  type DeviceSession = {
    id: string;
    isCurrent: boolean;
    device: string;
    deviceType: "desktop" | "mobile" | "tablet" | "unknown";
    browser: string;
    os: string;
    ipFirstSeen: string | null;
    lastIp: string | null;
    location: string | null;
    createdAt: string;
    lastActivityAt: string;
    authLevel: string;
  };

  type LoginHistoryItem = {
    id: string;
    action: string;
    label: string;
    method: string | null;
    provider: string | null;
    device: string;
    deviceType: string;
    ipAddress: string | null;
    location: string | null;
    createdAt: string;
  };

  const [deviceSessions, setDeviceSessions] = useState<DeviceSession[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [devicesLoadingMore, setDevicesLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const [loginHistory, setLoginHistory] = useState<LoginHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historyNextCursor, setHistoryNextCursor] = useState<string | null>(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);

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

  async function fetchPasskeys() {
    try {
      const res = await fetch("/api/auth/passkey/credentials");
      if (!res.ok) return;
      const data = (await res.json()) as { data: { credentials: typeof passkeys } };
      setPasskeys(data.data.credentials);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void fetchPasskeys();
  }, []);

  async function fetchDeviceSessions(cursor?: string) {
    const isInitial = !cursor;
    if (isInitial) setDevicesLoading(true);
    else setDevicesLoadingMore(true);

    try {
      const url = cursor
        ? `/api/account/sessions?cursor=${cursor}`
        : "/api/account/sessions";
      const res = await fetch(url);
      if (!res.ok) return;
      const data = (await res.json()) as {
        data: {
          sessions: DeviceSession[];
          nextCursor: string | null;
          hasMore: boolean;
        };
      };
      if (isInitial) {
        setDeviceSessions(data.data.sessions);
      } else {
        setDeviceSessions((prev) => [...prev, ...data.data.sessions]);
      }
      setNextCursor(data.data.nextCursor);
      setHasMore(data.data.hasMore);
    } catch {
      // ignore
    } finally {
      if (isInitial) setDevicesLoading(false);
      else setDevicesLoadingMore(false);
    }
  }

  useEffect(() => {
    void fetchDeviceSessions();
  }, []);

  async function fetchLoginHistory(cursor?: string) {
    const isInitial = !cursor;
    if (isInitial) setHistoryLoading(true);
    else setHistoryLoadingMore(true);
    try {
      const url = cursor
        ? `/api/account/login-history?cursor=${cursor}`
        : "/api/account/login-history";
      const res = await fetch(url);
      if (!res.ok) return;
      const data = (await res.json()) as {
        data: {
          items: LoginHistoryItem[];
          nextCursor: string | null;
          hasMore: boolean;
        };
      };
      if (isInitial) {
        setLoginHistory(data.data.items);
      } else {
        setLoginHistory((prev) => [...prev, ...data.data.items]);
      }
      setHistoryNextCursor(data.data.nextCursor);
      setHistoryHasMore(data.data.hasMore);
    } catch {
      // ignore
    } finally {
      if (isInitial) setHistoryLoading(false);
      else setHistoryLoadingMore(false);
    }
  }

  useEffect(() => {
    void fetchLoginHistory();
  }, []);

  async function handleRevokeSession(sessionId: string) {
    setRevokingSessionId(sessionId);
    setDevicesError(null);
    try {
      const res = await fetch(`/api/account/sessions/${sessionId}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      if (!res.ok) {
        setDevicesError(data.error?.message ?? "Failed to sign out device.");
      } else {
        await fetchDeviceSessions(); // reset to first page
      }
    } catch {
      setDevicesError("Something went wrong.");
    } finally {
      setRevokingSessionId(null);
    }
  }

  async function handleRevokeOthers() {
    setRevokingOthers(true);
    setDevicesError(null);
    try {
      const res = await fetch("/api/account/sessions/revoke-others", {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      if (!res.ok) {
        setDevicesError(data.error?.message ?? "Failed to sign out other devices.");
      } else {
        await fetchDeviceSessions(); // reset to first page
      }
    } catch {
      setDevicesError("Something went wrong.");
    } finally {
      setRevokingOthers(false);
    }
  }

  function ActionIcon({ action }: { action: string }) {
    const isSent = action === "auth.otp.sent";
    const isSignout = action === "auth.signout";
    const isFailed = action.includes("failed");
    if (isSent) {
      return (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-(--bg-surface-elev)">
          <svg className="h-4 w-4 text-(--text-muted)" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
        </div>
      );
    }
    if (isSignout) {
      return (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-(--bg-surface-elev)">
          <svg className="h-4 w-4 text-(--text-muted)" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </div>
      );
    }
    if (isFailed) {
      return (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-(--color-danger)/10">
          <svg className="h-4 w-4 text-(--color-danger)" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        </div>
      );
    }
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-(--color-success)/10">
        <svg className="h-4 w-4 text-(--color-success)" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
          <polyline points="10 17 15 12 10 7"/>
          <line x1="15" y1="12" x2="3" y2="12"/>
        </svg>
      </div>
    );
  }

  async function handleLinkProvider(provider: "azure-ad" | "google") {
    setLinkError(null);
    setLinkingProvider(provider);
    try {
      const res = await fetch("/api/account/link-provider/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      // Server uses the standard `apiSuccess` envelope: { data: { token } }
      // Errors use the standard error envelope: { error: { code, message } }
      const body = (await res.json().catch(() => ({}))) as LinkInitiateResponseBody;
      const { token, errorMessage } = parseLinkInitiateResponse(res.ok, body);

      if (!token) {
        setLinkError(errorMessage ?? "Failed to initiate linking. Please try again.");
        setLinkingProvider(null);
        return;
      }
      document.cookie = buildLinkIntentCookieValue(provider, token);

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
        showToastOnError: false,
      });
      const data = (await res.json()) as {
        error?: { code?: string; message?: string; details?: { code?: string } };
      };
      if (!res.ok) {
        if (data.error?.details?.code === "STEP_UP_REQUIRED") {
          setError(null);
          setStepUpPending({ kind: "disable2fa" });
          setStepUpOpen(true);
          setLoadingDisable(false);
          return;
        }
        setError(getApiErrorMessage(res, data));
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
        showToastOnError: false,
      });
      const data = (await res.json()) as {
        data?: { backupCodes?: string[] };
        error?: { code?: string; message?: string; details?: { code?: string } };
      };
      if (!res.ok) {
        if (data.error?.details?.code === "STEP_UP_REQUIRED") {
          setError(null);
          setStepUpPending({ kind: "regenerateBackup" });
          setStepUpOpen(true);
          setLoadingRegenerate(false);
          return;
        }
        setError(getApiErrorMessage(res, data));
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
      showToastOnError: false,
    })
      .then(async (res) => {
        const data = (await res.json()) as {
          error?: { code?: string; message?: string; details?: { code?: string } };
        };
        if (!res.ok) {
          if (data.error?.details?.code === "STEP_UP_REQUIRED") {
            setAutoLogoutError(null);
            setStepUpPending({ kind: "autoLogoutOff" });
            setStepUpOpen(true);
            return;
          }
          setAutoLogoutError(getApiErrorMessage(res, data));
          return;
        }
        setAutoLogoutEnabled(false);
        setAutoLogoutMinutes(null);
        void updateSession();
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
      showToastOnError: false,
    })
      .then(async (res) => {
        const data = (await res.json()) as {
          error?: { code?: string; message?: string; details?: { code?: string } };
        };
        if (!res.ok) {
          if (data.error?.details?.code === "STEP_UP_REQUIRED") {
            setAutoLogoutError(null);
            setStepUpPending({ kind: "autoLogoutOn", minutes });
            setStepUpOpen(true);
            return;
          }
          setAutoLogoutError(getApiErrorMessage(res, data));
          return;
        }
        setAutoLogoutEnabled(true);
        setAutoLogoutMinutes(minutes);
        void updateSession();
        router.refresh();
      })
      .catch(() => setAutoLogoutError("Something went wrong."))
      .finally(() => setAutoLogoutLoading(false));
  };

  function getStepUpActionLabel(
    pending: typeof stepUpPending,
  ): string | null {
    if (!pending) return null;
    switch (pending.kind) {
      case "disable2fa":
        return "disable two-factor authentication";
      case "regenerateBackup":
        return "regenerate backup codes";
      case "autoLogoutOff":
        return "disable inactivity auto-logout";
      case "autoLogoutOn":
        return "update inactivity auto-logout";
      default:
        return null;
    }
  }

  async function handleRegisterPasskey() {
    setPasskeyError(null);
    setRegisteringPasskey(true);
    setTimeout(() => {
      setRegisteringPasskey(false);
    }, 3000);
    try {
      const name = `${navigator.platform ?? "Device"} - ${new Date().toLocaleDateString()}`;
      const result = await registerPasskey(name);
      if (!result.success) {
        if (result.error !== "cancelled") {
          setPasskeyError(result.message);
        }
        return;
      }
      await fetchPasskeys();
    } catch {
      setPasskeyError("Something went wrong. Please try again.");
    } finally {
      setRegisteringPasskey(false);
    }
  }

  async function handleRemovePasskey(credentialId: string) {
    setRemovingPasskeyId(credentialId);
    try {
      const res = await fetch("/api/auth/passkey/credentials", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId }),
      });
      const data = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setPasskeyError(data.error?.message ?? "Failed to remove passkey.");
      } else {
        await fetchPasskeys();
      }
    } catch {
      setPasskeyError("Something went wrong.");
    }
    setRemovingPasskeyId(null);
  }

  const hasGoogle = linkedProviders.includes("google");
  const hasMicrosoft = linkedProviders.includes("azure-ad");
  const canLink = authLevel === "FULL";
  const canLinkGoogle = canLink && !hasGoogle;
  const canLinkMicrosoft = canLink && !hasMicrosoft;
  const hasUnlinkedProviders = canLinkGoogle || canLinkMicrosoft;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Two-Factor Authentication */}
      <section className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-4 sm:p-6">
        <h2 className="text-base font-bold text-(--text-primary)">Two-Factor Authentication</h2>
        <p className="mt-1 text-sm text-(--text-secondary)">
          Add an extra layer of security with an authenticator app.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {totpEnabled || (backupCodes && backupCodes.length > 0) ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-sm font-semibold text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Enabled
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-3 py-1 text-sm font-medium text-(--text-muted)">
              <span className="h-2 w-2 rounded-full bg-(--border-strong)" />
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
                className="inline-flex h-10 cursor-pointer items-center justify-center rounded-xl bg-(--color-primary) px-4 text-sm font-medium text-white transition-colors hover:bg-(--color-primary-hover) disabled:opacity-60"
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
                className="inline-flex h-10 cursor-pointer items-center justify-center rounded-xl bg-(--color-primary) px-4 text-sm font-medium text-white transition-colors hover:bg-(--color-primary-hover) disabled:opacity-60"
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
                className="inline-flex h-10 cursor-pointer items-center justify-center rounded-xl border border-(--border-subtle) px-4 text-sm font-medium text-(--text-primary) transition-colors hover:border-(--border-strong) hover:bg-(--bg-surface-elev) disabled:opacity-60"
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
                className="inline-flex h-10 cursor-pointer items-center justify-center rounded-xl border border-(--border-subtle) px-4 text-sm font-medium text-(--text-primary) transition-colors hover:border-(--border-strong) hover:bg-(--bg-surface-elev) disabled:opacity-60"
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
      {/* Passkeys */}
      <section className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-4 sm:p-6">
        <h2 className="text-base font-bold text-(--text-primary)">Passkeys</h2>
        <p className="mt-1 text-sm text-(--text-secondary)">
          Sign in with Face ID, Touch ID, or Windows Hello — no password required.
        </p>

        {passkeys.length > 0 && (
          <ul className="mt-4 space-y-2">
            {passkeys.map((pk) => (
              <li
                key={pk.id}
                className="flex items-center justify-between rounded-xl border border-(--border-subtle) bg-(--bg-surface-elev) px-4 py-3 transition-colors hover:border-(--border-strong)"
              >
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-(--text-primary)">
                    {pk.name ?? "Passkey"}
                  </span>
                  <span className="text-xs text-(--text-muted)">
                    {pk.backedUp ? "Synced" : "Device-only"}
                  </span>
                  <span className="text-xs text-(--text-muted)">
                    Added {new Date(pk.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemovePasskey(pk.id)}
                  disabled={!!removingPasskeyId}
                  className="cursor-pointer text-xs font-medium text-(--color-danger) transition-colors hover:text-red-400 disabled:opacity-60"
                >
                  {removingPasskeyId === pk.id ? "Removing..." : "Remove"}
                </button>
              </li>
            ))}
          </ul>
        )}

        {passkeyError && (
          <p className="mt-2 text-sm text-(--color-danger)">{passkeyError}</p>
        )}

        {authLevel === "FULL" && (
          <div className="mt-4">
            <button
              type="button"
              onClick={handleRegisterPasskey}
              className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-medium text-(--text-primary) transition-colors hover:border-(--border-strong) hover:bg-(--bg-surface-elev) disabled:cursor-not-allowed disabled:opacity-60"
            >
              {registeringPasskey ? "Registering..." : "Add Passkey"}
            </button>
          </div>
        )}
      </section>
      {/* Sign-in methods */}
      <section className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-4 sm:p-6">
        <h2 className="text-base font-bold text-(--text-primary)">Sign-in methods</h2>
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
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                Linked
              </span>
            </li>
          )}
          {linkedProviders.includes("azure-ad") && (
            <li className="flex items-center gap-2">
              <MicrosoftIcon />
              <span className="font-medium text-(--text-primary)">Microsoft</span>
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                Linked
              </span>
            </li>
          )}
          {linkedProviders.includes("email") && (
            <li className="flex items-center gap-2">
              <span className="font-medium text-(--text-primary)">Magic link / Email</span>
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
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
                  className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-medium text-(--text-primary) transition-colors hover:border-(--border-strong) hover:bg-(--bg-surface-elev) disabled:cursor-not-allowed disabled:opacity-60"
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
                  className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-medium text-(--text-primary) transition-colors hover:border-(--border-strong) hover:bg-(--bg-surface-elev) disabled:cursor-not-allowed disabled:opacity-60"
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
      {/* Inactivity auto-logout */}
      <section className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-4 sm:p-6">
        <h2 className="text-base font-bold text-(--text-primary)">Inactivity auto-logout</h2>
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
              className="ml-2 cursor-pointer rounded-xl border border-(--border-subtle) bg-(--bg-surface) px-3 py-2 text-sm text-(--text-primary) transition-colors focus:ring-2 focus:ring-(--color-primary) focus:outline-none disabled:opacity-60"
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
      {/* Devices */}
      <section className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-(--text-primary)">Devices</h2>
            <p className="mt-1 text-sm text-(--text-secondary)">
              Active sessions on your account. Sign out any device you don&apos;t recognize.
            </p>
          </div>
          {deviceSessions.filter((s) => !s.isCurrent).length > 0 && (
            <button
              type="button"
              onClick={handleRevokeOthers}
              disabled={revokingOthers}
              className="inline-flex h-8 shrink-0 cursor-pointer items-center rounded-lg border border-(--color-danger)/30 bg-(--color-danger)/5 px-3 text-xs font-semibold text-(--color-danger) transition-colors hover:bg-(--color-danger)/10 disabled:opacity-60"
            >
              {revokingOthers ? "Signing out..." : "Sign out all other devices"}
            </button>
          )}
        </div>

        {devicesError && (
          <p className="mt-2 text-sm text-(--color-danger)">{devicesError}</p>
        )}

        {devicesLoading ? (
          <div className="mt-4 space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-lg bg-(--bg-surface-elev)"
              />
            ))}
          </div>
        ) : (
          <div className="relative mt-4">
            <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {deviceSessions.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-3 rounded-xl border border-(--border-subtle) bg-(--bg-surface-elev) px-4 py-3 transition-colors hover:border-(--border-strong)"
                >
                  <DeviceIcon deviceType={s.deviceType} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-(--text-primary) truncate">
                        {s.device}
                      </span>
                      {s.isCurrent && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
                          This device
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-(--text-muted)">
                      {s.location && <span>{s.location}</span>}
                      {s.location && s.lastIp && <span>·</span>}
                      {!s.location && s.lastIp && <span>{s.lastIp}</span>}
                      {(s.location || s.lastIp) && <span>·</span>}
                      <span>
                        Last active{" "}
                        {new Date(s.lastActivityAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                  {!s.isCurrent && (
                    <button
                      type="button"
                      onClick={() => handleRevokeSession(s.id)}
                      disabled={!!revokingSessionId}
                      className="shrink-0 cursor-pointer text-xs font-medium text-(--color-danger) transition-colors hover:text-red-400 disabled:opacity-60"
                    >
                      {revokingSessionId === s.id ? "Signing out..." : "Sign out"}
                    </button>
                  )}
                </li>
              ))}

              {deviceSessions.length === 0 && (
                <li className="py-4 text-center text-sm text-(--text-muted)">
                  No active sessions found.
                </li>
              )}
            </ul>

            {/* Fade gradient when more items exist */}
            {hasMore && !devicesLoadingMore && (
              <div className="pointer-events-none absolute bottom-8 left-0 right-0 h-8 rounded-b-lg bg-gradient-to-t from-(--bg-surface) to-transparent" />
            )}

            {/* Load more button */}
            {hasMore && (
              <button
                type="button"
                onClick={() => void fetchDeviceSessions(nextCursor ?? undefined)}
                disabled={devicesLoadingMore}
                className="mt-3 w-full cursor-pointer rounded-xl border border-(--border-subtle) py-2.5 text-xs font-semibold text-(--text-muted) transition-all hover:border-(--border-strong) hover:bg-(--bg-surface-elev) hover:text-(--text-primary) disabled:opacity-60"
              >
                {devicesLoadingMore ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    Loading...
                  </span>
                ) : (
                  "Show more devices"
                )}
              </button>
            )}
          </div>
        )}
      </section>
      {/* Login History */}
      <section className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-4 sm:p-6">
        <h2 className="text-base font-bold text-(--text-primary)">
          Login history
        </h2>
        <p className="mt-1 text-sm text-(--text-secondary)">
          Recent sign-in and sign-out activity on your account.
        </p>

        {historyLoading ? (
          <div className="mt-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-8 w-8 animate-pulse rounded-full bg-(--bg-surface-elev)" />
                <div className="flex-1 space-y-1">
                  <div className="h-3 w-32 animate-pulse rounded bg-(--bg-surface-elev)" />
                  <div className="h-3 w-48 animate-pulse rounded bg-(--bg-surface-elev)" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4">
            {loginHistory.length === 0 ? (
              <p className="py-4 text-center text-sm text-(--text-muted)">
                No login history found.
              </p>
            ) : (
              <ul className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {loginHistory.map((item) => (
                  <li key={item.id} className="flex items-start gap-3">
                    <ActionIcon action={item.action} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-(--text-primary)">
                          {item.label}
                        </p>
                        {item.method && item.action !== "auth.signout" && (
                          <span className="rounded-md border border-(--border-subtle) px-1.5 py-0.5 text-xs text-(--text-muted) capitalize">
                            {item.method === "magic_link" ? "Magic link" :
                             item.method === "email_otp" ? "Email code" :
                             item.method === "passkey" ? "Passkey" :
                             item.method === "google" ? "Google" :
                             item.method === "microsoft" ? "Microsoft" :
                             item.method}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-(--text-muted)">
                        {item.device !== "Unknown · Unknown" && item.device !== "Unknown Device" && (
                          <>
                            <span>{item.device}</span>
                            <span>·</span>
                          </>
                        )}
                        {(item.location ?? item.ipAddress) && (
                          <>
                            <span>{item.location ?? item.ipAddress}</span>
                            <span>·</span>
                          </>
                        )}
                        <span>
                          {new Date(item.createdAt).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {historyHasMore && (
              <button
                type="button"
                onClick={() => void fetchLoginHistory(historyNextCursor ?? undefined)}
                disabled={historyLoadingMore}
                className="mt-3 w-full cursor-pointer rounded-xl border border-(--border-subtle) py-2.5 text-xs font-semibold text-(--text-muted) transition-all hover:border-(--border-strong) hover:bg-(--bg-surface-elev) hover:text-(--text-primary) disabled:opacity-60"
              >
                {historyLoadingMore ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    Loading...
                  </span>
                ) : (
                  "Show more"
                )}
              </button>
            )}
          </div>
        )}
      </section>
      <StepUpModal
        open={stepUpOpen}
        onClose={() => {
          setStepUpOpen(false);
          setStepUpPending(null);
        }}
        onSuccess={() => {
          void (async () => {
            setStepUpOpen(false);
            const pending = stepUpPending;
            setStepUpPending(null);
            if (!pending) return;
            if (pending.kind === "disable2fa") {
              await handleDisable({ preventDefault: () => {} } as React.FormEvent);
            } else if (pending.kind === "regenerateBackup") {
              await handleRegenerateBackupCodes({ preventDefault: () => {} } as React.FormEvent);
            } else if (pending.kind === "autoLogoutOff") {
              setAutoLogoutLoading(true);
              setAutoLogoutError(null);
              try {
                const res = await apiFetch("/api/account/auto-logout", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ enabled: false }),
                  showToastOnError: false,
                });
                const data = (await res.json()) as {
                  error?: { code?: string; message?: string; details?: { code?: string } };
                };
                if (!res.ok) {
                  setAutoLogoutError(getApiErrorMessage(res, data));
                  return;
                }
                setAutoLogoutEnabled(false);
                setAutoLogoutMinutes(null);
                void updateSession();
                router.refresh();
              } catch {
                setAutoLogoutError("Something went wrong.");
              } finally {
                setAutoLogoutLoading(false);
              }
            } else if (pending.kind === "autoLogoutOn") {
              setAutoLogoutLoading(true);
              setAutoLogoutError(null);
              try {
                const res = await apiFetch("/api/account/auto-logout", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ enabled: true, minutes: pending.minutes }),
                  showToastOnError: false,
                });
                const data = (await res.json()) as {
                  error?: { code?: string; message?: string; details?: { code?: string } };
                };
                if (!res.ok) {
                  setAutoLogoutError(getApiErrorMessage(res, data));
                  return;
                }
                setAutoLogoutEnabled(true);
                setAutoLogoutMinutes(pending.minutes);
                void updateSession();
                router.refresh();
              } catch {
                setAutoLogoutError("Something went wrong.");
              } finally {
                setAutoLogoutLoading(false);
              }
            }
          })();
        }}
        hasTwoFactor={hasTwoFactor}
        email={sessionData?.user?.email ?? null}
        actionLabel={getStepUpActionLabel(stepUpPending)}
      />
    </div>
  );
}

"use client";

import { startRegistration, startAuthentication } from "@simplewebauthn/browser";

function withFocusAbort<T>(promise: Promise<T>, delayMs = 500): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    promise
      .then((v) => settle(() => resolve(v)))
      .catch((e) => settle(() => reject(e)));

    // When the window regains focus, the credential picker was likely dismissed.
    // Wait a short delay to allow the WebAuthn promise to settle first.
    let focusTimer: ReturnType<typeof setTimeout> | null = null;

    const onFocus = () => {
      focusTimer = setTimeout(() => {
        if (!settled) {
          settle(() =>
            reject(
              Object.assign(new Error("NotAllowedError: user dismissed"), {
                name: "NotAllowedError",
              })
            )
          );
        }
      }, delayMs);
    };

    const onBlur = () => {
      if (focusTimer) {
        clearTimeout(focusTimer);
        focusTimer = null;
      }
    };

    const cleanup = () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      if (focusTimer) clearTimeout(focusTimer);
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
  });
}

export type PasskeyError =
  | "not_supported"
  | "cancelled"
  | "already_registered"
  | "server_error"
  | "verification_failed";

export async function registerPasskey(
  credentialName?: string
): Promise<
  | { success: true }
  | { success: false; error: PasskeyError; message: string }
> {
  if (!window.PublicKeyCredential) {
    return {
      success: false,
      error: "not_supported",
      message: "Passkeys are not supported on this device or browser.",
    };
  }

  try {
    // Get registration options from server
    const optRes = await fetch("/api/auth/passkey/register/options", { method: "POST" });
    if (!optRes.ok)
      return { success: false, error: "server_error", message: "Failed to start registration." };
    const optData = (await optRes.json()) as { data: Record<string, unknown> };
    const options = optData.data;

    // Start WebAuthn registration in browser
    const registrationResponse = await withFocusAbort(
      startRegistration({ optionsJSON: options as never })
    );

    // Verify with server
    const verRes = await fetch("/api/auth/passkey/register/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response: registrationResponse, name: credentialName }),
    });

    if (!verRes.ok) {
      const err = (await verRes.json().catch(() => ({}))) as { error?: { message?: string } };
      return {
        success: false,
        error: "verification_failed",
        message: err.error?.message ?? "Registration failed.",
      };
    }

    return { success: true };
  } catch (err) {
    const isCancelled =
      err instanceof Error &&
      (err.name === "NotAllowedError" ||
        err.name === "AbortError" ||
        err.message?.toLowerCase().includes("cancel") ||
        err.message?.toLowerCase().includes("not allowed") ||
        err.message?.toLowerCase().includes("dismissed"));

    if (isCancelled) {
      return { success: false, error: "cancelled", message: "Registration was cancelled." };
    }
    if (err instanceof Error && err.name === "InvalidStateError") {
      return {
        success: false,
        error: "already_registered",
        message: "This device is already registered.",
      };
    }
    return {
      success: false,
      error: "server_error",
      message: "Something went wrong. Please try again.",
    };
  }
}

export async function authenticateWithPasskey(
  userId?: string
): Promise<
  | { success: true; passkeyToken: string }
  | { success: false; error: PasskeyError; message: string }
> {
  if (!window.PublicKeyCredential) {
    return {
      success: false,
      error: "not_supported",
      message: "Passkeys are not supported on this device or browser.",
    };
  }

  try {
    // Get authentication options from server
    const optRes = await fetch("/api/auth/passkey/authenticate/options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!optRes.ok)
      return { success: false, error: "server_error", message: "Failed to start authentication." };
    const optData = (await optRes.json()) as {
      data: { options: Record<string, unknown>; challengeKey: string };
    };
    const { options, challengeKey } = optData.data;

    // Start WebAuthn authentication in browser
    const authResponse = await withFocusAbort(
      startAuthentication({ optionsJSON: options as never })
    );

    // Verify with server
    const verRes = await fetch("/api/auth/passkey/authenticate/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeKey, response: authResponse }),
    });

    if (!verRes.ok) {
      return {
        success: false,
        error: "verification_failed",
        message: "Authentication failed. Please try again.",
      };
    }

    const verData = (await verRes.json()) as { data: { passkeyToken: string } };
    return { success: true, passkeyToken: verData.data.passkeyToken };
  } catch (err) {
    // Detect all cancellation/dismissal scenarios
    const isCancelled =
      err instanceof Error &&
      (err.name === "NotAllowedError" ||
        err.name === "AbortError" ||
        err.message?.toLowerCase().includes("cancel") ||
        err.message?.toLowerCase().includes("not allowed") ||
        err.message?.toLowerCase().includes("dismissed") ||
        err.message?.toLowerCase().includes("user cancelled") ||
        err.message?.toLowerCase().includes("no credentials") ||
        err.message?.toLowerCase().includes("no passkey"));

    if (isCancelled) {
      return {
        success: false,
        error: "cancelled",
        message: "Authentication was cancelled.",
      };
    }
    return {
      success: false,
      error: "server_error",
      message: "Something went wrong. Please try again.",
    };
  }
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { normalizeSlug } from "@/lib/validations";

const CURRENCY_OPTIONS: { value: string; label: string }[] = [
  { value: "USD", label: "USD — United States Dollar" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "GBP", label: "GBP — British Pound" },
  { value: "CAD", label: "CAD — Canadian Dollar" },
  { value: "AUD", label: "AUD — Australian Dollar" },
  { value: "MXN", label: "MXN — Mexican Peso" },
  { value: "CRC", label: "CRC — Costa Rican Colón" },
  { value: "BRL", label: "BRL — Brazilian Real" },
  { value: "COP", label: "COP — Colombian Peso" },
  { value: "ARS", label: "ARS — Argentine Peso" },
  { value: "CLP", label: "CLP — Chilean Peso" },
  { value: "PEN", label: "PEN — Peruvian Sol" },
  { value: "CHF", label: "CHF — Swiss Franc" },
  { value: "JPY", label: "JPY — Japanese Yen" },
  { value: "CNY", label: "CNY — Chinese Yuan" },
  { value: "INR", label: "INR — Indian Rupee" },
];

const DATE_FORMAT_OPTIONS: { value: string; label: string }[] = [
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY (US format)" },
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY (Most of the world)" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD (ISO standard)" },
  { value: "DD MMM YYYY", label: "DD MMM YYYY (05 Jan 2026)" },
  { value: "MMM DD, YYYY", label: "MMM DD, YYYY (Jan 05, 2026)" },
];

function getTimeZones(): string[] {
  if (typeof Intl !== "undefined" && "supportedValuesOf" in Intl) {
    try {
      const supportedValuesOf = (Intl as { supportedValuesOf: (key: string) => string[] }).supportedValuesOf;
      return supportedValuesOf("timeZone").sort();
    } catch {
      return ["UTC"];
    }
  }
  return ["UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Paris", "Asia/Tokyo"];
}

type Tenant = {
  id: string;
  name: string;
  slug: string;
  status: string;
  logoObjectKey?: string | null;
  timezone?: string | null;
  currency?: string | null;
  dateFormat?: string | null;
  description?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called when user closes or saves after creating a workspace; redirects to Requests. */
  onCloseAfterCreate?: () => void;
  mode?: "create" | "settings";
};

const MAX_LOGO_PIXELS = 512;
const COMPRESS_THRESHOLD_BYTES = 256 * 1024; // compress if larger than 256KB
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** Resize/compress image for logo upload. Returns blob, contentType, and extension for upload-url. */
function prepareLogoImage(file: File): Promise<{ blob: Blob; contentType: string; extension: string }> {
  return new Promise((resolve, reject) => {
    if (file.size === 0) {
      reject(new Error("File is empty. Please choose another image."));
      return;
    }
    const shouldCompress = file.size > COMPRESS_THRESHOLD_BYTES;
    if (!shouldCompress) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const extMap: Record<string, string> = { jpg: "jpeg", png: "png", webp: "webp", jpeg: "jpeg" };
      resolve({
        blob: file,
        contentType: file.type,
        extension: extMap[ext] || ext,
      });
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      let width = w;
      let height = h;
      if (w > MAX_LOGO_PIXELS || h > MAX_LOGO_PIXELS) {
        if (w >= h) {
          width = MAX_LOGO_PIXELS;
          height = Math.round((h * MAX_LOGO_PIXELS) / w);
        } else {
          height = MAX_LOGO_PIXELS;
          width = Math.round((w * MAX_LOGO_PIXELS) / h);
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve({ blob: file, contentType: file.type, extension: file.name.split(".").pop()?.toLowerCase() || "png" });
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve({ blob: file, contentType: file.type, extension: "jpeg" });
            return;
          }
          resolve({ blob, contentType: "image/jpeg", extension: "jpeg" });
        },
        "image/jpeg",
        0.85
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image. Please choose a valid image file."));
    };
    img.src = url;
  });
}

function getApiMessage(res: { error?: string; message?: string }) {
  if (res.message) return res.message;
  if (res.error === "CONFLICT") return "That workspace URL is already taken. Please choose a different slug.";
  if (res.error === "VALIDATION_ERROR") return "Please check the value and try again.";
  return "Something went wrong. Please try again.";
}

export function CreateWorkspaceModal({ open, onClose, onCloseAfterCreate, mode = "create" }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<"create" | "settings">("create");
  const [settingsLoadStatus, setSettingsLoadStatus] = useState<"idle" | "loading" | "error">("idle");
  const [slug, setSlug] = useState("");
  const [createStatus, setCreateStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [createError, setCreateError] = useState<string | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [settings, setSettings] = useState({
    name: "",
    timezone: "",
    currency: "USD",
    dateFormat: "MM/DD/YYYY",
    description: "",
  });
  const [settingsStatus, setSettingsStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [logoStatus, setLogoStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [logoError, setLogoError] = useState<string | null>(null);
  const [timezoneOpen, setTimezoneOpen] = useState(false);
  const [timezoneSearch, setTimezoneSearch] = useState("");
  const timezoneListRef = useRef<HTMLDivElement>(null);
  const timezoneInputRef = useRef<HTMLInputElement>(null);
  const timeZones = useMemo(() => getTimeZones(), []);
  const filteredTimeZones = useMemo(() => {
    const q = timezoneSearch.trim().toLowerCase();
    if (!q) return timeZones.slice(0, 100);
    return timeZones.filter((tz) => tz.toLowerCase().includes(q)).slice(0, 100);
  }, [timeZones, timezoneSearch]);

  useEffect(() => {
    if (!timezoneOpen) return;
    function onPointerDown(e: PointerEvent) {
      const el = timezoneListRef.current;
      if (el && !el.contains(e.target as Node)) setTimezoneOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [timezoneOpen]);

  useEffect(() => {
    if (!open || mode !== "settings") return;
    let cancelled = false;
    queueMicrotask(() => setSettingsLoadStatus("loading"));
    (async () => {
      try {
        const listRes = await fetch("/api/tenant");
        const listData = (await listRes.json()) as { data?: { tenants?: { id: string; isDefaultTenant: boolean }[] } };
        const tenants = listData.data?.tenants ?? [];
        const defaultTenant = tenants.find((t) => t.isDefaultTenant) ?? tenants[0];
        if (cancelled || !defaultTenant) {
          setSettingsLoadStatus("error");
          return;
        }
        const detailRes = await fetch(`/api/tenant/${defaultTenant.id}`);
        const detailData = (await detailRes.json()) as { data?: { tenant?: Tenant } };
        const tenant = detailData.data?.tenant;
        if (cancelled || !tenant) {
          setSettingsLoadStatus("error");
          return;
        }
        setTenant(tenant);
        setSettings({
          name: tenant.name ?? "",
          timezone: tenant.timezone ?? (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC"),
          currency: tenant.currency ?? "USD",
          dateFormat: tenant.dateFormat ?? "MM/DD/YYYY",
          description: tenant.description ?? "",
        });
        setSettingsLoadStatus("idle");
      } catch {
        if (!cancelled) setSettingsLoadStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, mode]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateStatus("submitting");
    const normalizedSlug = normalizeSlug(slug);
    if (!normalizedSlug) {
      setCreateError("Workspace URL is required.");
      setCreateStatus("error");
      return;
    }
    try {
      const res = await fetch("/api/tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: normalizedSlug }),
      });
      const data = (await res.json()) as { data?: { tenant?: Tenant }; error?: string; message?: string };
      if (!res.ok) {
        setCreateError(getApiMessage(data));
        setCreateStatus("error");
        return;
      }
      const created = data.data?.tenant;
      if (!created) {
        setCreateError("Invalid response.");
        setCreateStatus("error");
        return;
      }
      setTenant(created);
      const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
      const currency = typeof Intl !== "undefined" ? (Intl.NumberFormat().resolvedOptions().currency ?? "USD") : "USD";
      setSettings((s) => ({ ...s, name: created.name, timezone: tz, currency }));
      setStep("settings");
      setCreateStatus("idle");
      // Ensure the new workspace is selected as default before redirect so navbar/sidebar show it
      const hasDefault = await fetch("/api/tenant").then(async (r) => {
        const j = await r.json();
        const tenants = (j.data as { tenants?: { id: string; isDefaultTenant: boolean }[] })?.tenants ?? [];
        return tenants.some((t) => t.isDefaultTenant && t.id === created.id);
      });
      if (!hasDefault) {
        await fetch("/api/tenant", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId: created.id }),
        });
      }
      router.refresh();
      // Stay in modal on settings step with success message; redirect only when user closes or saves (handleClose / handleSettingsSubmit)
    } catch {
      setCreateError("Something went wrong. Please try again.");
      setCreateStatus("error");
    }
  };

  const handleLogoUpload = async (file: File) => {
    if (!tenant) return;
    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setLogoError("Use PNG, JPEG, or WebP.");
      setLogoStatus("error");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError("Max file size is 2MB.");
      setLogoStatus("error");
      return;
    }
    setLogoError(null);
    setLogoStatus("uploading");
    try {
      const { blob, contentType, extension } = await prepareLogoImage(file);
      if (blob.size === 0) {
        setLogoError("File is empty or could not be read. Please choose another image.");
        setLogoStatus("error");
        return;
      }
      if (blob.size > MAX_LOGO_BYTES) {
        setLogoError("Image is still too large after compression. Try a smaller image.");
        setLogoStatus("error");
        return;
      }
      const resUrl = await fetch(`/api/tenant/${tenant.id}/logo/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentType,
          contentLength: blob.size,
          extension: extension === "jpg" ? "jpeg" : extension,
        }),
      });
      const urlData = (await resUrl.json()) as {
        data?: { uploadUrl?: string; objectKey?: string };
        error?: string;
        message?: string;
      };
      if (!resUrl.ok || !urlData.data?.uploadUrl || !urlData.data?.objectKey) {
        const msg =
          urlData.error === "SERVICE_UNAVAILABLE"
            ? "Logo upload is not configured. Add R2_* env vars (see docs/R2_SETUP.md)."
            : (urlData.message as string) || "Failed to get upload URL.";
        setLogoError(msg);
        setLogoStatus("error");
        return;
      }
      const putRes = await fetch(urlData.data.uploadUrl, {
        method: "PUT",
        body: blob,
        headers: { "Content-Type": contentType },
      });
      if (!putRes.ok) {
        setLogoError(`Upload to storage failed (${putRes.status}). Check R2 bucket and CORS.`);
        setLogoStatus("error");
        return;
      }
      const resConfirm = await fetch(`/api/tenant/${tenant.id}/logo/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectKey: urlData.data.objectKey }),
      });
      const confirmData = (await resConfirm.json()) as { error?: string; message?: string };
      if (!resConfirm.ok) {
        setLogoError((confirmData.message as string) || "Upload could not be confirmed. Try again.");
        setLogoStatus("error");
        return;
      }
      setLogoStatus("idle");
      setLogoError(null);
      setTenant((t) => (t ? { ...t, logoObjectKey: urlData.data!.objectKey } : null));
      router.refresh();
    } catch (err) {
      console.error("Logo upload error:", err);
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setLogoError(msg);
      setLogoStatus("error");
    }
  };

  const handleSettingsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;
    setSettingsError(null);
    setSettingsStatus("submitting");
    try {
      const res = await fetch(`/api/tenant/${tenant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: settings.name || undefined,
          timezone: settings.timezone || undefined,
          currency: settings.currency || undefined,
          dateFormat: settings.dateFormat || undefined,
          description: settings.description || undefined,
        }),
      });
      const data = (await res.json()) as { data?: { tenant?: Tenant }; error?: string; message?: string };
      if (!res.ok) {
        setSettingsError(getApiMessage(data));
        setSettingsStatus("error");
        return;
      }
      if (data.data?.tenant) setTenant(data.data.tenant);
      setSettingsStatus("idle");
      router.refresh();
      // Notify sidebar to refetch so workspace list shows updated name/icon
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("workspace-updated"));
      }
      // Post-create: close then redirect (skip redirect in handleClose to avoid double call)
      if (mode === "create") {
        handleClose(true);
        queueMicrotask(() => onCloseAfterCreate?.());
      } else {
        handleClose();
      }
    } catch {
      setSettingsError("Something went wrong. Please try again.");
      setSettingsStatus("error");
    }
  };

  const handleClose = (skipRedirectAfterCreate?: boolean) => {
    const wasPostCreate = step === "settings" && mode === "create";
    setStep("create");
    setSlug("");
    setCreateError(null);
    setCreateStatus("idle");
    setTenant(null);
    setSettings({ name: "", timezone: "", currency: "USD", dateFormat: "MM/DD/YYYY", description: "" });
    setSettingsError(null);
    setSettingsStatus("idle");
    setSettingsLoadStatus("idle");
    onClose();
    // Redirect after closing so it's not lost during unmount; run in next tick
    if (wasPostCreate && !skipRedirectAfterCreate) {
      queueMicrotask(() => onCloseAfterCreate?.());
    }
  };

  const isSubmitting = createStatus === "submitting" || settingsStatus === "submitting";
  const title = step === "create" && mode === "create" ? "Create workspace" : "Workspace Settings";
  const description =
    step === "settings" && mode === "settings"
      ? "Update your workspace settings."
      : undefined;

  return (
    <Dialog
      open={open}
      onClose={() => handleClose()}
      title={title}
      description={description}
      closeDisabled={isSubmitting}
    >
      {step === "create" && mode === "create" ? (
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div>
            <label htmlFor="workspace-slug" className="block text-sm font-medium text-(--text-primary)">
              Workspace URL
            </label>
            <input
              id="workspace-slug"
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="e.g. acme-inc"
              maxLength={80}
              disabled={createStatus === "submitting"}
              autoFocus
              className="mt-1.5 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2.5 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none focus:ring-2 focus:ring-(--color-primary) disabled:opacity-60"
              aria-invalid={!!createError}
            />
            <p className="mt-1 text-xs text-(--text-muted)">
              Lowercase letters, numbers, and hyphens only.
            </p>
          </div>
          {createError ? (
            <div role="alert" className="rounded-lg border border-(--color-danger) bg-(--bg-surface) p-3 text-sm text-(--text-primary)">
              {createError}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => handleClose()}
              disabled={createStatus === "submitting"}
              className="rounded-lg border border-(--border-subtle) px-4 py-2 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-60 disabled:pointer-events-none"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createStatus === "submitting" || !normalizeSlug(slug)}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:opacity-60"
            >
              {createStatus === "submitting" ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Creating…
                </>
              ) : (
                "Create"
              )}
            </button>
          </div>
        </form>
      ) : settingsLoadStatus === "loading" ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="md" />
          <span className="ml-2 text-sm text-(--text-muted)">Loading workspace…</span>
        </div>
      ) : settingsLoadStatus === "error" ? (
        <div className="rounded-lg border border-(--color-danger) bg-(--bg-surface) p-4 text-sm text-(--text-primary)">
          Could not load workspace settings. Please try again.
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => handleClose()}
              className="rounded-lg border border-(--border-subtle) px-4 py-2 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev)"
            >
              Close
            </button>
          </div>
        </div>
      ) : tenant ? (
          <form onSubmit={handleSettingsSubmit} className="space-y-4">
            {step === "settings" && mode === "create" && tenant ? (
              <div
                role="status"
                className="rounded-lg border border-(--color-success) p-3 text-sm text-(--color-success)"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--color-success) 14%, var(--bg-surface))",
                }}
              >
                Workspace created successfully. You can update settings now.
              </div>
            ) : null}
            <div>
              <label className="block text-sm font-medium text-(--text-primary)">
                Logo
              </label>
              {tenant.logoObjectKey ? (
                <div className="mt-1.5 flex items-center gap-3">
                  <img
                    src={`/api/tenant/${tenant.id}/logo?v=${encodeURIComponent(tenant.logoObjectKey ?? "")}`}
                    alt="Workspace logo"
                    className="h-14 w-14 rounded-lg border border-(--border-subtle) object-cover object-center"
                  />
                  <span className="text-sm text-(--text-muted)">Upload a new image to replace.</span>
                </div>
              ) : null}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={logoStatus === "uploading"}
                className="mt-1.5 block w-full text-sm text-(--text-secondary) file:mr-2 file:rounded-lg file:border-0 file:bg-(--bg-surface-elev) file:px-3 file:py-2 file:text-sm file:font-medium file:text-(--text-primary)"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleLogoUpload(f);
                  e.target.value = "";
                }}
              />
              {logoError ? (
                <p className="mt-1 text-sm text-(--color-danger)">{logoError}</p>
              ) : null}
              {logoStatus === "uploading" ? (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-(--text-muted)">
                  <Spinner size="sm" /> Uploading…
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor="ws-name" className="block text-sm font-medium text-(--text-primary)">
                Name
              </label>
              <input
                id="ws-name"
                type="text"
                value={settings.name ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, name: e.target.value }))}
                maxLength={80}
                disabled={settingsStatus === "submitting"}
                className="mt-1.5 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2.5 text-sm text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary) disabled:opacity-60"
              />
            </div>
            <div ref={timezoneListRef} className="relative">
              <label htmlFor="ws-timezone" className="block text-sm font-medium text-(--text-primary)">
                Timezone
              </label>
              <input
                ref={timezoneInputRef}
                id="ws-timezone"
                type="text"
                value={timezoneOpen ? timezoneSearch : (settings.timezone ?? "")}
                onChange={(e) => {
                  setTimezoneSearch(e.target.value);
                  setTimezoneOpen(true);
                }}
                onFocus={() => {
                  setTimezoneSearch(settings.timezone ?? "");
                  setTimezoneOpen(true);
                }}
                placeholder="Search timezone…"
                disabled={settingsStatus === "submitting"}
                className="mt-1.5 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2.5 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none focus:ring-2 focus:ring-(--color-primary) disabled:opacity-60"
                autoComplete="off"
              />
              {timezoneOpen ? (
                <div
                  className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-(--border-subtle) bg-(--bg-surface) py-1 shadow-lg"
                  role="listbox"
                >
                  {filteredTimeZones.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-(--text-muted)">No timezone found</div>
                  ) : (
                    filteredTimeZones.map((tz) => (
                      <button
                        key={tz}
                        type="button"
                        role="option"
                        aria-selected={settings.timezone === tz}
                        className="w-full px-3 py-2 text-left text-sm text-(--text-primary) hover:bg-(--bg-surface-elev)"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSettings((s) => ({ ...s, timezone: tz }));
                          setTimezoneSearch("");
                          setTimezoneOpen(false);
                          timezoneInputRef.current?.focus();
                        }}
                      >
                        {tz}
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
            <div>
              <label htmlFor="ws-currency" className="block text-sm font-medium text-(--text-primary)">
                Currency
              </label>
              <select
                id="ws-currency"
                value={settings.currency ?? "USD"}
                onChange={(e) => setSettings((s) => ({ ...s, currency: e.target.value }))}
                disabled={settingsStatus === "submitting"}
                className="mt-1.5 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2.5 text-sm text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary) disabled:opacity-60"
              >
                {CURRENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ws-dateFormat" className="block text-sm font-medium text-(--text-primary)">
                Date format
              </label>
              <select
                id="ws-dateFormat"
                value={settings.dateFormat ?? "MM/DD/YYYY"}
                onChange={(e) => setSettings((s) => ({ ...s, dateFormat: e.target.value }))}
                disabled={settingsStatus === "submitting"}
                className="mt-1.5 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2.5 text-sm text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary) disabled:opacity-60"
              >
                {DATE_FORMAT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ws-description" className="block text-sm font-medium text-(--text-primary)">
                Description
              </label>
              <textarea
                id="ws-description"
                value={settings.description ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, description: e.target.value }))}
                rows={2}
                maxLength={500}
                disabled={settingsStatus === "submitting"}
                className="mt-1.5 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2.5 text-sm text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary) disabled:opacity-60"
              />
            </div>
            {settingsError ? (
              <div role="alert" className="rounded-lg border border-(--color-danger) bg-(--bg-surface) p-3 text-sm text-(--text-primary)">
                {settingsError}
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => handleClose()}
                disabled={settingsStatus === "submitting"}
                className="rounded-lg border border-(--border-subtle) px-4 py-2 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-60 disabled:pointer-events-none"
              >
                Done
              </button>
              <button
                type="submit"
                disabled={settingsStatus === "submitting"}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:opacity-60"
              >
                {settingsStatus === "submitting" ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Saving…
                  </>
                ) : (
                  "Save"
                )}
              </button>
            </div>
          </form>
        ) : null
      }
    </Dialog>
  );
}

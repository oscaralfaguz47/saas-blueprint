"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { IconCheck } from "@/components/ui/icons";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  compressImageForProfile,
  getCompressErrorMessage,
  type CompressError,
} from "@/lib/image-utils";

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
  return ["UTC", "America/New_York", "Europe/London", "Asia/Tokyo"];
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

type Props = { tenant: Tenant };

export function WorkspaceGeneralTab({ tenant: initialTenant }: Props) {
  const router = useRouter();
  const apiFetch = useApiFetch();
  const [tenant, setTenant] = useState(initialTenant);
  const [name, setName] = useState(initialTenant.name);
  const [timezone, setTimezone] = useState(initialTenant.timezone ?? "");
  const [currency, setCurrency] = useState(initialTenant.currency ?? "USD");
  const [dateFormat, setDateFormat] = useState(initialTenant.dateFormat ?? "MM/DD/YYYY");
  const [description, setDescription] = useState(initialTenant.description ?? "");
  const [saveStatus, setSaveStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [logoStatus, setLogoStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [logoError, setLogoError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTenant(initialTenant);
    setName(initialTenant.name);
    setTimezone(initialTenant.timezone ?? "");
    setCurrency(initialTenant.currency ?? "USD");
    setDateFormat(initialTenant.dateFormat ?? "MM/DD/YYYY");
    setDescription(initialTenant.description ?? "");
  }, [initialTenant]);

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    setLoading(true);
    apiFetch(`/api/tenant/${initialTenant.id}`, { signal })
      .then((r) => (signal.aborted ? null : r.json()))
      .then((j: { data?: { tenant?: Tenant } } | null) => {
        if (!j || signal.aborted) return;
        const t = j.data?.tenant;
        if (t) {
          setTenant(t);
          setName(t.name);
          setTimezone(t.timezone ?? "");
          setCurrency(t.currency ?? "USD");
          setDateFormat(t.dateFormat ?? "MM/DD/YYYY");
          setDescription(t.description ?? "");
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [initialTenant.id]);

  const timeZoneOptions = useMemo(
    () => getTimeZones().map((tz) => ({ value: tz, label: tz })),
    []
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaveStatus("submitting");
    try {
      const res = await apiFetch(`/api/tenant/${tenant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          timezone: timezone || undefined,
          currency: currency || undefined,
          dateFormat: dateFormat || undefined,
          description: description.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { data?: { tenant?: Tenant }; error?: { code?: string; message?: string } };
      if (!res.ok) {
        setSaveError(getApiErrorMessage(res, data));
        setSaveStatus("error");
        return;
      }
      if (data.data?.tenant) setTenant(data.data.tenant);
      setSaveStatus("success");
      router.refresh();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("workspace-updated"));
      }
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch {
      setSaveError("Something went wrong. Please try again.");
      setSaveStatus("error");
    }
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError(null);
    setLogoStatus("uploading");
    try {
      const { blob, contentType, extension } = await compressImageForProfile(file);
      const resUrl = await apiFetch(`/api/tenant/${tenant.id}/logo/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentType,
          contentLength: blob.size,
          extension,
        }),
      });
      const urlData = (await resUrl.json()) as {
        data?: { uploadUrl?: string; objectKey?: string };
        error?: { code?: string; message?: string };
      };
      if (!resUrl.ok || !urlData.data?.uploadUrl || !urlData.data?.objectKey) {
        setLogoError(urlData.error?.message ?? "Failed to get upload URL.");
        setLogoStatus("error");
        e.target.value = "";
        return;
      }
      const putRes = await fetch(urlData.data.uploadUrl, {
        method: "PUT",
        body: blob,
        headers: { "Content-Type": contentType },
      });
      if (!putRes.ok) {
        setLogoError("Upload failed. Please try again.");
        setLogoStatus("error");
        e.target.value = "";
        return;
      }
      const resConfirm = await apiFetch(`/api/tenant/${tenant.id}/logo/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectKey: urlData.data.objectKey }),
      });
      if (!resConfirm.ok) {
        const confirmData = (await resConfirm.json()) as { error?: { message?: string } };
        setLogoError(confirmData.error?.message ?? "Could not confirm upload.");
        setLogoStatus("error");
        e.target.value = "";
        return;
      }
      setTenant((t) => ({ ...t, logoObjectKey: urlData.data!.objectKey }));
      setLogoStatus("idle");
      router.refresh();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("workspace-updated"));
      }
      e.target.value = "";
    } catch (err) {
      if (err && typeof err === "object" && "code" in err) {
        setLogoError(getCompressErrorMessage(err as CompressError));
      } else {
        setLogoError("Something went wrong. Try a JPEG, PNG, or WebP under 10MB.");
      }
      setLogoStatus("error");
      e.target.value = "";
    }
  };

  if (loading) {
    return (
      <div className="max-w-xl space-y-4">
        <Skeleton className="h-14 w-32" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-4">
      <div>
        <label className="block text-sm font-medium text-(--text-primary)">Workspace logo</label>
        <p className="mt-1 text-sm text-(--text-secondary)">
          Upload any image (JPEG, PNG, WebP, GIF, etc.) under 10MB. It will be compressed and stored
          for a lightweight display.
        </p>
        <div className="mt-4 flex items-center gap-4">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev)">
            {tenant.logoObjectKey ? (
              <img
                src={`/api/tenant/${tenant.id}/logo?v=${encodeURIComponent(tenant.logoObjectKey)}`}
                alt="Workspace logo"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-(--text-muted)">
                {tenant.name.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoChange}
            />
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              disabled={logoStatus === "uploading"}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-60"
            >
              {logoStatus === "uploading" ? "Uploading…" : "Upload logo"}
            </button>
            {logoError && <p className="mt-2 text-sm text-(--color-danger)">{logoError}</p>}
          </div>
        </div>
      </div>
      <div>
        <label htmlFor="ws-name" className="block text-sm font-medium text-(--text-primary)">Name</label>
        <Input
          id="ws-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          disabled={saveStatus === "submitting"}
          className="mt-1.5"
        />
      </div>
      <div>
        <label htmlFor="ws-timezone" className="block text-sm font-medium text-(--text-primary)">Timezone</label>
        <SearchableSelect
          id="ws-timezone"
          options={timeZoneOptions}
          value={timezone}
          onChange={setTimezone}
          placeholder="Search timezone…"
          disabled={saveStatus === "submitting"}
          aria-label="Timezone"
        />
      </div>
      <div>
        <label htmlFor="ws-currency" className="block text-sm font-medium text-(--text-primary)">Currency</label>
        <SearchableSelect
          id="ws-currency"
          options={CURRENCY_OPTIONS}
          value={currency}
          onChange={setCurrency}
          placeholder="Search currency…"
          disabled={saveStatus === "submitting"}
          aria-label="Currency"
        />
      </div>
      <div>
        <label htmlFor="ws-dateFormat" className="block text-sm font-medium text-(--text-primary)">Date format</label>
        <SearchableSelect
          id="ws-dateFormat"
          options={DATE_FORMAT_OPTIONS}
          value={dateFormat}
          onChange={setDateFormat}
          placeholder="Search date format…"
          disabled={saveStatus === "submitting"}
          aria-label="Date format"
        />
      </div>
      <div>
        <label htmlFor="ws-description" className="block text-sm font-medium text-(--text-primary)">Description</label>
        <Textarea
          id="ws-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          maxLength={500}
          disabled={saveStatus === "submitting"}
          className="mt-1.5"
        />
      </div>
      {saveError ? (
        <div role="alert" className="rounded-lg border border-(--color-danger) bg-(--bg-surface) p-3 text-sm text-(--text-primary)">{saveError}</div>
      ) : null}
      <div className="flex justify-end gap-2">
        <button
          type="submit"
          disabled={saveStatus === "submitting"}
          className="inline-flex h-11 min-w-[140px] cursor-pointer items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saveStatus === "submitting" ? (
            <>
              <Spinner size="sm" className="mr-2" />
              Saving…
            </>
          ) : saveStatus === "success" ? (
            <>
              <IconCheck size={18} className="mr-2" />
              Changes saved
            </>
          ) : (
            "Save changes"
          )}
        </button>
      </div>
    </form>
  );
}

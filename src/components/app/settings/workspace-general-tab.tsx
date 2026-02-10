"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";

const CURRENCY_OPTIONS: { value: string; label: string }[] = [
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
  { value: "GBP", label: "GBP" },
  { value: "CAD", label: "CAD" },
  { value: "AUD", label: "AUD" },
  { value: "CHF", label: "CHF" },
  { value: "JPY", label: "JPY" },
];

const DATE_FORMAT_OPTIONS: { value: string; label: string }[] = [
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
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

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

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

function getApiMessage(data: { error?: string; message?: string }): string {
  if (data.message) return data.message;
  if (data.error === "CONFLICT") return "Name is already in use.";
  return "Something went wrong.";
}

export function WorkspaceGeneralTab({ tenant: initialTenant }: Props) {
  const router = useRouter();
  const [tenant, setTenant] = useState(initialTenant);
  const [name, setName] = useState(initialTenant.name);
  const [timezone, setTimezone] = useState(initialTenant.timezone ?? "");
  const [currency, setCurrency] = useState(initialTenant.currency ?? "USD");
  const [dateFormat, setDateFormat] = useState(initialTenant.dateFormat ?? "MM/DD/YYYY");
  const [description, setDescription] = useState(initialTenant.description ?? "");
  const [saveStatus, setSaveStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [logoStatus, setLogoStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [logoError, setLogoError] = useState<string | null>(null);

  useEffect(() => {
    setTenant(initialTenant);
    setName(initialTenant.name);
    setTimezone(initialTenant.timezone ?? "");
    setCurrency(initialTenant.currency ?? "USD");
    setDateFormat(initialTenant.dateFormat ?? "MM/DD/YYYY");
    setDescription(initialTenant.description ?? "");
  }, [initialTenant]);

  const timeZones = getTimeZones();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaveStatus("submitting");
    try {
      const res = await fetch(`/api/tenant/${tenant.id}`, {
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
      const data = (await res.json()) as { data?: { tenant?: Tenant }; error?: string; message?: string };
      if (!res.ok) {
        setSaveError(getApiMessage(data));
        setSaveStatus("error");
        return;
      }
      if (data.data?.tenant) setTenant(data.data.tenant);
      setSaveStatus("idle");
      router.refresh();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("workspace-updated"));
      }
    } catch {
      setSaveError("Something went wrong. Please try again.");
      setSaveStatus("error");
    }
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
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
      const resUrl = await fetch(`/api/tenant/${tenant.id}/logo/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentType: file.type,
          contentLength: file.size,
          extension: file.name.split(".").pop()?.toLowerCase() === "jpg" ? "jpeg" : file.name.split(".").pop()?.toLowerCase() ?? "png",
        }),
      });
      const urlData = (await resUrl.json()) as { data?: { uploadUrl?: string; objectKey?: string }; error?: string; message?: string };
      if (!resUrl.ok || !urlData.data?.uploadUrl || !urlData.data?.objectKey) {
        setLogoError((urlData as { message?: string }).message ?? "Failed to get upload URL.");
        setLogoStatus("error");
        return;
      }
      const putRes = await fetch(urlData.data.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!putRes.ok) {
        setLogoError("Upload failed.");
        setLogoStatus("error");
        return;
      }
      const resConfirm = await fetch(`/api/tenant/${tenant.id}/logo/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectKey: urlData.data.objectKey }),
      });
      if (!resConfirm.ok) {
        setLogoError("Could not confirm upload.");
        setLogoStatus("error");
        return;
      }
      setTenant((t) => ({ ...t, logoObjectKey: urlData.data!.objectKey }));
      setLogoStatus("idle");
      router.refresh();
    } catch {
      setLogoError("Something went wrong.");
      setLogoStatus("error");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-4">
      <div>
        <label className="block text-sm font-medium text-(--text-primary)">Logo</label>
        {tenant.logoObjectKey ? (
          <div className="mt-1.5 flex items-center gap-3">
            <img
              src={`/api/tenant/${tenant.id}/logo?v=${encodeURIComponent(tenant.logoObjectKey ?? "")}`}
              alt="Workspace logo"
              className="h-14 w-14 rounded-lg border border-(--border-subtle) object-cover"
            />
            <span className="text-sm text-(--text-muted)">Upload a new image to replace.</span>
          </div>
        ) : null}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={logoStatus === "uploading"}
          className="mt-1.5 block w-full text-sm text-(--text-secondary) file:mr-2 file:rounded-lg file:border-0 file:bg-(--bg-surface-elev) file:px-3 file:py-2 file:text-sm file:font-medium file:text-(--text-primary)"
          onChange={handleLogoChange}
        />
        {logoError ? <p className="mt-1 text-sm text-(--color-danger)">{logoError}</p> : null}
        {logoStatus === "uploading" ? <p className="mt-1 flex items-center gap-1.5 text-sm text-(--text-muted)"><Spinner size="sm" /> Uploading…</p> : null}
      </div>
      <div>
        <label htmlFor="ws-name" className="block text-sm font-medium text-(--text-primary)">Name</label>
        <input
          id="ws-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          disabled={saveStatus === "submitting"}
          className="mt-1.5 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2.5 text-sm text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary) disabled:opacity-60"
        />
      </div>
      <div>
        <label htmlFor="ws-timezone" className="block text-sm font-medium text-(--text-primary)">Timezone</label>
        <select
          id="ws-timezone"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          disabled={saveStatus === "submitting"}
          className="mt-1.5 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2.5 text-sm text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary) disabled:opacity-60"
        >
          {timeZones.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="ws-currency" className="block text-sm font-medium text-(--text-primary)">Currency</label>
        <select
          id="ws-currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          disabled={saveStatus === "submitting"}
          className="mt-1.5 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2.5 text-sm text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary) disabled:opacity-60"
        >
          {CURRENCY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="ws-dateFormat" className="block text-sm font-medium text-(--text-primary)">Date format</label>
        <select
          id="ws-dateFormat"
          value={dateFormat}
          onChange={(e) => setDateFormat(e.target.value)}
          disabled={saveStatus === "submitting"}
          className="mt-1.5 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2.5 text-sm text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary) disabled:opacity-60"
        >
          {DATE_FORMAT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="ws-description" className="block text-sm font-medium text-(--text-primary)">Description</label>
        <textarea
          id="ws-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          maxLength={500}
          disabled={saveStatus === "submitting"}
          className="mt-1.5 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2.5 text-sm text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary) disabled:opacity-60"
        />
      </div>
      {saveError ? (
        <div role="alert" className="rounded-lg border border-(--color-danger) bg-(--bg-surface) p-3 text-sm text-(--text-primary)">{saveError}</div>
      ) : null}
      <div className="flex justify-end gap-2">
        <button
          type="submit"
          disabled={saveStatus === "submitting"}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:opacity-60"
        >
          {saveStatus === "submitting" ? <><Spinner size="sm" className="mr-2" /> Saving…</> : "Save changes"}
        </button>
      </div>
    </form>
  );
}

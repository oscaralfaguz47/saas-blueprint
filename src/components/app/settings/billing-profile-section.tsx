"use client";

import { useState, useCallback, useEffect } from "react";
import { CardRoot, CardHeader, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";
import { getCheckoutCountryOptions } from "@/lib/countries";

export type BillingProfileData = {
  countryCode: string;
  postalCode: string | null;
  region: string | null;
  city: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  companyName: string | null;
  vatId: string | null;
  lastSyncedAt: string | null;
};

function countryDisplayName(code: string): string {
  if (!code || code.length !== 2) return code ?? "";
  const names: Record<string, string> = {
    US: "United States",
    GB: "United Kingdom",
    CA: "Canada",
    AU: "Australia",
    DE: "Germany",
    FR: "France",
  };
  return names[code.toUpperCase()] ?? code.toUpperCase();
}

export function BillingProfileSection() {
  const apiFetch = useApiFetch();
  const toast = useToast();
  const [profile, setProfile] = useState<BillingProfileData | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<{
    countryCode: string;
    companyName: string;
    vatId: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    region: string;
    postalCode: string;
  }>({
    countryCode: "US",
    companyName: "",
    vatId: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    region: "",
    postalCode: "",
  });

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/billing/billing-details", {
        showToastOnError: false,
      });
      if (!res.ok) {
        setProfile(null);
        return;
      }
      const json = await res.json();
      const data = json.data as { profile?: BillingProfileData | null; message?: string };
      setProfile(data.profile ?? null);
      if (data.profile) {
        const cc = (data.profile.countryCode ?? "US").toUpperCase().slice(0, 2);
        setForm({
          countryCode: cc,
          companyName: data.profile.companyName ?? "",
          vatId: data.profile.vatId ?? "",
          addressLine1: data.profile.addressLine1 ?? "",
          addressLine2: data.profile.addressLine2 ?? "",
          city: data.profile.city ?? "",
          region: data.profile.region ?? "",
          postalCode: data.profile.postalCode ?? "",
        });
      }
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const openModal = useCallback(() => {
    setSubmitError(null);
    setFieldErrors({});
    if (profile) {
      const cc = (profile.countryCode ?? "US").toUpperCase().slice(0, 2);
      setForm({
        countryCode: cc,
        companyName: profile.companyName ?? "",
        vatId: profile.vatId ?? "",
        addressLine1: profile.addressLine1 ?? "",
        addressLine2: profile.addressLine2 ?? "",
        city: profile.city ?? "",
        region: profile.region ?? "",
        postalCode: profile.postalCode ?? "",
      });
    }
    setModalOpen(true);
  }, [profile]);

  const handleSave = useCallback(async () => {
    setSubmitError(null);
    setFieldErrors({});
    setSaving(true);
    try {
      const res = await apiFetch("/api/billing/billing-details", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countryCode: form.countryCode && form.countryCode.length === 2 ? form.countryCode : null,
          companyName: form.companyName || null,
          vatId: form.vatId || null,
          addressLine1: form.addressLine1 || null,
          addressLine2: form.addressLine2 || null,
          city: form.city || null,
          region: form.region || null,
          postalCode: form.postalCode || null,
        }),
        showToastOnError: false,
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const err = json as {
          message?: string;
          details?: { fieldErrors?: Array<{ field: string; message: string }> };
        };
        setSubmitError(err.message ?? "Failed to update billing details.");
        const list = err.details?.fieldErrors;
        if (Array.isArray(list) && list.length > 0) {
          const next: Record<string, string> = {};
          for (const { field, message } of list) {
            next[field] = message;
          }
          setFieldErrors(next);
        } else if (err.message) {
          toast.addToast("error", err.message);
        }
        return;
      }
      toast.addToast("success", "Billing details updated.");
      setModalOpen(false);
      await fetchProfile();
    } finally {
      setSaving(false);
    }
  }, [form, apiFetch, toast, fetchProfile]);

  const addressLines = [profile?.addressLine1, profile?.addressLine2].filter(Boolean).join(", ");
  const cityRegion = [profile?.city, profile?.region].filter(Boolean).join(", ");
  const addressBlock = [
    addressLines,
    cityRegion,
    profile?.countryCode ? countryDisplayName(profile.countryCode) : null,
  ]
    .filter(Boolean)
    .join("\n");

  if (loading) {
    return (
      <CardRoot className="shadow-sm">
        <CardHeader className="pb-3">
          <p className="text-xs font-semibold tracking-wider text-(--text-muted) uppercase">
            Billing profile
          </p>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </CardRoot>
    );
  }

  return (
    <>
      <CardRoot className="shadow-sm">
        <CardHeader className="pb-3">
          <p className="text-xs font-semibold tracking-wider text-(--text-muted) uppercase">
            Billing profile
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {profile === null ? (
            <p className="text-sm text-(--text-secondary)">
              No billing profile yet. Complete a purchase to set billing details, or they will
              appear here after your first invoice.
            </p>
          ) : profile ? (
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs font-medium text-(--text-muted)">Company</p>
                <p className="mt-0.5 text-(--text-primary)">{profile.companyName ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-(--text-muted)">Tax ID</p>
                <p className="mt-0.5 text-(--text-primary)">{profile.vatId ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-(--text-muted)">Address</p>
                <p className="mt-0.5 whitespace-pre-line text-(--text-primary)">
                  {addressBlock || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-(--text-muted)">Postal code</p>
                <p className="mt-0.5 text-(--text-primary)">{profile.postalCode ?? "—"}</p>
              </div>
            </div>
          ) : null}
          <button
            type="button"
            onClick={openModal}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev)"
          >
            Edit billing details
          </button>
        </CardContent>
      </CardRoot>

      <Dialog
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title="Edit billing details"
        description="Update details for future invoices. You can change your country and address here."
        closeDisabled={saving}
        allowOverlayClose={!saving}
        contentClassName="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-sm text-(--text-muted)">
            Changes apply to future invoices only. For already-issued invoices, submit a support
            request.
          </p>
          {submitError && (
            <p className="text-sm text-(--color-danger)" role="alert">
              {submitError}
            </p>
          )}
          <div className="grid gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-(--text-muted)">Country</label>
              <select
                value={form.countryCode}
                onChange={(e) => setForm((f) => ({ ...f, countryCode: e.target.value }))}
                className="flex h-9 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-1 text-sm text-(--text-primary) focus:ring-2 focus:ring-(--color-primary) focus:outline-none aria-invalid:border-red-500"
                aria-invalid={!!fieldErrors.countryCode}
                aria-describedby={fieldErrors.countryCode ? "countryCode-error" : undefined}
              >
                {getCheckoutCountryOptions().map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              {fieldErrors.countryCode && (
                <p id="countryCode-error" className="mt-1 text-xs text-(--color-danger)">
                  {fieldErrors.countryCode}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-(--text-muted)">
                Postal code
              </label>
              <Input
                value={form.postalCode}
                onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))}
                placeholder="Optional"
                maxLength={32}
                aria-invalid={!!fieldErrors.postalCode}
                aria-describedby={fieldErrors.postalCode ? "postalCode-error" : undefined}
              />
              {fieldErrors.postalCode && (
                <p id="postalCode-error" className="mt-1 text-xs text-(--color-danger)">
                  {fieldErrors.postalCode}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-(--text-muted)">
                Company name
              </label>
              <Input
                value={form.companyName}
                onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                placeholder="Optional"
                maxLength={160}
                aria-invalid={!!fieldErrors.companyName}
                aria-describedby={fieldErrors.companyName ? "companyName-error" : undefined}
              />
              {fieldErrors.companyName && (
                <p id="companyName-error" className="mt-1 text-xs text-(--color-danger)">
                  {fieldErrors.companyName}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-(--text-muted)">
                VAT / Tax ID
              </label>
              <p className="mb-1.5 text-xs text-(--text-muted)">
                Ensure the tax identifier matches the correct format for the customer&apos;s country
                to ensure tax is calculated accurately.{" "}
                <a
                  href="https://www.paddle.com/help/start/set-up-paddle/what-format-should-i-use-for-my-vat-id"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-(--color-primary) underline hover:no-underline"
                >
                  Check valid formats
                </a>
              </p>
              <Input
                value={form.vatId}
                onChange={(e) => setForm((f) => ({ ...f, vatId: e.target.value }))}
                placeholder="Optional"
                maxLength={64}
                aria-invalid={!!fieldErrors.vatId}
                aria-describedby={fieldErrors.vatId ? "vatId-error" : undefined}
              />
              {fieldErrors.vatId && (
                <p id="vatId-error" className="mt-1 text-xs text-(--color-danger)">
                  {fieldErrors.vatId}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-(--text-muted)">
                Address line 1
              </label>
              <Input
                value={form.addressLine1}
                onChange={(e) => setForm((f) => ({ ...f, addressLine1: e.target.value }))}
                placeholder="Optional"
                maxLength={120}
                aria-invalid={!!fieldErrors.addressLine1}
                aria-describedby={fieldErrors.addressLine1 ? "addressLine1-error" : undefined}
              />
              {fieldErrors.addressLine1 && (
                <p id="addressLine1-error" className="mt-1 text-xs text-(--color-danger)">
                  {fieldErrors.addressLine1}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-(--text-muted)">
                Address line 2
              </label>
              <Input
                value={form.addressLine2}
                onChange={(e) => setForm((f) => ({ ...f, addressLine2: e.target.value }))}
                placeholder="Optional"
                maxLength={120}
                aria-invalid={!!fieldErrors.addressLine2}
                aria-describedby={fieldErrors.addressLine2 ? "addressLine2-error" : undefined}
              />
              {fieldErrors.addressLine2 && (
                <p id="addressLine2-error" className="mt-1 text-xs text-(--color-danger)">
                  {fieldErrors.addressLine2}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-(--text-muted)">City</label>
                <Input
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  placeholder="Optional"
                  maxLength={80}
                  aria-invalid={!!fieldErrors.city}
                  aria-describedby={fieldErrors.city ? "city-error" : undefined}
                />
                {fieldErrors.city && (
                  <p id="city-error" className="mt-1 text-xs text-(--color-danger)">
                    {fieldErrors.city}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-(--text-muted)">
                  Region / State
                </label>
                <Input
                  value={form.region}
                  onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
                  placeholder="Optional"
                  maxLength={80}
                  aria-invalid={!!fieldErrors.region}
                  aria-describedby={fieldErrors.region ? "region-error" : undefined}
                />
                {fieldErrors.region && (
                  <p id="region-error" className="mt-1 text-xs text-(--color-danger)">
                    {fieldErrors.region}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              disabled={saving}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:opacity-50"
            >
              {saving ? <Spinner size="sm" /> : "Save"}
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

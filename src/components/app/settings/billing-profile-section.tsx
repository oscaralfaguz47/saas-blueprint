"use client";

import { useState, useCallback, useEffect } from "react";
import { CardRoot, CardHeader, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";

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
  const [form, setForm] = useState<{
    companyName: string;
    vatId: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    region: string;
    postalCode: string;
  }>({
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
        setForm({
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
    if (profile) {
      setForm({
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
    setSaving(true);
    try {
      const res = await apiFetch("/api/billing/billing-details", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: form.companyName || null,
          vatId: form.vatId || null,
          addressLine1: form.addressLine1 || null,
          addressLine2: form.addressLine2 || null,
          city: form.city || null,
          region: form.region || null,
          postalCode: form.postalCode || null,
        }),
        showToastOnError: true,
      });
      if (!res.ok) return;
      toast.addToast("success", "Billing details updated.");
      setModalOpen(false);
      await fetchProfile();
    } finally {
      setSaving(false);
    }
  }, [form, apiFetch, toast, fetchProfile]);

  if (loading) {
    return (
      <CardRoot>
        <CardHeader>
          <p className="text-xs font-medium uppercase tracking-wide text-(--text-muted)">
            Billing profile
          </p>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </CardRoot>
    );
  }

  return (
    <>
      <CardRoot>
        <CardHeader>
          <p className="text-xs font-medium uppercase tracking-wide text-(--text-muted)">
            Billing profile
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-(--text-muted)">
            Changes apply to future invoices only.
          </p>
          {profile === null ? (
            <p className="text-sm text-(--text-secondary)">
              No billing profile yet. Complete a purchase to set billing details, or they will appear here after your first invoice.
            </p>
          ) : profile ? (
            <div className="grid gap-2 text-sm">
              <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                <div>
                  <span className="text-(--text-muted)">Country: </span>
                  <span className="text-(--text-primary)">{countryDisplayName(profile.countryCode)}</span>
                </div>
                <div>
                  <span className="text-(--text-muted)">Postal code: </span>
                  <span className="text-(--text-primary)">{profile.postalCode ?? "—"}</span>
                </div>
              </div>
              {profile.companyName && (
                <div>
                  <span className="text-(--text-muted)">Company: </span>
                  <span className="text-(--text-primary)">{profile.companyName}</span>
                </div>
              )}
              {profile.vatId && (
                <div>
                  <span className="text-(--text-muted)">VAT / Tax ID: </span>
                  <span className="text-(--text-primary)">{profile.vatId}</span>
                </div>
              )}
              {(profile.addressLine1 || profile.city || profile.region) && (
                <div>
                  <span className="text-(--text-muted)">Address: </span>
                  <span className="text-(--text-primary)">
                    {[profile.addressLine1, profile.addressLine2, [profile.city, profile.region].filter(Boolean).join(", ")].filter(Boolean).join(", ") || "—"}
                  </span>
                </div>
              )}
              {!profile.companyName && !profile.vatId && !profile.addressLine1 && !profile.city && !profile.region && (
                <p className="text-(--text-secondary)">No editable details on file yet.</p>
              )}
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
        description="Update details for future invoices. Country is set at checkout and cannot be changed here."
        closeDisabled={saving}
        allowOverlayClose={!saving}
        contentClassName="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-sm text-(--text-muted)">
            Changes apply to future invoices only. For already-issued invoices, submit a support request.
          </p>
          <div className="grid gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-(--text-muted)">Country</label>
              <Input
                value={profile?.countryCode ? countryDisplayName(profile.countryCode) : ""}
                disabled
                className="bg-(--muted)"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-(--text-muted)">Postal code</label>
              <Input
                value={form.postalCode}
                onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))}
                placeholder="Optional"
                maxLength={32}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-(--text-muted)">Company name</label>
              <Input
                value={form.companyName}
                onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                placeholder="Optional"
                maxLength={160}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-(--text-muted)">VAT / Tax ID</label>
              <Input
                value={form.vatId}
                onChange={(e) => setForm((f) => ({ ...f, vatId: e.target.value }))}
                placeholder="Optional"
                maxLength={64}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-(--text-muted)">Address line 1</label>
              <Input
                value={form.addressLine1}
                onChange={(e) => setForm((f) => ({ ...f, addressLine1: e.target.value }))}
                placeholder="Optional"
                maxLength={120}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-(--text-muted)">Address line 2</label>
              <Input
                value={form.addressLine2}
                onChange={(e) => setForm((f) => ({ ...f, addressLine2: e.target.value }))}
                placeholder="Optional"
                maxLength={120}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-(--text-muted)">City</label>
                <Input
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  placeholder="Optional"
                  maxLength={80}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-(--text-muted)">Region / State</label>
                <Input
                  value={form.region}
                  onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
                  placeholder="Optional"
                  maxLength={80}
                />
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

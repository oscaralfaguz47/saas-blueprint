"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Spinner } from "@/components/ui/spinner";
import { IconCheck } from "@/components/ui/icons";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  compressImageForProfile,
  getCompressErrorMessage,
  type CompressError,
} from "@/lib/image-utils";
import type { AccountProfile } from "./account-settings-tabs";

function getTimeZones(): string[] {
  if (typeof Intl !== "undefined" && "supportedValuesOf" in Intl) {
    try {
      const supportedValuesOf = (Intl as { supportedValuesOf: (key: string) => string[] })
        .supportedValuesOf;
      return supportedValuesOf("timeZone").sort();
    } catch {
      return ["UTC"];
    }
  }
  return ["UTC", "America/New_York", "Europe/London", "Asia/Tokyo"];
}

type Props = { profile: AccountProfile; loginMethod: string };

export function ProfileTab({ profile: initialProfile, loginMethod }: Props) {
  const router = useRouter();
  const apiFetch = useApiFetch();
  const [name, setName] = useState(initialProfile.name ?? "");
  const [phone, setPhone] = useState(initialProfile.phone ?? "");
  const [timezone, setTimezone] = useState(initialProfile.timezone ?? "");
  const [saveStatus, setSaveStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [photoStatus, setPhotoStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const timeZoneOptions = useMemo(
    () => getTimeZones().map((tz) => ({ value: tz, label: tz })),
    []
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaveStatus("submitting");
    try {
      const res = await apiFetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          phone: phone.trim() || null,
          timezone: timezone || null,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        details?: { code?: string };
      };
      if (!res.ok) {
        setSaveError(getApiErrorMessage(res, data));
        setSaveStatus("error");
        if (data.details?.code === "NEED_STEP_UP") {
          setSaveError("Sign in again to change your phone number.");
        }
        return;
      }
      setSaveStatus("success");
      router.refresh();
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch {
      setSaveStatus("error");
      setSaveError("Something went wrong.");
    }
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(null);
    setPhotoStatus("uploading");
    try {
      const { blob, contentType, extension } = await compressImageForProfile(file);
      const uploadRes = await apiFetch("/api/account/photo/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentType,
          contentLength: blob.size,
          extension,
        }),
      });
      const uploadData = (await uploadRes.json()) as {
        data?: { uploadUrl?: string; objectKey?: string };
        error?: string;
        message?: string;
      };
      if (!uploadRes.ok || !uploadData.data?.uploadUrl || !uploadData.data?.objectKey) {
        setPhotoError(uploadData.message ?? "Failed to get upload URL.");
        setPhotoStatus("error");
        return;
      }
      const putRes = await fetch(uploadData.data.uploadUrl, {
        method: "PUT",
        body: blob,
        headers: { "Content-Type": contentType },
      });
      if (!putRes.ok) {
        setPhotoError("Upload failed. Please try again.");
        setPhotoStatus("error");
        return;
      }
      const confirmRes = await apiFetch("/api/account/photo/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectKey: uploadData.data.objectKey }),
      });
      if (!confirmRes.ok) {
        const confirmData = (await confirmRes.json()) as { message?: string };
        setPhotoError(confirmData.message ?? "Failed to save photo.");
        setPhotoStatus("error");
        return;
      }
      setPhotoStatus("idle");
      router.refresh();
    } catch (err) {
      if (err && typeof err === "object" && "code" in err) {
        setPhotoError(getCompressErrorMessage(err as CompressError));
      } else {
        setPhotoError("Something went wrong. Try a JPEG, PNG, or WebP under 10MB.");
      }
      setPhotoStatus("error");
    }
    e.target.value = "";
  };

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-6">
        <h2 className="text-base font-semibold text-(--text-primary)">Profile photo</h2>
        <p className="mt-1 text-sm text-(--text-secondary)">
          Upload any image (JPEG, PNG, WebP, GIF, etc.) under 10MB. It will be compressed and stored
          for a lightweight display.
        </p>
        <div className="mt-4 flex items-center gap-4">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border border-(--border-subtle) bg-(--bg-surface-elev)">
            {initialProfile.avatarUrl ? (
              <img
                src={initialProfile.avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-(--text-muted)">
                {(initialProfile.name ?? initialProfile.email ?? "U").slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={photoStatus === "uploading"}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-60"
            >
              {photoStatus === "uploading" ? "Uploading…" : "Upload photo"}
            </button>
            {photoError && <p className="mt-2 text-sm text-(--color-danger)">{photoError}</p>}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-6">
        <h2 className="text-base font-semibold text-(--text-primary)">Profile</h2>
        <p className="mt-1 text-sm text-(--text-secondary)">
          Update your name, phone, and timezone.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="profile-name" className="block text-sm font-medium text-(--text-primary)">
              Name
            </label>
            <Input
              id="profile-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
              maxLength={120}
            />
          </div>
          <div>
            <label htmlFor="profile-email" className="block text-sm font-medium text-(--text-primary)">
              Email
            </label>
            <Input
              id="profile-email"
              type="email"
              value={initialProfile.email ?? ""}
              readOnly
              disabled
              className="mt-1 bg-(--bg-surface-elev)"
            />
            <p className="mt-1 text-xs text-(--text-muted)">Email cannot be changed here.</p>
          </div>
          <div>
            <label htmlFor="profile-phone" className="block text-sm font-medium text-(--text-primary)">
              Phone
            </label>
            <Input
              id="profile-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1"
              maxLength={30}
            />
          </div>
          <div>
            <label htmlFor="profile-timezone" className="block text-sm font-medium text-(--text-primary)">
              Timezone
            </label>
            <SearchableSelect
              id="profile-timezone"
              options={timeZoneOptions}
              value={timezone}
              onChange={setTimezone}
              placeholder="Search timezone…"
              className="mt-1"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={saveStatus === "submitting"}
              className="inline-flex h-11 min-w-[140px] items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:opacity-60 disabled:cursor-not-allowed"
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
            {saveStatus === "error" && saveError && (
              <span className="text-sm text-(--color-danger)">{saveError}</span>
            )}
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-6">
        <h2 className="text-base font-semibold text-(--text-primary)">Login method</h2>
        <p className="mt-1 text-sm text-(--text-secondary)">{loginMethod}</p>
      </section>
    </div>
  );
}

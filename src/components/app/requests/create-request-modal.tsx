"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";
import { CURRENCY_OPTIONS } from "@/lib/currencies";
import { IconUpload, IconPlus, IconChevronRight } from "@/components/ui/icons";
import { LinkRecordModal } from "./link-record-modal";

const RECORD_TYPES = [
  {
    value: "SCOPE_CHANGE" as const,
    label: "Scope Change",
    desc: "Changes to project scope or requirements",
    showAmount: false,
  },
  {
    value: "DECISION" as const,
    label: "Decision",
    desc: "Key decisions that need approval",
    showAmount: false,
  },
  {
    value: "BUDGET" as const,
    label: "Budget",
    desc: "Financial requests requiring sign-off",
    showAmount: true,
  },
];

type RecordTypeValue = "SCOPE_CHANGE" | "DECISION" | "BUDGET";
type FormState = {
  title: string;
  type: RecordTypeValue;
  description: string;
  amount: string;
  currency: string;
};
type FieldError = Partial<Record<keyof FormState, string>>;
type WorkspaceUser = { user: { id: string; name: string | null; email: string | null } };

function resolveMimeType(file: File): string {
  if (file.type) return file.type;
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lower.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  return "image/png";
}

export function CreateRequestModal({
  open,
  onClose,
  sourceRecordId: _sourceRecordId,
}: {
  open: boolean;
  onClose: () => void;
  sourceRecordId?: string;
}) {
  void _sourceRecordId;
  const router = useRouter();
  const apiFetch = useApiFetch();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FormState>({
    title: "",
    type: "SCOPE_CHANGE",
    description: "",
    amount: "",
    currency: "",
  });
  const [errors, setErrors] = useState<FieldError>({});
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const [createdRecordId, setCreatedRecordId] = useState<string | null>(null);
  const [createdTitle, setCreatedTitle] = useState("");

  const [uploadMode, setUploadMode] = useState<"idle" | "link" | "uploading">("idle");
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkSubmitting, setLinkSubmitting] = useState(false);
  const [evidenceCount, setEvidenceCount] = useState(0);

  const [linkRecordOpen, setLinkRecordOpen] = useState(false);

  const [approverOpen, setApproverOpen] = useState(false);
  const [approverUsers, setApproverUsers] = useState<WorkspaceUser[]>([]);
  const [approverLoading, setApproverLoading] = useState(false);
  const [approverSelectedId, setApproverSelectedId] = useState("");
  const [approverSubmitting, setApproverSubmitting] = useState(false);
  const [approverCount, setApproverCount] = useState(0);
  const [approverError, setApproverError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    apiFetch("/api/tenant", { showToastOnError: false })
      .then((r) => r.json())
      .then(
        (json: {
          data?: { tenants?: { currency?: string | null; isDefaultTenant: boolean }[] };
        }) => {
          const def = json.data?.tenants?.find((t) => t.isDefaultTenant);
          if (def?.currency) {
            setForm((prev) =>
              prev.currency ? prev : { ...prev, currency: def.currency ?? "" }
            );
          }
        }
      )
      .catch(() => {});
  }, [open, apiFetch]);

  useEffect(() => {
    if (!open) {
      setForm({ title: "", type: "SCOPE_CHANGE", description: "", amount: "", currency: "" });
      setErrors({});
      setGlobalError(null);
      setCreatedRecordId(null);
      setCreatedTitle("");
      setUploadMode("idle");
      setUploadError(null);
      setEvidenceCount(0);
      setApproverCount(0);
      setApproverOpen(false);
      setApproverSelectedId("");
      setLinkRecordOpen(false);
      setLinkLabel("");
      setLinkUrl("");
    }
  }, [open]);

  useEffect(() => {
    if (!approverOpen || approverUsers.length > 0) return;
    setApproverLoading(true);
    apiFetch("/api/tenant/users?context=assignment", { showToastOnError: false })
      .then((r) => r.json())
      .then((json: { data?: { users?: WorkspaceUser[] } }) => {
        setApproverUsers(json.data?.users ?? []);
      })
      .catch(() => {})
      .finally(() => setApproverLoading(false));
  }, [approverOpen, approverUsers.length, apiFetch]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
    setGlobalError(null);
  }

  function validate(): FieldError {
    const e: FieldError = {};
    if (!form.title.trim()) e.title = "Title is required.";
    if (form.title.trim().length > 160) e.title = "Title must be 160 characters or less.";
    const t = RECORD_TYPES.find((x) => x.value === form.type);
    if (t?.showAmount && form.amount && isNaN(Number(form.amount)))
      e.amount = "Amount must be a number.";
    if (t?.showAmount && form.amount && Number(form.amount) < 0)
      e.amount = "Amount must be zero or positive.";
    return e;
  }

  async function submit(status: "OPEN" | "DRAFT") {
    const fieldErrors = validate();
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }
    if (status === "DRAFT") setSavingDraft(true);
    else setSubmitting(true);
    setGlobalError(null);

    const t = RECORD_TYPES.find((x) => x.value === form.type);
    const body: Record<string, unknown> = {
      title: form.title.trim(),
      type: form.type,
      status,
    };
    if (form.description.trim()) body.description = form.description.trim();
    if (t?.showAmount && form.amount) body.amount = Number(form.amount);
    if (t?.showAmount && form.currency) body.currency = form.currency;

    try {
      const res = await apiFetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        showToastOnError: false,
      });
      const payload = (await res.json().catch(() => ({}))) as {
        data?: { id: string; title: string };
        error?: { code?: string; message?: string; details?: { code?: string } };
      };
      if (res.status === 403 && payload.error?.details?.code === "UPGRADE_REQUIRED") {
        setGlobalError("You've reached your plan's request limit. Upgrade to create more.");
        return;
      }
      if (!res.ok) {
        setGlobalError(payload.error?.message ?? "Something went wrong.");
        return;
      }
      const id = payload.data?.id;
      if (!id) {
        setGlobalError("Something went wrong.");
        return;
      }

      setCreatedRecordId(id);
      setCreatedTitle(form.title.trim());
      toast.addToast("success", status === "DRAFT" ? "Draft saved." : "Request created.");
    } catch {
      setGlobalError("Network error. Please try again.");
    } finally {
      setSavingDraft(false);
      setSubmitting(false);
    }
  }

  function handleDone() {
    if (!createdRecordId) {
      onClose();
      return;
    }
    onClose();
    router.push(`/app/requests/${createdRecordId}`);
  }

  async function uploadFile(file: File) {
    if (!createdRecordId) return;
    setUploadMode("uploading");
    setUploadProgress("Preparing…");
    setUploadError(null);
    const mimeType = resolveMimeType(file);
    const sizeBytes = Math.max(file.size, 0);
    try {
      const urlRes = await apiFetch(`/api/records/${createdRecordId}/evidence/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          mimeType,
          sizeBytes,
        }),
        showToastOnError: false,
      });
      const urlPayload = (await urlRes.json().catch(() => ({}))) as {
        data?: { uploadUrl: string; objectKey: string };
        error?: { message?: string };
      };
      if (!urlRes.ok) {
        setUploadError(urlPayload.error?.message ?? "Failed to prepare upload.");
        setUploadMode("idle");
        return;
      }
      const uploadUrl = urlPayload.data?.uploadUrl;
      const objectKey = urlPayload.data?.objectKey;
      if (!uploadUrl || !objectKey) {
        setUploadError("Failed to prepare upload.");
        setUploadMode("idle");
        return;
      }

      setUploadProgress("Uploading…");
      const upRes = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": mimeType },
      });
      if (!upRes.ok) {
        setUploadError("Upload failed.");
        setUploadMode("idle");
        return;
      }
      setUploadProgress("Saving…");
      const confirmRes = await apiFetch(`/api/records/${createdRecordId}/evidence/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectKey,
          fileName: file.name,
          mimeType,
          sizeBytes,
          label: file.name,
        }),
        showToastOnError: false,
      });
      const confirmPayload = (await confirmRes.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      if (!confirmRes.ok) {
        setUploadError(confirmPayload.error?.message ?? "Failed to save.");
        setUploadMode("idle");
        return;
      }
      toast.addToast("success", "File added.");
      setEvidenceCount((c) => c + 1);
      setUploadMode("idle");
    } catch {
      setUploadError("Upload failed.");
      setUploadMode("idle");
    } finally {
      setUploadProgress(null);
    }
  }

  async function handleAddLink(e: React.FormEvent) {
    e.preventDefault();
    if (!createdRecordId || !linkLabel.trim() || !linkUrl.trim()) return;
    setLinkSubmitting(true);
    setUploadError(null);
    try {
      const res = await apiFetch(`/api/records/${createdRecordId}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evidenceType: "LINK",
          label: linkLabel.trim(),
          url: linkUrl.trim(),
        }),
        showToastOnError: false,
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setUploadError(j.error?.message ?? "Failed to add link.");
        return;
      }
      setLinkLabel("");
      setLinkUrl("");
      setUploadMode("idle");
      setEvidenceCount((c) => c + 1);
      toast.addToast("success", "Link added.");
    } catch {
      setUploadError("Network error.");
    } finally {
      setLinkSubmitting(false);
    }
  }

  async function handleAssignApprover() {
    if (!createdRecordId || !approverSelectedId) return;
    setApproverSubmitting(true);
    setApproverError(null);
    try {
      const res = await apiFetch(`/api/records/${createdRecordId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: approverSelectedId, participantRole: "APPROVER" }),
        showToastOnError: false,
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { alreadyAssigned?: boolean };
        error?: { message?: string };
      };
      if (!res.ok) {
        setApproverError(json.error?.message ?? "Failed to assign.");
        return;
      }
      if (!json.data?.alreadyAssigned) setApproverCount((c) => c + 1);
      setApproverSelectedId("");
      toast.addToast("success", "Approver assigned.");
    } catch {
      setApproverError("Network error.");
    } finally {
      setApproverSubmitting(false);
    }
  }

  useEffect(() => {
    if (!createdRecordId) return;
    function handlePaste(e: ClipboardEvent) {
      if (uploadMode === "uploading") return;
      const imageItem = Array.from(e.clipboardData?.items ?? []).find((item) =>
        item.type.startsWith("image/")
      );
      if (!imageItem) return;
      const file = imageItem.getAsFile();
      if (!file) return;
      void uploadFile(
        new File([file], `screenshot-${Date.now()}.png`, { type: "image/png" })
      );
    }
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [createdRecordId, uploadMode]); // eslint-disable-line react-hooks/exhaustive-deps -- uploadFile closes over latest state

  const selectedType = RECORD_TYPES.find((t) => t.value === form.type);
  const isLoading = submitting || savingDraft;
  const step = createdRecordId ? 2 : 1;

  if (step === 2 && createdRecordId) {
    return (
      <>
        <Dialog
          open={open}
          onClose={onClose}
          title="Request created"
          description={`"${createdTitle}" was created. Optionally add evidence and approvers before finishing.`}
          contentClassName="max-w-2xl"
        >
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-(--text-primary)">
                  Evidence
                  {evidenceCount > 0 && (
                    <span className="ml-1.5 font-normal text-(--text-muted)">
                      ({evidenceCount})
                    </span>
                  )}
                </h3>
              </div>

              {uploadError && <p className="text-xs text-(--color-danger)">{uploadError}</p>}

              {uploadMode === "uploading" && (
                <div className="flex items-center gap-2 rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-3 py-2 text-sm text-(--text-muted)">
                  <Spinner size="sm" />
                  {uploadProgress ?? "Uploading…"}
                </div>
              )}

              {uploadMode === "link" && (
                <form
                  onSubmit={handleAddLink}
                  className="space-y-3 rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) p-3"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-(--text-primary)">
                        Label *
                      </label>
                      <Input
                        value={linkLabel}
                        onChange={(e) => setLinkLabel(e.target.value)}
                        placeholder="Invoice #1234"
                        maxLength={255}
                        disabled={linkSubmitting}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-(--text-primary)">
                        URL *
                      </label>
                      <Input
                        type="url"
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.target.value)}
                        placeholder="https://…"
                        maxLength={2048}
                        disabled={linkSubmitting}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={linkSubmitting || !linkLabel.trim() || !linkUrl.trim()}
                      className="inline-flex h-8 items-center gap-1 rounded-lg bg-(--color-primary) px-3 text-xs font-medium text-white transition-colors hover:bg-(--color-primary-hover) disabled:opacity-60"
                    >
                      {linkSubmitting && <Spinner size="sm" />}
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => setUploadMode("idle")}
                      className="inline-flex h-8 items-center rounded-lg border border-(--border-subtle) px-3 text-xs text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover)"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {uploadMode === "idle" && (
                <div
                  className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-(--border-subtle) bg-(--bg-surface-elev) px-4 py-6 text-center transition-colors hover:border-(--color-primary) hover:bg-(--color-primary-soft)"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files[0];
                    if (f) void uploadFile(f);
                  }}
                >
                  <IconUpload size={20} className="text-(--text-muted)" />
                  <div>
                    <p className="text-sm font-medium text-(--text-primary)">
                      Drop files here or click to upload
                    </p>
                    <p className="mt-0.5 text-xs text-(--text-muted)">
                      Images, PDF, Word, Excel, CSV · Max 25 MB · You can also paste a screenshot
                      (Ctrl/Cmd+V)
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-(--text-muted)">or</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setUploadMode("link");
                      }}
                      className="inline-flex h-7 items-center gap-1 rounded border border-(--border-subtle) bg-(--bg-surface) px-2.5 text-xs text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover)"
                    >
                      <IconPlus size={11} />
                      Add link
                    </button>
                  </div>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadFile(f);
                  e.target.value = "";
                }}
              />
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setApproverOpen((o) => !o)}
                className="flex w-full items-center justify-between text-sm font-semibold text-(--text-primary)"
              >
                <span>
                  Approvers
                  {approverCount > 0 && (
                    <span className="ml-1.5 font-normal text-(--text-muted)">
                      ({approverCount})
                    </span>
                  )}
                </span>
                <IconChevronRight
                  size={14}
                  className={`text-(--text-muted) transition-transform ${approverOpen ? "rotate-90" : ""}`}
                />
              </button>

              {approverOpen && (
                <div className="space-y-2">
                  {approverError && (
                    <p className="text-xs text-(--color-danger)">{approverError}</p>
                  )}
                  {approverLoading ? (
                    <div className="flex items-center gap-2 text-sm text-(--text-muted)">
                      <Spinner size="sm" />
                      Loading team members…
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <SearchableSelect
                          options={approverUsers.map((u) => ({
                            value: u.user.id,
                            label: u.user.name
                              ? `${u.user.name} (${u.user.email ?? ""})`
                              : (u.user.email ?? u.user.id),
                          }))}
                          value={approverSelectedId}
                          onChange={setApproverSelectedId}
                          placeholder="Search team member…"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleAssignApprover()}
                        disabled={approverSubmitting || !approverSelectedId}
                        className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white transition-colors hover:bg-(--color-primary-hover) disabled:opacity-60"
                      >
                        {approverSubmitting ? <Spinner size="sm" /> : <IconPlus size={14} />}
                        Assign
                      </button>
                    </div>
                  )}
                  {approverCount > 0 && (
                    <p className="text-xs text-(--color-success)">
                      {approverCount} approver{approverCount > 1 ? "s" : ""} assigned
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-(--text-primary)">Linked requests</h3>
              <button
                type="button"
                onClick={() => setLinkRecordOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-3 text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover)"
              >
                <IconPlus size={14} />
                Link to existing request
              </button>
            </div>

            <div className="flex justify-end gap-2 border-t border-(--border-subtle) pt-4">
              <button
                type="button"
                onClick={handleDone}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-(--color-primary) px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-(--color-primary-hover)"
              >
                View request
                <IconChevronRight size={14} />
              </button>
            </div>
          </div>
        </Dialog>
        <LinkRecordModal
          open={linkRecordOpen}
          onClose={() => setLinkRecordOpen(false)}
          recordId={createdRecordId}
          onSuccess={() => {
            setLinkRecordOpen(false);
            toast.addToast("success", "Request linked.");
          }}
        />
      </>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={isLoading ? () => {} : onClose}
      title="New Request"
      description="Fill in the details to create a new request."
      contentClassName="max-w-2xl"
      closeDisabled={isLoading}
    >
      <div className="space-y-5">
        {globalError && (
          <div className="rounded-lg border border-(--color-danger-soft) bg-(--color-danger-soft) px-4 py-3 text-sm text-(--color-danger)">
            {globalError}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-(--text-primary)">
            Title <span className="text-(--color-danger)">*</span>
          </label>
          <Input
            value={form.title}
            onChange={(e) => setField("title", e.target.value)}
            placeholder="e.g. Q2 budget approval"
            maxLength={160}
            disabled={isLoading}
            className={errors.title ? "border-(--color-danger)" : ""}
          />
          <div className="flex justify-between">
            {errors.title ? (
              <p className="text-xs text-(--color-danger)">{errors.title}</p>
            ) : (
              <span />
            )}
            <p className="text-xs text-(--text-muted)">{form.title.length}/160</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-(--text-primary)">
            Type <span className="text-(--color-danger)">*</span>
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {RECORD_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setField("type", t.value)}
                disabled={isLoading}
                className={[
                  "rounded-lg border p-3 text-left transition-colors",
                  form.type === t.value
                    ? "border-(--color-primary) bg-(--color-primary-soft)"
                    : "border-(--border-subtle) bg-(--bg-surface-elev) hover:bg-(--bg-surface-hover)",
                ].join(" ")}
              >
                <p
                  className={[
                    "text-sm font-medium",
                    form.type === t.value
                      ? "text-(--color-primary)"
                      : "text-(--text-primary)",
                  ].join(" ")}
                >
                  {t.label}
                </p>
                <p className="mt-0.5 text-xs text-(--text-muted)">{t.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-(--text-primary)">
            Description <span className="font-normal text-(--text-muted)">(optional)</span>
          </label>
          <Textarea
            value={form.description}
            onChange={(e) => setField("description", e.target.value)}
            placeholder="Provide additional context…"
            rows={3}
            maxLength={5000}
            disabled={isLoading}
          />
        </div>

        {selectedType?.showAmount && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-(--text-primary)">
                Amount <span className="font-normal text-(--text-muted)">(optional)</span>
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => setField("amount", e.target.value)}
                placeholder="0.00"
                disabled={isLoading}
                className={errors.amount ? "border-(--color-danger)" : ""}
              />
              {errors.amount && (
                <p className="text-xs text-(--color-danger)">{errors.amount}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-(--text-primary)">
                Currency <span className="font-normal text-(--text-muted)">(optional)</span>
              </label>
              <SearchableSelect
                options={CURRENCY_OPTIONS}
                value={form.currency}
                onChange={(v) => setField("currency", v)}
                placeholder="Search currency…"
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-(--border-subtle) pt-4">
          <button
            type="button"
            onClick={() => void submit("DRAFT")}
            disabled={isLoading || !form.title.trim()}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover) disabled:opacity-60"
          >
            {savingDraft && <Spinner size="sm" />}
            {savingDraft ? "Saving…" : "Save as draft"}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="inline-flex h-9 items-center rounded-lg border border-(--border-subtle) px-4 text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover) disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submit("OPEN")}
              disabled={isLoading || !form.title.trim()}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-(--color-primary) px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-(--color-primary-hover) disabled:opacity-60"
            >
              {submitting && <Spinner size="sm" />}
              {submitting ? "Creating…" : "Create request"}
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

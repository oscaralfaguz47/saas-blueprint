"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";
import {
  IconUpload,
  IconPlus,
  IconChevronRight,
  IconCheck,
} from "@/components/ui/icons";
import { Badge } from "@/components/ui/badge";
import { LinkRecordModal } from "./link-record-modal";
import {
  FinanceRequestWizard,
  type CreateSuccessPayload,
} from "./create-request-form";
import {
  RECORD_STATUS_BADGE,
  RECORD_STATUS_LABELS,
  RECORD_TYPE_LABELS,
  formatAmount,
} from "@/lib/record-utils";
import type { RecordType } from "@/types/records";

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

type Props = {
  open: boolean;
  onClose: () => void;
  sourceRecordId?: string;
};

export function CreateRequestModal({ open, onClose, sourceRecordId }: Props) {
  const router = useRouter();
  const apiFetch = useApiFetch();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [wizardMount, setWizardMount] = useState(0);
  const [successPayload, setSuccessPayload] = useState<CreateSuccessPayload | null>(null);
  const [linkingSource, setLinkingSource] = useState(false);

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

  const createdRecordId = successPayload?.id ?? null;

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
            /* default currency applied inside wizard on first mount */
            void def.currency;
          }
        }
      )
      .catch(() => {});
  }, [open, apiFetch]);

  useEffect(() => {
    if (!open) {
      setSuccessPayload(null);
      setUploadMode("idle");
      setUploadError(null);
      setEvidenceCount(0);
      setApproverCount(0);
      setApproverOpen(false);
      setApproverSelectedId("");
      setLinkRecordOpen(false);
      setLinkLabel("");
      setLinkUrl("");
      setLinkingSource(false);
    } else {
      setWizardMount((k) => k + 1);
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

  async function handleWizardSuccess(payload: CreateSuccessPayload) {
    if (sourceRecordId && sourceRecordId !== payload.id) {
      setLinkingSource(true);
      try {
        const res = await apiFetch(`/api/records/${sourceRecordId}/links`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toRecordId: payload.id, linkType: "RELATED" }),
          showToastOnError: false,
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
          toast.addToast("error", j.error?.message ?? "Could not link to source request.");
        }
      } catch {
        toast.addToast("error", "Could not link to source request.");
      } finally {
        setLinkingSource(false);
      }
    }
    setSuccessPayload(payload);
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
  }, [createdRecordId, uploadMode]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleViewRequest(hash?: string) {
    if (!createdRecordId) return;
    onClose();
    router.push(`/app/requests/${createdRecordId}${hash ? `#${hash}` : ""}`);
  }

  function handleCreateAnother() {
    setSuccessPayload(null);
    setWizardMount((k) => k + 1);
    setEvidenceCount(0);
    setApproverCount(0);
    setUploadMode("idle");
    setUploadError(null);
  }

  const isLoading = linkingSource;

  if (successPayload && createdRecordId) {
    const st = successPayload.status;
    return (
      <>
        <Dialog
          open={open}
          onClose={onClose}
          title="Request created"
          description="Your request is ready. Complete the checklist or view it now."
          contentClassName="max-w-2xl"
        >
          <div className="space-y-6">
            <div className="flex flex-col items-center text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-(--color-success-soft) text-(--color-success)">
                <IconCheck size={24} strokeWidth={2} />
              </div>
              <h3 className="text-lg font-semibold text-(--text-primary)">Request created</h3>
              <p className="mt-1 text-sm text-(--text-muted)">
                {successPayload.recordKey ?? successPayload.title}
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <Badge variant="secondary">{RECORD_TYPE_LABELS[successPayload.type as RecordType]}</Badge>
                <Badge variant={RECORD_STATUS_BADGE[st]}>
                  {RECORD_STATUS_LABELS[st]}
                </Badge>
              </div>
              {successPayload.requestedAmount != null && (
                <p className="mt-2 text-sm font-medium text-(--text-primary)">
                  {formatAmount(
                    successPayload.requestedAmount,
                    successPayload.currencyCode
                  )}
                </p>
              )}
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-(--text-primary)">
                Next steps
              </p>
              <ul className="space-y-2">
                <li>
                  <button
                    type="button"
                    onClick={() =>
                      document.getElementById("modal-post-create-evidence")?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      })
                    }
                    className="flex w-full items-start gap-2 rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-3 py-2.5 text-left text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover)"
                  >
                    <span className="text-(--text-muted)">{evidenceCount > 0 ? "✅" : "☐"}</span>
                    <span>
                      Add supporting evidence
                      {evidenceCount > 0 && (
                        <span className="ml-1 text-xs text-(--color-success)">(added)</span>
                      )}
                    </span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setApproverOpen(true)}
                    className="flex w-full items-start gap-2 rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-3 py-2.5 text-left text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover)"
                  >
                    <span className="text-(--text-muted)">{approverCount > 0 ? "✅" : "☐"}</span>
                    <span>Assign approvers</span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setLinkRecordOpen(true)}
                    className="flex w-full items-start gap-2 rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-3 py-2.5 text-left text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover)"
                  >
                    <span className="text-(--text-muted)">☐</span>
                    <span>Link related requests (optional)</span>
                  </button>
                </li>
              </ul>
            </div>

            <div
              id="modal-post-create-evidence"
              className="space-y-3 rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) p-3"
            >
              <p className="text-xs font-medium text-(--text-muted)">Add evidence now (optional)</p>
              {uploadError && <p className="text-xs text-(--color-danger)">{uploadError}</p>}
              {uploadMode === "uploading" && (
                <div className="flex items-center gap-2 text-sm text-(--text-muted)">
                  <Spinner size="sm" />
                  {uploadProgress ?? "Uploading…"}
                </div>
              )}
              {uploadMode === "link" && (
                <form onSubmit={handleAddLink} className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={linkLabel}
                      onChange={(e) => setLinkLabel(e.target.value)}
                      placeholder="Label"
                      disabled={linkSubmitting}
                    />
                    <Input
                      type="url"
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      placeholder="URL"
                      disabled={linkSubmitting}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={linkSubmitting}
                      className="h-8 rounded bg-(--color-primary) px-3 text-xs text-white"
                    >
                      Add link
                    </button>
                    <button
                      type="button"
                      onClick={() => setUploadMode("idle")}
                      className="h-8 rounded border px-3 text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
              {uploadMode === "idle" && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex h-8 items-center gap-1 rounded border px-3 text-xs"
                  >
                    <IconUpload size={14} />
                    Upload file
                  </button>
                  <button
                    type="button"
                    onClick={() => setUploadMode("link")}
                    className="inline-flex h-8 items-center gap-1 rounded border px-3 text-xs"
                  >
                    <IconPlus size={12} />
                    Link URL
                  </button>
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

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setApproverOpen((o) => !o)}
                className="flex w-full items-center justify-between text-sm font-semibold text-(--text-primary)"
              >
                <span>Assign approver from here</span>
                <IconChevronRight
                  size={14}
                  className={`text-(--text-muted) transition-transform ${approverOpen ? "rotate-90" : ""}`}
                />
              </button>
              {approverOpen && (
                <div className="space-y-2 rounded border border-(--border-subtle) p-3">
                  {approverError && (
                    <p className="text-xs text-(--color-danger)">{approverError}</p>
                  )}
                  {approverLoading ? (
                    <div className="flex items-center gap-2 text-sm text-(--text-muted)">
                      <Spinner size="sm" />
                      Loading…
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
                        className="inline-flex h-10 items-center gap-1 rounded-lg bg-(--color-primary) px-3 text-sm text-white disabled:opacity-60"
                      >
                        {approverSubmitting ? <Spinner size="sm" /> : <IconPlus size={14} />}
                        Assign
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t border-(--border-subtle) pt-4 sm:flex-row sm:justify-between">
              <button
                type="button"
                onClick={handleCreateAnother}
                className="inline-flex h-9 items-center justify-center rounded-lg border px-4 text-sm text-(--text-secondary)"
              >
                Create another
              </button>
              <button
                type="button"
                onClick={() => handleViewRequest()}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-(--color-primary) px-5 text-sm font-medium text-white"
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
      title="New financial request"
      description="Step 1 of 3 — Category & basics · Details · Review"
      contentClassName="max-w-2xl"
      closeDisabled={isLoading}
    >
      {linkingSource && (
        <div className="mb-4 flex items-center gap-2 text-sm text-(--text-muted)">
          <Spinner size="sm" />
          Linking to source request…
        </div>
      )}
      <FinanceRequestWizard
        key={wizardMount}
        variant="modal"
        onSubmitSuccess={handleWizardSuccess}
      />
    </Dialog>
  );
}

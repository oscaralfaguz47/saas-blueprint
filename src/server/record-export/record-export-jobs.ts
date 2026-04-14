import "server-only";

import { prisma } from "@/server/db";
import { JOB_TYPES } from "@/server/jobs/background-jobs";
import {
  checkMeterLimit,
  tryConsumeMeterInTransaction,
  UpgradeRequiredError,
} from "@/server/billing/try-consume-meter";
import { resolveTenantPlan } from "@/server/billing/resolve-tenant-plan";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { canAccessRequest } from "@/server/security/request-authorization";
import {
  buildRecordExportObjectPrefix,
  uploadBufferToR2,
} from "@/server/services/r2-profile-photo";
import { buildApprovalPacketPdf } from "./minimal-pdf";
import { buildStoreOnlyZip, sha256Hex } from "./store-only-zip";

type ExportJobRow = {
  id: string;
  jobType: string;
  payload: unknown;
  tenantId: string | null;
};

function parsePayload(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

async function loadExportSnapshot(tenantId: string, recordId: string) {
  const [record, evidence, participants] = await Promise.all([
    prisma.record.findFirst({
      where: { id: recordId, tenantId },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        description: true,
        clientName: true,
        clientEmail: true,
        amount: true,
        currency: true,
        visibility: true,
        isSensitive: true,
        createdAt: true,
        updatedAt: true,
        closedAt: true,
      },
    }),
    prisma.recordEvidence.findMany({
      where: { recordId, tenantId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { label: true, evidenceType: true, url: true, fileName: true },
    }),
    prisma.recordParticipant.findMany({
      where: { recordId, tenantId },
      orderBy: { createdAt: "asc" },
      select: {
        participantType: true,
        participantRole: true,
        status: true,
        email: true,
        name: true,
      },
    }),
  ]);
  return { record, evidence, participants };
}

function sectionsFromSnapshot(params: {
  record: NonNullable<Awaited<ReturnType<typeof loadExportSnapshot>>["record"]>;
  evidence: Awaited<ReturnType<typeof loadExportSnapshot>>["evidence"];
  participants: Awaited<ReturnType<typeof loadExportSnapshot>>["participants"];
}): { heading: string; body: string }[] {
  const { record, evidence, participants } = params;
  const amt =
    record.amount != null ? String(record.amount) : "";
  const lines: { heading: string; body: string }[] = [
    { heading: "Record ID", body: record.id },
    { heading: "Type", body: record.type },
    { heading: "Status", body: record.status },
    { heading: "Created", body: record.createdAt.toISOString() },
  ];
  if (amt) lines.push({ heading: "Amount", body: `${amt} ${record.currency ?? ""}`.trim() });
  if (record.description) lines.push({ heading: "Description", body: record.description });
  if (record.clientName || record.clientEmail) {
    lines.push({
      heading: "Client",
      body: [record.clientName, record.clientEmail].filter(Boolean).join(" · "),
    });
  }
  lines.push({
    heading: "Evidence",
    body:
      evidence.length === 0
        ? "(none)"
        : evidence
            .map((e) => e.label ?? e.fileName ?? e.url ?? e.evidenceType)
            .join("; "),
  });
  lines.push({
    heading: "Participants",
    body:
      participants.length === 0
        ? "(none)"
        : participants
            .map((p) =>
              [p.name, p.email, p.participantRole, p.participantType, p.status]
                .filter(Boolean)
                .join(" ")
            )
            .join(" | "),
  });
  return lines;
}

async function buildPdfBufferForRecord(params: {
  tenantId: string;
  recordId: string;
  watermark: boolean;
}): Promise<Buffer> {
  const snap = await loadExportSnapshot(params.tenantId, params.recordId);
  if (!snap.record) throw new Error("record_not_found");
  const pdf = buildApprovalPacketPdf({
    title: snap.record.title,
    sections: sectionsFromSnapshot({
      record: snap.record,
      evidence: snap.evidence,
      participants: snap.participants,
    }),
    watermark: params.watermark,
  });
  return pdf;
}

export async function processRecordExportJob(job: ExportJobRow): Promise<void> {
  if (job.jobType === JOB_TYPES.EXPORT_PDF) {
    await processPdfExportJob(job);
    return;
  }
  if (job.jobType === JOB_TYPES.EXPORT_ZIP_BUNDLE) {
    await processZipBundleExportJob(job);
    return;
  }
}

async function processPdfExportJob(job: ExportJobRow): Promise<void> {
  const p = parsePayload(job.payload);
  const recordId = typeof p.recordId === "string" ? p.recordId : null;
  const requestedByUserId =
    typeof p.requestedByUserId === "string" ? p.requestedByUserId : null;
  const watermark = p.watermark === true;
  if (!recordId || !requestedByUserId || !job.tenantId) throw new Error("invalid_payload");

  const prefix = buildRecordExportObjectPrefix(job.tenantId, recordId, job.id);
  const existing = await prisma.recordExport.findFirst({
    where: {
      tenantId: job.tenantId,
      recordId,
      objectKey: { startsWith: prefix },
    },
    select: { id: true },
  });
  if (existing) return;

  const record = await prisma.record.findFirst({
    where: { id: recordId, tenantId: job.tenantId },
    select: { id: true, tenantId: true },
  });
  if (!record) throw new Error("record_not_found");

  const canExport = await hasTenantPermission({
    userId: requestedByUserId,
    tenantId: job.tenantId,
    permission: "tenant.requests.export",
  });
  if (!canExport) throw new Error("forbidden");

  const planPdf = await resolveTenantPlan(job.tenantId);
  if (planPdf.features.pdf.included === 0 && planPdf.features.pdf.hardCap) {
    throw new UpgradeRequiredError("PDF export is not available on your current plan.");
  }

  await checkMeterLimit({ tenantId: job.tenantId, meter: "PDF_EXPORTS", delta: 1 });

  const pdfBuffer = await buildPdfBufferForRecord({
    tenantId: job.tenantId,
    recordId,
    watermark,
  });
  const objectKey = `${prefix}approval-packet.pdf`;
  await uploadBufferToR2({
    objectKey,
    body: pdfBuffer,
    contentType: "application/pdf",
  });
  const sha = sha256Hex(pdfBuffer);

  await prisma.$transaction(async (tx) => {
    await tryConsumeMeterInTransaction(tx, {
      tenantId: job.tenantId!,
      meter: "PDF_EXPORTS",
      delta: 1,
      idempotencyKey: `pdf.export.${recordId}.${job.id}`,
      sourceType: "record.export.pdf",
      sourceId: recordId,
      actorUserId: requestedByUserId,
    });

    await tx.recordExport.create({
      data: {
        tenantId: job.tenantId!,
        recordId,
        exportType: "PDF_APPROVAL_PACKET",
        storageProvider: "r2",
        objectKey,
        fileName: "approval-packet.pdf",
        sizeBytes: pdfBuffer.length,
        sha256: sha,
        watermarkApplied: watermark,
        createdByUserId: requestedByUserId,
      },
    });

    await tx.recordEvent.create({
      data: {
        tenantId: job.tenantId!,
        recordId,
        eventType: "EXPORT_PDF_GENERATED",
        actorUserId: requestedByUserId,
        metadata: { jobId: job.id, objectKey },
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: requestedByUserId,
        actorContext: "TENANT",
        tenantId: job.tenantId!,
        action: "request.export.pdf_generated",
        targetType: "Record",
        targetId: recordId,
        metadata: { jobId: job.id, objectKey },
      },
    });
  });
}

async function processZipBundleExportJob(job: ExportJobRow): Promise<void> {
  const p = parsePayload(job.payload);
  const recordId = typeof p.recordId === "string" ? p.recordId : null;
  const requestedByUserId =
    typeof p.requestedByUserId === "string" ? p.requestedByUserId : null;
  if (!recordId || !requestedByUserId || !job.tenantId) throw new Error("invalid_payload");

  const prefix = buildRecordExportObjectPrefix(job.tenantId, recordId, job.id);
  const existing = await prisma.recordExport.findFirst({
    where: {
      tenantId: job.tenantId,
      recordId,
      objectKey: { startsWith: prefix },
    },
    select: { id: true },
  });
  if (existing) return;

  const record = await prisma.record.findFirst({
    where: { id: recordId, tenantId: job.tenantId },
    select: { id: true },
  });
  if (!record) throw new Error("record_not_found");

  const canExport = await hasTenantPermission({
    userId: requestedByUserId,
    tenantId: job.tenantId,
    permission: "tenant.requests.export",
  });
  if (!canExport) throw new Error("forbidden");

  const plan = await resolveTenantPlan(job.tenantId);
  if (!plan.features.zip.enabled) {
    throw new UpgradeRequiredError("Audit bundle export requires a plan with ZIP export enabled.");
  }

  await checkMeterLimit({ tenantId: job.tenantId, meter: "ZIP_EXPORTS", delta: 1 });

  const watermark = plan.features.pdf.watermark;

  const links = await prisma.recordLink.findMany({
    where: {
      tenantId: job.tenantId,
      removedAt: null,
      OR: [{ fromRecordId: recordId }, { toRecordId: recordId }],
    },
    select: { fromRecordId: true, toRecordId: true },
  });

  const linkedIds: string[] = [];
  for (const l of links) {
    let linkedRecordId: string;
    if (l.fromRecordId === recordId) {
      linkedRecordId = l.toRecordId;
    } else {
      linkedRecordId = l.fromRecordId;
    }
    if (linkedRecordId === recordId) continue;
    const ok = await canAccessRequest({
      tenantId: job.tenantId,
      userId: requestedByUserId,
      requestId: linkedRecordId,
    });
    if (ok) linkedIds.push(linkedRecordId);
  }

  const uniqueLinked = Array.from(new Set(linkedIds));

  const zipFiles: { name: string; data: Buffer }[] = [];
  const mainPdf = await buildPdfBufferForRecord({
    tenantId: job.tenantId,
    recordId,
    watermark,
  });
  zipFiles.push({ name: `record-${recordId}-approval-packet.pdf`, data: mainPdf });

  for (const lid of uniqueLinked) {
    const pdf = await buildPdfBufferForRecord({
      tenantId: job.tenantId,
      recordId: lid,
      watermark,
    });
    zipFiles.push({ name: `record-${lid}-approval-packet.pdf`, data: pdf });
  }

  const zipBuffer = buildStoreOnlyZip(zipFiles);
  const objectKey = `${prefix}audit-bundle.zip`;
  await uploadBufferToR2({
    objectKey,
    body: zipBuffer,
    contentType: "application/zip",
  });
  const sha = sha256Hex(zipBuffer);

  await prisma.$transaction(async (tx) => {
    await tryConsumeMeterInTransaction(tx, {
      tenantId: job.tenantId!,
      meter: "ZIP_EXPORTS",
      delta: 1,
      idempotencyKey: `zip.export.${recordId}.${job.id}`,
      sourceType: "record.export.zip_bundle",
      sourceId: recordId,
      actorUserId: requestedByUserId,
    });

    await tx.recordExport.create({
      data: {
        tenantId: job.tenantId!,
        recordId,
        exportType: "ZIP_AUDIT_BUNDLE",
        storageProvider: "r2",
        objectKey,
        fileName: "audit-bundle.zip",
        sizeBytes: zipBuffer.length,
        sha256: sha,
        watermarkApplied: watermark,
        createdByUserId: requestedByUserId,
      },
    });

    await tx.recordEvent.create({
      data: {
        tenantId: job.tenantId!,
        recordId,
        eventType: "EXPORT_BUNDLE_GENERATED",
        actorUserId: requestedByUserId,
        metadata: { jobId: job.id, objectKey, linkedCount: uniqueLinked.length },
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: requestedByUserId,
        actorContext: "TENANT",
        tenantId: job.tenantId!,
        action: "request.export.bundle_generated",
        targetType: "Record",
        targetId: recordId,
        metadata: { jobId: job.id, objectKey, linkedCount: uniqueLinked.length },
      },
    });
  });
}

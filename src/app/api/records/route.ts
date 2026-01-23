import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { writeAuditLog } from "@/server/services/audit";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const membership = await getDefaultTenantForUser(session.user.id);
  if (!membership?.tenant) return NextResponse.json({ error: "NO_TENANT" }, { status: 403 });

  const rows = await prisma.record.findMany({
    where: { tenantId: membership.tenant.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, type: true, status: true, createdAt: true },
    take: 50,
  });

  return NextResponse.json({ records: rows });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const membership = await getDefaultTenantForUser(session.user.id);
  if (!membership?.tenant) return NextResponse.json({ error: "NO_TENANT" }, { status: 403 });

  const body = await req.json().catch(() => null) as null | {
    title: string;
    type: "SCOPE_CHANGE" | "DECISION" | "BUDGET";
    description?: string;
    clientName?: string;
    clientEmail?: string;
    amount?: number;
    currency?: string;
    visibility?: "WORKSPACE" | "RESTRICTED";
    isSensitive?: boolean;
  };

  const title = (body?.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "TITLE_REQUIRED" }, { status: 400 });

  const created = await prisma.record.create({
    data: {
      tenantId: membership.tenant.id,
      createdByUserId: session.user.id,
      title,
      type: body?.type ?? "SCOPE_CHANGE",
      description: body?.description?.trim() || null,
      clientName: body?.clientName?.trim() || null,
      clientEmail: body?.clientEmail?.trim().toLowerCase() || null,
      amount: body?.amount != null ? body.amount : null,
      currency: body?.currency?.trim() || null,
      visibility: body?.visibility ?? "WORKSPACE",
      isSensitive: body?.isSensitive ?? false,
      status: "DRAFT",
    },
    select: { id: true },
  });

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId: membership.tenant.id,
    action: "record.created",
    targetType: "Record",
    targetId: created.id,
  });

  return NextResponse.json({ id: created.id }, { status: 201 });
}

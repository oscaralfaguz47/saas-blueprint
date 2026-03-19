import "server-only";
import { createHash, randomInt } from "node:crypto";
import { prisma } from "@/server/db";

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5; // brute force protection
const RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute between resends

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function generateCode(): string {
  // Cryptographically secure 6-digit code (000000–999999)
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export type GenerateOtpResult =
  | { success: true; code: string; isResend: boolean }
  | { success: false; error: "rate_limited"; retryAfterMs: number };

export async function generateEmailOtp(email: string): Promise<GenerateOtpResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const now = new Date();

  // Check resend cooldown — prevent spamming.
  const recent = await prisma.emailVerificationCode.findFirst({
    where: {
      email: normalizedEmail,
      usedAt: null,
      createdAt: { gt: new Date(now.getTime() - RESEND_COOLDOWN_MS) },
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (recent) {
    const retryAfterMs = RESEND_COOLDOWN_MS - (now.getTime() - recent.createdAt.getTime());
    return { success: false, error: "rate_limited", retryAfterMs };
  }

  // Invalidate previous unused codes for this email.
  await prisma.emailVerificationCode.updateMany({
    where: {
      email: normalizedEmail,
      usedAt: null,
      expiresAt: { gt: now },
    },
    data: { expiresAt: now },
  });

  const code = generateCode();
  const codeHash = hashCode(code);
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

  await prisma.emailVerificationCode.create({
    data: {
      email: normalizedEmail,
      codeHash,
      expiresAt,
    },
  });

  return { success: true, code, isResend: false };
}

export type VerifyOtpResult =
  | { success: true; email: string }
  | { success: false; error: "invalid_code" | "expired" | "too_many_attempts" };

export async function verifyEmailOtp(email: string, code: string): Promise<VerifyOtpResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const now = new Date();
  const codeHash = hashCode(code.trim());

  // Find the most recent active code for this email.
  const record = await prisma.emailVerificationCode.findFirst({
    where: {
      email: normalizedEmail,
      usedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!record) return { success: false, error: "expired" };

  // Increment attempts first (prevents timing attacks).
  await prisma.emailVerificationCode.update({
    where: { id: record.id },
    data: { attempts: { increment: 1 } },
  });

  const nextAttempts = record.attempts + 1;
  if (nextAttempts >= MAX_ATTEMPTS) {
    // Expire the code after too many attempts.
    await prisma.emailVerificationCode.update({
      where: { id: record.id },
      data: { expiresAt: now },
    });
    return { success: false, error: "too_many_attempts" };
  }

  if (record.codeHash !== codeHash) {
    return { success: false, error: "invalid_code" };
  }

  // Mark as used (one-time).
  await prisma.emailVerificationCode.update({
    where: { id: record.id },
    data: { usedAt: now },
  });

  return { success: true, email: normalizedEmail };
}


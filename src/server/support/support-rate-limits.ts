import "server-only";

import { checkRateLimit } from "@/lib/rate-limit";

export async function checkSupportTicketCreateLimit(userId: string) {
  return checkRateLimit(`support:ticket:create:${userId}`, 20, 60_000);
}

export async function checkSupportTicketReplyLimit(userId: string) {
  return checkRateLimit(`support:ticket:reply:${userId}`, 60, 60_000);
}

/** Public keyword search — per IP. */
export async function checkKbSearchLimit(identifier: string) {
  return checkRateLimit(`kb:search:ip:${identifier}`, 120, 60_000);
}

/** Public AI answer — per IP. */
export async function checkKbAiAnswerLimit(identifier: string) {
  return checkRateLimit(`kb:ai:ip:${identifier}`, 30, 60_000);
}

/** Authenticated search — per user. */
export async function checkKbSearchLimitUser(userId: string) {
  return checkRateLimit(`kb:search:user:${userId}`, 120, 60_000);
}

export async function checkKbAiAnswerLimitUser(userId: string) {
  return checkRateLimit(`kb:ai:user:${userId}`, 30, 60_000);
}

/** Public help sales form — per IP. */
export async function checkHelpSalesInquiryLimit(identifier: string) {
  return checkRateLimit(`help:sales:ip:${identifier}`, 10, 60_000);
}

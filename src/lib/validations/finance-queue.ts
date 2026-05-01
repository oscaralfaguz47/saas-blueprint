import { FinanceStatus } from "@prisma/client";
import { z } from "zod";

const validFinanceStatuses = Object.values(FinanceStatus) as string[];

const financeQueueListBaseSchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().cuid().optional(),
  status: z.string().optional(),
});

export const financeQueueListQuerySchema = financeQueueListBaseSchema
  .superRefine((data, ctx) => {
    if (!data.status?.trim()) return;
    const parts = data.status.split(",").map((s) => s.trim()).filter(Boolean);
    const parsed = parts.filter((s) => validFinanceStatuses.includes(s));
    if (parsed.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid status filter",
        path: ["status"],
      });
    }
  })
  .transform((data) => {
    let status: FinanceStatus[] | undefined;
    if (data.status?.trim()) {
      const parts = data.status.split(",").map((s) => s.trim()).filter(Boolean);
      status = parts.filter((s) => validFinanceStatuses.includes(s)) as FinanceStatus[];
    }
    return {
      limit: data.limit,
      cursor: data.cursor,
      status,
    };
  });

export const financeQueueRecordIdParamSchema = z.object({
  recordId: z.string().cuid(),
});

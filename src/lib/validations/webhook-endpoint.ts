import { z } from "zod";
import { WebhookDeliveryStatus, WebhookEndpointStatus } from "@prisma/client";
import { webhookEventNameSchema } from "@/lib/webhooks/event-catalog";

const nameField = z.string().trim().min(1).max(120);
const descriptionField = z.string().trim().max(500).optional();

export const webhookEndpointCreateSchema = z.object({
  name: nameField,
  description: descriptionField,
  url: z.string().trim().url().max(2048),
  subscribedEvents: z.array(webhookEventNameSchema).min(1),
});

/** Tenant may only set ACTIVE or PAUSED; DISABLED_AUTO is system-only. */
export const webhookEndpointPatchSchema = z
  .object({
    name: nameField.optional(),
    description: z.union([z.string().trim().max(500), z.null()]).optional(),
    subscribedEvents: z.array(webhookEventNameSchema).min(1).optional(),
    status: z.enum(["ACTIVE", "PAUSED"]).optional(),
  })
  .strict()
  .refine(
    (d) =>
      d.name !== undefined ||
      d.description !== undefined ||
      d.subscribedEvents !== undefined ||
      d.status !== undefined,
    { message: "At least one field must be provided" }
  );

export const webhookEndpointListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(20),
  cursor: z.string().optional(),
  status: z.nativeEnum(WebhookEndpointStatus).optional(),
  includeArchived: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

/** GET /api/tenant/webhook-endpoints/[endpointId]/deliveries */
export const webhookEndpointDeliveriesListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(20),
  cursor: z.string().optional(),
  status: z.nativeEnum(WebhookDeliveryStatus).optional(),
});

export type WebhookEndpointCreateInput = z.infer<typeof webhookEndpointCreateSchema>;
export type WebhookEndpointPatchInput = z.infer<typeof webhookEndpointPatchSchema>;
export type WebhookEndpointListQuery = z.infer<typeof webhookEndpointListQuerySchema>;
export type WebhookEndpointDeliveriesListQuery = z.infer<
  typeof webhookEndpointDeliveriesListQuerySchema
>;

import { z } from "zod";
import { emailSchema } from "./common";

/**
 * Invitation creation schema
 */
export const createInvitationSchema = z.object({
  email: emailSchema,
});

/**
 * Accept invitation schema
 */
export const acceptInvitationSchema = z.object({
  token: z.string().min(20, "Token must be at least 20 characters"),
});

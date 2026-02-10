import { z } from "zod";

export const updateMemberStatusSchema = z.object({
  status: z.enum(["ACTIVE", "DISABLED"]),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(["Owner", "Admin", "Finance", "Member"]),
});

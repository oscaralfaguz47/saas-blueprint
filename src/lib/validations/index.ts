/**
 * Validation schemas and helpers.
 * Re-exports from domain files so imports can use either:
 *   import { createTenantSchema } from "@/lib/validations"
 *   import { createTenantSchema } from "@/lib/validations/workspace"
 */

export {
  emailSchema,
  cuidSchema,
  paginationSchema,
  parseBody,
} from "./common";

export {
  slugFromTenantName,
  createTenantSchema,
  setDefaultTenantSchema,
} from "./workspace";

export { createRecordSchema } from "./record";

export {
  createInvitationSchema,
  acceptInvitationSchema,
} from "./invitation";

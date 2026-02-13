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
  TENANT_SLUG_MAX,
  CLAIM_SLUG_MIN,
  CLAIM_SLUG_MAX,
  RESERVED_SLUGS,
  normalizeSlug,
  nameFromSlug,
  createTenantSchema,
  setDefaultTenantSchema,
  claimSlugSchema,
  claimWorkspaceSchema,
  workspaceSettingsSchema,
  logoUploadUrlSchema,
  logoConfirmSchema,
} from "./workspace";

export { createRecordSchema } from "./record";

export {
  createInvitationSchema,
  acceptInvitationSchema,
} from "./invitation";

export {
  updateMemberStatusSchema,
  updateMemberRoleSchema,
} from "./member";

export {
  profilePatchSchema,
  appearanceModeSchema,
  appearancePatchSchema,
  photoUploadUrlSchema,
  photoConfirmSchema,
  twoFaCodeSchema,
  twoFaVerifySchema,
  autoLogoutPatchSchema,
} from "./account";

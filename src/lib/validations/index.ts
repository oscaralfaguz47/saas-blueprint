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
  readJsonBody,
  parseWithSchema,
  LegacyFieldRemovedError,
  MAX_JSON_BODY_BYTES,
} from "./common";

export {
  TENANT_SLUG_MAX,
  normalizeSlug,
  nameFromSlug,
  createTenantSchema,
  setDefaultTenantSchema,
  workspaceSettingsSchema,
  logoUploadUrlSchema,
  logoConfirmSchema,
} from "./workspace";

export { createRecordSchema, rejectLegacyRecordFinanceKeys } from "./record";

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
  auth2FaVerifySchema,
  autoLogoutPatchSchema,
} from "./account";

export {
  kbCategoryCreateSchema,
  kbCategoryPatchSchema,
  kbArticleListQuerySchema,
  kbArticleCreateSchema,
  kbArticlePatchSchema,
} from "./kb-admin";

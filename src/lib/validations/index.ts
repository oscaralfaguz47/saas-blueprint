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
  updateMember4AxisSchema,
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

export {
  financeTeamCreateSchema,
  financeTeamPatchSchema,
  financeTeamListQuerySchema,
  financeTeamMemberAddSchema,
  financeTeamMemberPatchSchema,
  financeTeamMemberListQuerySchema,
} from "./finance-team";
export type {
  FinanceTeamCreateInput,
  FinanceTeamPatchInput,
  FinanceTeamMemberAddInput,
  FinanceTeamMemberPatchInput,
} from "./finance-team";

export {
  financeAssignmentRuleCreateSchema,
  financeAssignmentRulePatchSchema,
  financeAssignmentRuleListQuerySchema,
  validateConditionShape,
} from "./finance-assignment-rule";
export type {
  FinanceAssignmentRuleCreateInput,
  FinanceAssignmentRulePatchInput,
} from "./finance-assignment-rule";

export {
  approvalRoutingRuleCreateSchema,
  approvalRoutingRulePatchSchema,
  approvalRoutingRuleListQuerySchema,
  approvalRoutingRuleApproverSchema,
  evaluateApprovalRoutingPlanGate,
  assertMergedEscalationConfig,
} from "./approval-routing-rule";
export type {
  ApprovalRoutingRuleCreateInput,
  ApprovalRoutingRulePatchInput,
  ApprovalRoutingPlanFeatures,
  ApprovalRoutingPlanGateResult,
} from "./approval-routing-rule";

export {
  financeQueueListQuerySchema,
  financeQueueRecordIdParamSchema,
} from "./finance-queue";

export { reassignBodySchema } from "./finance-reassignment";
export type { ReassignBody } from "./finance-reassignment";

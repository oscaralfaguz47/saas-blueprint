import "server-only";

import { KbVisibility } from "@prisma/client";

/**
 * Knowledge Base content visible on /help surfaces: anonymous users see PUBLIC only;
 * authenticated users also see AUTHENTICATED (never INTERNAL on public marketing/help routes).
 */
export function kbVisibilityFilterForHelpSurface(isAuthenticated: boolean) {
  return isAuthenticated
    ? { in: [KbVisibility.PUBLIC, KbVisibility.AUTHENTICATED] }
    : KbVisibility.PUBLIC;
}

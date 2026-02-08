import { redirect } from "next/navigation";

/**
 * Workspace creation is modal-first (user menu → Create workspace).
 * Redirect legacy /app/workspace/new links to dashboard.
 */
export default function NewWorkspacePage() {
  redirect("/app/dashboard");
}

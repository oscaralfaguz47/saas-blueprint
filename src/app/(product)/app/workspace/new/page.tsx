import { redirect } from "next/navigation";

/**
 * Workspace creation is modal-first (user menu → Create workspace).
 * Redirect legacy /app/workspace/new links to requests.
 */
export default function NewWorkspacePage() {
  redirect("/app/requests");
}

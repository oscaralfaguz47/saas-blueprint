import Link from "next/link";
import CreateWorkspaceForm from "@/components/app/workspace/create-workspace-form";
import { IconWorkspace } from "@/components/ui/icons";

export default function NewWorkspacePage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/app/dashboard"
          className="text-sm text-(--text-muted) hover:text-(--text-primary)"
        >
          ← Back to dashboard
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-(--border-subtle) bg-(--bg-surface-elev) text-(--text-muted)">
          <IconWorkspace size={24} />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-(--text-primary)">
            Create a workspace
          </h1>
          <p className="mt-0.5 text-sm text-(--text-secondary)">
            Add a new workspace to organize projects and collaborate with your team.
          </p>
        </div>
      </div>

      <CreateWorkspaceForm />
    </div>
  );
}

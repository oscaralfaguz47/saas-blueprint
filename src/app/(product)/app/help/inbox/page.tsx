import Link from "next/link";

import { HelpInboxClient } from "@/components/app/help/help-inbox-client";

export const dynamic = "force-dynamic";

export default function HelpInboxPage() {
  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-(--text-primary)">Support Inbox</h1>
          <p className="mt-1 text-sm text-(--text-muted)">Your workspace support tickets.</p>
        </div>
        <Link
          href="/app/help/new"
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white shadow-sm hover:bg-(--color-primary-hover)"
        >
          New request
        </Link>
      </div>
      <div className="mt-8">
        <HelpInboxClient />
      </div>
    </div>
  );
}

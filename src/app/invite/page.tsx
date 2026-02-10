import { Suspense } from "react";
import InviteClient from "./invite-client";

// Force dynamic rendering - this page uses client-side hooks and search params
export const dynamic = "force-dynamic";

function InviteFallback() {
  return (
    <main className="min-h-screen bg-(--bg-main)">
      <div className="flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-md rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-6 text-center">
          <p className="text-sm text-(--text-secondary)">Loading invitation…</p>
        </div>
      </div>
    </main>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={<InviteFallback />}>
      <InviteClient />
    </Suspense>
  );
}

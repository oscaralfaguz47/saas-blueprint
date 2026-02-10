import { Suspense } from "react";
import InviteClient from "./invite-client";

// Force dynamic rendering - this page uses client-side hooks and search params
export const dynamic = "force-dynamic";

export default function InvitePage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-md px-6 py-12"><p className="text-(--text-secondary)">Loading…</p></main>}>
      <InviteClient />
    </Suspense>
  );
}

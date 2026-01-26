import InviteClient from "./invite-client";

// Force dynamic rendering - this page uses client-side hooks and search params
export const dynamic = "force-dynamic";

export default function InvitePage() {
  return <InviteClient />;
}

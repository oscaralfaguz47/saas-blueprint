import { HelpInboxClient } from "@/components/app/help/help-inbox-client";

export const dynamic = "force-dynamic";

export default function HelpInboxPage() {
  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold text-(--text-primary)">
          Support Inbox
        </h1>
        <p className="mt-1 text-sm text-(--text-muted)">
          Your workspace support tickets.
        </p>
      </div>
      <div className="mt-8">
        <HelpInboxClient />
      </div>
    </div>
  );
}

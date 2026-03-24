import { HelpNewRequestClient } from "@/components/app/help/help-new-request-client";

export const dynamic = "force-dynamic";

export default function HelpNewPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <HelpNewRequestClient />
    </div>
  );
}

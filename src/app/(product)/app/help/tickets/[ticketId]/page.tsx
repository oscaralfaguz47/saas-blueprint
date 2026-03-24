import { HelpTicketThreadClient } from "@/components/app/help/help-ticket-thread-client";

export const dynamic = "force-dynamic";

export default async function HelpTicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = await params;
  return <HelpTicketThreadClient ticketId={ticketId} />;
}

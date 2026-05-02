import { redirect } from "next/navigation";

type Props = { params: Promise<{ recordId: string }> };

export default async function QueueRecordRedirectPage({ params }: Props) {
  const { recordId } = await params;
  redirect(`/app/requests/${recordId}`);
}

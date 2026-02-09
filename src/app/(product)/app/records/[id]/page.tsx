import { redirect } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

export default async function RecordDetailRedirectPage({ params }: Props) {
  const { id } = await params;
  redirect(`/app/requests/${id}`);
}

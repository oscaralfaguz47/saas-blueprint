import { redirect } from "next/navigation";

export default function NewRecordRedirectPage() {
  redirect("/app/requests/new");
}

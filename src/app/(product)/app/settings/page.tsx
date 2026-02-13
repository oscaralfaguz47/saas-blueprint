import { redirect } from "next/navigation";

/**
 * Legacy route: redirect to My Account (L1).
 */
export default function SettingsPage() {
  redirect("/app/account");
}

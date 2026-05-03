export function formatNotificationBody(body: string | null): string | null {
  if (!body) return null;
  return body
    .replace(/OPEN/g, "Open")
    .replace(/IN_PROGRESS/g, "In progress")
    .replace(/WAITING_FOR_CUSTOMER/g, "Waiting for customer")
    .replace(/CLOSED/g, "Closed");
}

export function formatRelativeTime(iso: string): string {
  const when = new Date(iso).getTime();
  if (Number.isNaN(when)) return "";
  const diffMs = Date.now() - when;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs < minute) return "just now";
  if (diffMs < hour) {
    const n = Math.floor(diffMs / minute);
    return `${n} minute${n === 1 ? "" : "s"} ago`;
  }
  if (diffMs < day) {
    const n = Math.floor(diffMs / hour);
    return `${n} hour${n === 1 ? "" : "s"} ago`;
  }
  const n = Math.floor(diffMs / day);
  return `${n} day${n === 1 ? "" : "s"} ago`;
}

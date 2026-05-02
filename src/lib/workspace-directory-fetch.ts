type ApiFetch = (input: RequestInfo | URL, init?: { showToastOnError?: boolean }) => Promise<Response>;

const DEFAULT_MAX_PAGES = 15;
const DEFAULT_PAGE = 20;

export async function fetchFinanceTeamsDirectory(
  apiFetch: ApiFetch,
  maxPages = DEFAULT_MAX_PAGES,
  pageSize = DEFAULT_PAGE,
): Promise<{ id: string; name: string }[]> {
  const agg: { id: string; name: string }[] = [];
  let cursor: string | null | undefined = undefined;
  for (let p = 0; p < maxPages; p++) {
    const params = new URLSearchParams();
    params.set("limit", String(pageSize));
    if (cursor) params.set("cursor", cursor);
    const res = await apiFetch(`/api/tenant/finance-teams?${params}`, { showToastOnError: false });
    const data = (await res.json().catch(() => ({}))) as {
      data?: { items?: { id: string; name: string }[]; nextCursor?: string | null };
    };
    if (!res.ok) break;
    agg.push(...(data.data?.items ?? []));
    cursor = data.data?.nextCursor ?? null;
    if (!cursor) break;
  }
  return agg;
}

type MemberRow = {
  membershipId?: string;
  userId: string;
  name: string | null;
  email: string | null;
  role: string;
  status: string;
};

export async function fetchActiveWorkspaceMembers(
  apiFetch: ApiFetch,
  maxPages = DEFAULT_MAX_PAGES,
  pageSize = DEFAULT_PAGE,
): Promise<MemberRow[]> {
  const agg: MemberRow[] = [];
  let cursor: string | null | undefined = undefined;
  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams();
    params.set("limit", String(pageSize));
    params.set("statuses", "ACTIVE");
    params.set("sortBy", "joined");
    params.set("sortDir", "desc");
    if (cursor) params.set("cursor", cursor);
    const res = await apiFetch(`/api/settings/workspace/members?${params}`, {
      showToastOnError: false,
    });
    const data = (await res.json().catch(() => ({}))) as {
      data?: { items?: MemberRow[]; nextCursor?: string | null };
    };
    if (!res.ok) break;
    agg.push(...(data.data?.items ?? []));
    cursor = data.data?.nextCursor ?? null;
    if (!cursor) break;
  }
  return agg;
}

export function membersToUserAndMembershipOptions(members: MemberRow[]): {
  userOptions: { value: string; label: string }[];
  membershipOptions: { value: string; label: string }[];
} {
  const userOpts: { value: string; label: string }[] = [];
  const memOpts: { value: string; label: string }[] = [];
  const seenUser = new Set<string>();
  for (const m of members) {
    const primary = m.name ?? m.email ?? "User";
    const secondary = m.email && m.name !== m.email ? m.email : "";
    const label = [primary, secondary, m.role].filter(Boolean).join(" · ");
    if (m.userId && !seenUser.has(m.userId)) {
      seenUser.add(m.userId);
      userOpts.push({ value: m.userId, label });
    }
    if (m.membershipId) memOpts.push({ value: m.membershipId, label });
  }
  return { userOptions: userOpts, membershipOptions: memOpts };
}

// ── Session factory ─────────────────────────────────────────────────────────

export function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: "user_test_123",
      email: "test@example.com",
      name: "Test User",
      authLevel: "FULL",
      mfaVerified: true,
      totpEnabled: false,
      sessionToken: "tok_test_abc",
      ...overrides,
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

// ── Request factory ──────────────────────────────────────────────────────────

export function makeRequest(
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    url?: string;
  } = {}
): Request {
  const {
    method = "POST",
    body,
    headers = {},
    url = "https://app.example.com/api/test",
  } = options;

  const defaultHeaders: Record<string, string> = {
    "content-type": "application/json",
    ...headers,
  };

  return new Request(url, {
    method,
    headers: defaultHeaders,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

// ── Tenant factory ───────────────────────────────────────────────────────────

export function makeTenant(overrides: Record<string, unknown> = {}) {
  return {
    id: "tenant_test_123",
    name: "Test Workspace",
    slug: "test-workspace",
    status: "ACTIVE",
    ...overrides,
  };
}

// ── Membership factory ───────────────────────────────────────────────────────

export function makeMembership(overrides: Record<string, unknown> = {}) {
  return {
    id: "membership_test_123",
    tenantId: "tenant_test_123",
    userId: "user_test_123",
    status: "ACTIVE",
    tenant: makeTenant(),
    roles: [],
    ...overrides,
  };
}

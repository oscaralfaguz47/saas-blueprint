"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useApiFetch } from "@/hooks/use-api-fetch";

type TenantPermissionsContextValue = {
  permissions: string[];
  loading: boolean;
  has: (code: string) => boolean;
  hasAny: (codes: string[]) => boolean;
};

const TenantPermissionsContext = createContext<TenantPermissionsContextValue | null>(null);

export function TenantPermissionsProvider({ children }: { children: React.ReactNode }) {
  const apiFetch = useApiFetch();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    apiFetch("/api/tenant/permissions", { showToastOnError: false, signal })
      .then((r) => (signal.aborted ? null : r.json()))
      .then((data: { data?: { permissions?: string[] } } | null) => {
        if (data && !signal.aborted) setPermissions(data.data?.permissions ?? []);
      })
      .catch(() => {
        if (!signal.aborted) setPermissions([]);
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [apiFetch]);

  const has = useCallback((code: string) => permissions.includes(code), [permissions]);
  const hasAny = useCallback(
    (codes: string[]) => codes.some((c) => permissions.includes(c)),
    [permissions],
  );

  const value: TenantPermissionsContextValue = {
    permissions,
    loading,
    has,
    hasAny,
  };

  return (
    <TenantPermissionsContext.Provider value={value}>{children}</TenantPermissionsContext.Provider>
  );
}

export function useTenantPermissions(): TenantPermissionsContextValue {
  const ctx = useContext(TenantPermissionsContext);
  if (!ctx) {
    return {
      permissions: [],
      loading: false,
      has: () => false,
      hasAny: () => false,
    };
  }
  return ctx;
}

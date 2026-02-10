"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useApiFetch } from "@/hooks/use-api-fetch";

type TenantPermissionsContextValue = {
  permissions: string[];
  loading: boolean;
  has: (code: string) => boolean;
  hasAny: (codes: string[]) => boolean;
};

const TenantPermissionsContext = createContext<TenantPermissionsContextValue | null>(
  null
);

export function TenantPermissionsProvider({ children }: { children: React.ReactNode }) {
  const apiFetch = useApiFetch();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/tenant/permissions", { showToastOnError: false })
      .then((r) => r.json())
      .then((data: { data?: { permissions?: string[] } }) => {
        setPermissions(data.data?.permissions ?? []);
      })
      .catch(() => setPermissions([]))
      .finally(() => setLoading(false));
  }, [apiFetch]);

  const has = useCallback(
    (code: string) => permissions.includes(code),
    [permissions]
  );
  const hasAny = useCallback(
    (codes: string[]) => codes.some((c) => permissions.includes(c)),
    [permissions]
  );

  const value: TenantPermissionsContextValue = {
    permissions,
    loading,
    has,
    hasAny,
  };

  return (
    <TenantPermissionsContext.Provider value={value}>
      {children}
    </TenantPermissionsContext.Provider>
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

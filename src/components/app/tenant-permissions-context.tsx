"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
  const apiFetchRef = useRef(apiFetch);
  useEffect(() => {
    apiFetchRef.current = apiFetch;
  }, [apiFetch]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    apiFetchRef.current("/api/tenant/permissions", { showToastOnError: false, signal })
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — apiFetch via stable ref

  useEffect(() => {
    function handleWorkspaceReady() {
      setLoading(true);
      apiFetchRef.current("/api/tenant/permissions", { showToastOnError: false })
        .then((r) => r.json())
        .then((data: { data?: { permissions?: string[] } } | null) => {
          setPermissions(data?.data?.permissions ?? []);
        })
        .catch(() => {
          setPermissions([]);
        })
        .finally(() => {
          setLoading(false);
        });
    }

    window.addEventListener("workspace-ready", handleWorkspaceReady);
    return () => {
      window.removeEventListener("workspace-ready", handleWorkspaceReady);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — apiFetch via stable ref, no other deps needed

  const has = useCallback((code: string) => permissions.includes(code), [permissions]);
  const hasAny = useCallback(
    (codes: string[]) => codes.some((c) => permissions.includes(c)),
    [permissions],
  );

  const value: TenantPermissionsContextValue = useMemo(
    () => ({
      permissions,
      loading,
      has,
      hasAny,
    }),
    [permissions, loading, has, hasAny],
  );

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

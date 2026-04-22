"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { CreateRequestModal } from "./create-request-modal";

export type CreatedRecordPayload = {
  id: string;
  title: string;
  type: string;
  status: string;
  createdAt: string;
  priority: string;
  requestedAmount: number | null;
  currencyCode: string | null;
  neededByDate: string | null;
  recordKey: string | null;
};

type ContextValue = {
  openCreateRequestModal: (opts?: {
    sourceRecordId?: string;
    workspaceCurrency?: string;
    onCreated?: (payload: CreatedRecordPayload) => void;
  }) => void;
};

const Context = createContext<ContextValue | null>(null);

export function CreateRequestModalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [sourceRecordId, setSourceRecordId] = useState<string | undefined>();
  const [workspaceCurrency, setWorkspaceCurrency] = useState<string>("USD");
  const onCreatedCallbackRef = useRef<((payload: CreatedRecordPayload) => void) | undefined>(undefined);

  const openCreateRequestModal = useCallback(
    (opts?: {
      sourceRecordId?: string;
      workspaceCurrency?: string;
      onCreated?: (payload: CreatedRecordPayload) => void;
    }) => {
      setSourceRecordId(opts?.sourceRecordId);
      setWorkspaceCurrency(opts?.workspaceCurrency ?? "USD");
      onCreatedCallbackRef.current = opts?.onCreated;
      setOpen(true);
    },
    []
  );

  const handleClose = useCallback(() => {
    setOpen(false);
    setSourceRecordId(undefined);
    setWorkspaceCurrency("USD");
    onCreatedCallbackRef.current = undefined;
  }, []);

  return (
    <Context.Provider value={{ openCreateRequestModal }}>
      {children}
      <CreateRequestModal
        open={open}
        onClose={handleClose}
        sourceRecordId={sourceRecordId}
        workspaceCurrency={workspaceCurrency}
        onCreatedRef={onCreatedCallbackRef}
      />
    </Context.Provider>
  );
}

export function useCreateRequestModal(): ContextValue {
  const ctx = useContext(Context);
  if (!ctx) return { openCreateRequestModal: () => {} };
  return ctx;
}

const LAST_CATEGORY_KEY = "rlt_last_request_category";
const LAST_WORKSPACE_CURRENCY_KEY = "rlt_last_workspace_currency";

export function useRequestSmartDefaults() {
  const getLastCategory = (): string | null => {
    try {
      return sessionStorage.getItem(LAST_CATEGORY_KEY);
    } catch {
      return null;
    }
  };

  const saveLastCategory = (category: string) => {
    try {
      sessionStorage.setItem(LAST_CATEGORY_KEY, category);
    } catch {
      // ignore
    }
  };

  const getLastWorkspaceCurrency = (): string | null => {
    try {
      return sessionStorage.getItem(LAST_WORKSPACE_CURRENCY_KEY);
    } catch {
      return null;
    }
  };

  const saveLastWorkspaceCurrency = (currency: string) => {
    try {
      sessionStorage.setItem(LAST_WORKSPACE_CURRENCY_KEY, currency);
    } catch {
      // ignore
    }
  };

  return {
    getLastCategory,
    saveLastCategory,
    getLastWorkspaceCurrency,
    saveLastWorkspaceCurrency,
  };
}

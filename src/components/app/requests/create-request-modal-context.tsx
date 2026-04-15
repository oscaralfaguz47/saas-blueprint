"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { CreateRequestModal } from "./create-request-modal";

type ContextValue = {
  openCreateRequestModal: (opts?: { sourceRecordId?: string }) => void;
};

const Context = createContext<ContextValue | null>(null);

export function CreateRequestModalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [sourceRecordId, setSourceRecordId] = useState<string | undefined>();

  const openCreateRequestModal = useCallback(
    (opts?: { sourceRecordId?: string }) => {
      setSourceRecordId(opts?.sourceRecordId);
      setOpen(true);
    },
    []
  );

  const handleClose = useCallback(() => {
    setOpen(false);
    setSourceRecordId(undefined);
  }, []);

  return (
    <Context.Provider value={{ openCreateRequestModal }}>
      {children}
      <CreateRequestModal
        open={open}
        onClose={handleClose}
        sourceRecordId={sourceRecordId}
      />
    </Context.Provider>
  );
}

export function useCreateRequestModal(): ContextValue {
  const ctx = useContext(Context);
  if (!ctx) return { openCreateRequestModal: () => {} };
  return ctx;
}

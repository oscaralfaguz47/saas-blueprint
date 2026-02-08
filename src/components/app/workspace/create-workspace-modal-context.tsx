"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { CreateWorkspaceModal } from "./create-workspace-modal";

export type WorkspaceModalMode = "create" | "settings";

type ContextValue = {
  openCreateWorkspaceModal: () => void;
  openWorkspaceSettingsModal: () => void;
};

const Context = createContext<ContextValue | null>(null);

export function CreateWorkspaceModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<WorkspaceModalMode>("create");
  const openCreateWorkspaceModal = useCallback(() => {
    setMode("create");
    setOpen(true);
  }, []);
  const openWorkspaceSettingsModal = useCallback(() => {
    setMode("settings");
    setOpen(true);
  }, []);
  const closeModal = useCallback(() => {
    setOpen(false);
    setMode("create");
  }, []);

  return (
    <Context.Provider value={{ openCreateWorkspaceModal, openWorkspaceSettingsModal }}>
      {children}
      <CreateWorkspaceModal open={open} onClose={closeModal} mode={mode} />
    </Context.Provider>
  );
}

export function useCreateWorkspaceModal(): ContextValue {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useCreateWorkspaceModal must be used within CreateWorkspaceModalProvider");
  return ctx;
}

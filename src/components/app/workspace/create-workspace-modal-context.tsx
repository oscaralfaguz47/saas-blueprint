"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { CreateWorkspaceModal } from "./create-workspace-modal";

export type WorkspaceModalMode = "create" | "settings";

type ContextValue = {
  openCreateWorkspaceModal: () => void;
  openWorkspaceSettingsModal: (options?: { showCreatedMessage?: boolean }) => void;
};

const Context = createContext<ContextValue | null>(null);

export function CreateWorkspaceModalProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<WorkspaceModalMode>("create");
  const openCreateWorkspaceModal = useCallback(() => {
    setMode("create");
    setOpen(true);
  }, []);
  const openWorkspaceSettingsModal = useCallback((options?: { showCreatedMessage?: boolean }) => {
    setMode("settings");
    setOpen(true);
  }, []);
  const closeModal = useCallback(() => {
    setOpen(false);
    setMode("create");
  }, []);
  /** Called when user closes or saves after creating a workspace; redirects to Requests and refreshes. */
  const handleCloseAfterCreate = useCallback(() => {
    router.push("/app/requests");
    router.refresh();
  }, [router]);

  return (
    <Context.Provider value={{ openCreateWorkspaceModal, openWorkspaceSettingsModal }}>
      {children}
      <CreateWorkspaceModal
        open={open}
        onClose={closeModal}
        onCloseAfterCreate={handleCloseAfterCreate}
        mode={mode}
      />
    </Context.Provider>
  );
}

export function useCreateWorkspaceModal(): ContextValue {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useCreateWorkspaceModal must be used within CreateWorkspaceModalProvider");
  return ctx;
}

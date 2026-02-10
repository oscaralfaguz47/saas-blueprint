"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { CreateWorkspaceModal } from "./create-workspace-modal";

type ContextValue = {
  openCreateWorkspaceModal: () => void;
};

const Context = createContext<ContextValue | null>(null);

export function CreateWorkspaceModalProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const openCreateWorkspaceModal = useCallback(() => {
    setOpen(true);
  }, []);
  const closeModal = useCallback(() => {
    setOpen(false);
  }, []);
  /** Called when user creates a workspace; redirects to workspace settings (General tab) and refreshes. */
  const handleCloseAfterCreate = useCallback(() => {
    router.push("/app/settings/workspace");
    router.refresh();
  }, [router]);

  return (
    <Context.Provider value={{ openCreateWorkspaceModal }}>
      {children}
      <CreateWorkspaceModal
        open={open}
        onClose={closeModal}
        onCloseAfterCreate={handleCloseAfterCreate}
      />
    </Context.Provider>
  );
}

export function useCreateWorkspaceModal(): ContextValue {
  const ctx = useContext(Context);
  if (!ctx)
    throw new Error("useCreateWorkspaceModal must be used within CreateWorkspaceModalProvider");
  return ctx;
}

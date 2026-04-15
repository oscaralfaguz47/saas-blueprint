"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCreateRequestModal } from "./create-request-modal-context";

export function NewRequestOpenModalClient() {
  const router = useRouter();
  const { openCreateRequestModal } = useCreateRequestModal();

  useEffect(() => {
    openCreateRequestModal();
    router.replace("/app/requests");
  }, [openCreateRequestModal, router]);

  return null;
}

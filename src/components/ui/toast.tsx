"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { IconX } from "./icons";

export type ToastType = "error" | "success" | "info";

export type ToastItem = {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
};

type ToastContextValue = {
  toasts: ToastItem[];
  addToast: (type: ToastType, message: string, duration?: number) => void;
  removeToast: (id: string) => void;
};

const Context = createContext<ToastContextValue | null>(null);

let toastId = 0;
function nextId() {
  return String(++toastId);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type: ToastType, message: string, duration = 5000) => {
      const id = nextId();
      setToasts((prev) => [...prev, { id, type, message, duration }]);
      if (duration > 0) {
        setTimeout(() => removeToast(id), duration);
      }
    },
    [removeToast],
  );

  const value = useMemo(
    () => ({ toasts, addToast, removeToast }),
    [toasts, addToast, removeToast],
  );

  return (
    <Context.Provider value={value}>
      {children}
      <ToastList toasts={toasts} onDismiss={removeToast} />
    </Context.Provider>
  );
}

function ToastList({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div
      className="fixed right-4 bottom-4 z-100 flex flex-col gap-2"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <Toast key={t.id} item={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const isError = item.type === "error";
  const isSuccess = item.type === "success";
  const bg = isError
    ? "bg-(--color-danger-soft) border-(--color-danger-soft)"
    : isSuccess
      ? "bg-(--color-success-soft) border-(--color-success-soft)"
      : "bg-(--bg-surface-elev) border-(--border-subtle)";
  const text = isError
    ? "text-(--color-danger)"
    : isSuccess
      ? "text-(--color-success)"
      : "text-(--text-primary)";

  return (
    <div
      className={`flex max-w-[420px] min-w-[280px] items-start gap-3 rounded-lg border px-4 py-3 shadow-lg ${bg}`}
      role="alert"
    >
      <p className={`flex-1 text-sm ${text}`}>{item.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded p-1 text-(--text-muted) hover:bg-black/5 hover:text-(--text-primary)"
        aria-label="Dismiss"
      >
        <IconX size={14} />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

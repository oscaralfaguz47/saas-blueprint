"use client";

import * as React from "react";

type TabsContextValue = {
  value: string;
  onValueChange: (value: string) => void;
};

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabs() {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error("Tabs components must be used within Tabs.");
  return ctx;
}

export type TabsProps = {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
};

export function Tabs({ value, onValueChange, children, className = "" }: TabsProps) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export type TabsListProps = {
  children: React.ReactNode;
  className?: string;
};

/**
 * Shadcn-style tab list: horizontal row of pill-style triggers.
 * Use with TabsTrigger (rounded, grey when inactive; white + shadow when active).
 */
export function TabsList({ children, className = "" }: TabsListProps) {
  return (
    <nav
      role="tablist"
      className={
        "flex flex-nowrap items-center gap-1 " +
        "overflow-x-auto scrollbar-none " +
        "border-b border-(--border-subtle) " +
        "pb-0 " +
        className
      }
    >
      {children}
    </nav>
  );
}

export type TabsTriggerProps = {
  value: string;
  children: React.ReactNode;
  className?: string;
};

/**
 * Shadcn-style tab trigger: rounded pill/card look.
 * Inactive: grey background, subtle shadow. Active: white background, connects to content panel.
 */
export function TabsTrigger({ value, children, className = "" }: TabsTriggerProps) {
  const { value: selected, onValueChange } = useTabs();
  const isActive = selected === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={() => onValueChange(value)}
      className={
        "relative flex min-h-[40px] shrink-0 cursor-pointer " +
        "items-center justify-center gap-2 " +
        "px-4 py-2.5 text-sm font-medium " +
        "transition-all duration-150 " +
        "focus-visible:outline-none " +
        "focus-visible:ring-2 " +
        "focus-visible:ring-(--color-primary) " +
        "focus-visible:ring-offset-1 " +
        (isActive
          ? "border-b-2 border-(--color-primary) " +
            "text-(--text-primary) font-semibold " +
            "bg-transparent "
          : "border-b-2 border-transparent " +
            "text-(--text-muted) " +
            "hover:text-(--text-secondary) " +
            "hover:border-(--border-strong) " +
            "bg-transparent ") +
        className
      }
    >
      {children}
    </button>
  );
}

export type TabsContentProps = {
  value: string;
  children: React.ReactNode;
  className?: string;
};

/**
 * Shadcn-style tab content: card panel that connects to the active tab (shared top edge).
 */
export function TabsContent({ value, children, className = "" }: TabsContentProps) {
  const { value: selected } = useTabs();
  if (selected !== value) return null;
  return (
    <div
      className={
        "mt-6 " +
        className
      }
    >
      {children}
    </div>
  );
}

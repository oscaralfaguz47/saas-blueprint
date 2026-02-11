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
      aria-label="Settings sections"
      className={
        "flex flex-nowrap gap-1.5 overflow-x-auto scrollbar-thin items-end " +
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
        "shrink-0 min-h-[44px] flex cursor-pointer items-center justify-center px-4 py-3 text-sm font-medium transition-all rounded-t-lg " +
        (isActive
          ? "bg-(--bg-surface) text-(--text-primary) font-semibold shadow-sm border border-(--border-subtle) border-b-0 rounded-b-none"
          : "bg-(--bg-surface-elev) text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--bg-surface-elev)/90 rounded-lg shadow-sm border border-(--border-subtle)") +
        " " +
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
        "rounded-b-lg rounded-t-none border border-t border-(--border-subtle) bg-(--bg-surface) shadow-sm -mt-px p-6 " +
        className
      }
    >
      {children}
    </div>
  );
}

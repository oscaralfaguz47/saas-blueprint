"use client";

import * as React from "react";

export type DropdownMultiSelectOption = { value: string; label: string };

type Props = {
  options: DropdownMultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  label?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
};

export function DropdownMultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Select…",
  label,
  id,
  disabled = false,
  className = "",
}: Props) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const selectedSet = React.useMemo(() => new Set(selected), [selected]);

  const toggle = (value: string) => {
    const next = selectedSet.has(value)
      ? selected.filter((s) => s !== value)
      : [...selected, value];
    onChange(next);
  };

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const displayText =
    selected.length === 0
      ? placeholder
      : selected.length === options.length
        ? "All"
        : `${selected.length} selected`;

  return (
    <div ref={containerRef} className={"relative " + className}>
      {label ? (
        <label htmlFor={id} className="block text-sm font-medium text-(--text-primary)">
          {label}
        </label>
      ) : null}
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((o) => !o)}
        className="mt-1.5 flex h-10 w-full min-w-[120px] cursor-pointer items-center justify-between rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2 text-left text-sm text-(--text-primary) focus:ring-2 focus:ring-(--color-primary) focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={selected.length === 0 ? "text-(--text-muted)" : ""}>{displayText}</span>
        <span className="ml-2 text-(--text-muted)" aria-hidden>
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute z-10 mt-1 max-h-56 w-full min-w-[160px] overflow-auto rounded-lg border border-(--border-subtle) bg-(--bg-surface) py-1 shadow-lg"
        >
          {options.map((opt) => (
            <label
              key={opt.value}
              className="flex min-h-[44px] cursor-pointer items-center gap-2 px-3 py-2 text-sm text-(--text-primary) hover:bg-(--bg-surface-elev)"
            >
              <input
                type="checkbox"
                checked={selectedSet.has(opt.value)}
                onChange={() => toggle(opt.value)}
                className="h-4 w-4 rounded border-(--border-subtle)"
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { IconCheck, IconChevronDown } from "@/components/ui/icons";

export type SearchableSelectOption = { value: string; label: string };

type Props = {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  id?: string;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
  className?: string;
};

export function SearchableSelect({
  options,
  value,
  onChange,
  id,
  placeholder = "Search…",
  disabled = false,
  "aria-label": ariaLabel,
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);
  const displayValue = selectedOption?.label ?? (value || "");

  const q = search.trim().toLowerCase();
  const filtered =
    q === ""
      ? options.slice(0, 200)
      : options.filter(
          (o) =>
            o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
        ).slice(0, 200);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setHighlightIndex(0);
    }
  }, [open]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [search]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (!el) return;
    const highlighted = el.querySelector("[data-highlighted=true]");
    highlighted?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((i) => (i + 1) % Math.max(1, filtered.length));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((i) =>
          i <= 0 ? Math.max(0, filtered.length - 1) : i - 1
        );
        return;
      }
      if (e.key === "Enter" && filtered[highlightIndex]) {
        e.preventDefault();
        onChange(filtered[highlightIndex].value);
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, filtered, highlightIndex, onChange]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        id={id}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={id ? `${id}-listbox` : undefined}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className="mt-1.5 flex h-10 w-full cursor-pointer items-center justify-between rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2.5 text-left text-sm text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary) disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <span className={value ? "" : "text-(--text-muted)"}>
          {displayValue || placeholder}
        </span>
        <IconChevronDown size={16} className="ml-2 shrink-0 text-(--text-muted)" aria-hidden />
      </button>
      {open && (
        <div
          id={id ? `${id}-listbox` : undefined}
          role="listbox"
          ref={listRef}
          className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-(--border-subtle) bg-(--bg-surface) py-1 shadow-md"
        >
          <div className="sticky top-0 border-b border-(--border-subtle) bg-(--bg-surface) p-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={placeholder}
              className="w-full rounded-md border border-(--border-subtle) bg-(--bg-main) px-2.5 py-1.5 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
              autoFocus
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-(--text-muted)">
              No matches
            </div>
          ) : (
            filtered.map((opt, i) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-highlighted={i === highlightIndex}
                  className={`flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-(--bg-surface-elev) ${
                    isSelected
                      ? "bg-(--bg-surface-elev) font-medium text-(--text-primary)"
                      : "text-(--text-primary)"
                  } ${i === highlightIndex ? "bg-(--bg-surface-elev)" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <span>{opt.label}</span>
                  {isSelected ? (
                    <IconCheck size={16} className="shrink-0 text-(--color-primary)" aria-hidden />
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

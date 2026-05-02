"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes } from "react";
import { Spinner } from "./spinner";

type ButtonLinkVariant = "primary" | "secondary";

export function ButtonLink({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: React.ReactNode;
  variant?: ButtonLinkVariant;
}) {
  const base =
    "inline-flex h-11 items-center justify-center rounded-lg px-4 text-sm font-medium transition-colors";

  const variants: Record<ButtonLinkVariant, string> = {
    primary:
      "bg-(--color-primary) text-white shadow-sm ring-1 ring-inset ring-white/20 hover:bg-(--color-primary-hover)",
    secondary:
      "border border-(--border-strong) bg-(--bg-surface) text-(--text-primary) shadow-sm hover:bg-(--bg-surface-hover)",
  };

  return (
    <Link href={href} className={`${base} ${variants[variant]}`}>
      {children}
    </Link>
  );
}

export type ButtonVariant = "primary" | "secondary" | "destructive" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "size"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg-app) " +
  "disabled:cursor-not-allowed disabled:opacity-50 disabled:pointer-events-none";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-(--color-primary) text-white shadow-sm ring-1 ring-inset ring-white/20 hover:bg-(--color-primary-hover)",
  secondary:
    "border border-(--border-strong) bg-(--bg-surface) text-(--text-primary) shadow-sm hover:bg-(--bg-surface-hover)",
  destructive:
    "bg-(--color-danger) text-white shadow-sm hover:opacity-90 focus-visible:ring-(--color-danger)",
  ghost:
    "bg-transparent text-(--text-secondary) shadow-none hover:bg-(--bg-surface-hover) hover:text-(--text-primary)",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 py-1.5 text-xs",
  md: "min-h-11 px-4 py-2 text-sm",
  lg: "min-h-12 px-5 py-2.5 text-base",
};

/**
 * Primary action button for in-app flows. Use {@link ButtonLink} for navigation.
 * Matches design tokens used by {@link ButtonLink} (primary/secondary) plus destructive/ghost.
 */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className = "",
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const isDisabled = Boolean(disabled || loading);
  const spinnerSize = size === "lg" ? "md" : "sm";

  const classes = [
    buttonBase,
    variantClasses[variant],
    sizeClasses[size],
    className.trim(),
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      {...rest}
      type={type}
      disabled={isDisabled}
      className={classes}
      aria-busy={loading || undefined}
    >
      {loading ? <Spinner size={spinnerSize} aria-hidden /> : null}
      {children}
    </button>
  );
}

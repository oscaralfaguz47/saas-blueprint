type BadgeVariant = "default" | "success" | "warning" | "destructive" | "secondary";

const variantClasses: Record<BadgeVariant, string> = {
  default: "border-(--border-subtle) bg-(--bg-surface) text-(--text-primary)",
  success: "border-(--color-success-soft) bg-(--color-success-soft) text-(--color-success)",
  warning: "border-(--color-warning-soft) bg-(--color-warning-soft) text-(--color-warning)",
  destructive: "border-(--color-danger-soft) bg-(--color-danger-soft) text-(--color-danger)",
  secondary: "border-(--border-subtle) bg-(--bg-surface-elev) text-(--text-secondary)",
};

export function Badge({
  variant = "default",
  children,
  className,
}: {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}) {
  const base = "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium";
  const v = variantClasses[variant];
  return (
    <span className={className ? `${base} ${v} ${className}` : `${base} ${v}`}>{children}</span>
  );
}

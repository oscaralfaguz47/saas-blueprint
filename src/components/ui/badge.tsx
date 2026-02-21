type BadgeVariant = "default" | "success" | "warning" | "destructive" | "secondary";

const variantClasses: Record<BadgeVariant, string> = {
  default:
    "border-(--border-subtle) bg-(--bg-surface) text-(--text-primary)",
  success:
    "border-green-500/50 bg-green-500/10 text-green-800 dark:text-green-200",
  warning:
    "border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-200",
  destructive:
    "border-(--destructive)/50 bg-(--destructive)/10 text-(--destructive)",
  secondary:
    "border-(--border-subtle) bg-(--muted) text-(--text-secondary)",
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
    <span
      className={className ? `${base} ${v} ${className}` : `${base} ${v}`}
    >
      {children}
    </span>
  );
}

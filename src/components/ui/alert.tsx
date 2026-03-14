type AlertVariant = "default" | "info" | "warning" | "destructive";

const variantClasses: Record<AlertVariant, string> = {
  default: "border-(--border-subtle) bg-(--bg-surface) text-(--text-primary)",
  info: "border-(--color-primary-soft) bg-(--color-primary-soft) text-(--color-primary)",
  warning: "border-(--color-warning-soft) bg-(--color-warning-soft) text-(--color-warning)",
  destructive: "border-(--color-danger-soft) bg-(--color-danger-soft) text-(--color-danger)",
};

export function Alert({
  variant = "default",
  title,
  description,
  children,
  className,
}: {
  variant?: AlertVariant;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const base = "rounded-lg border p-4 text-sm";
  const v = variantClasses[variant];
  return (
    <div className={className ? `${base} ${v} ${className}` : `${base} ${v}`} role="alert">
      {title ? <p className="font-medium">{title}</p> : null}
      {description ? <p className={title ? "mt-1" : ""}>{description}</p> : null}
      {children}
    </div>
  );
}

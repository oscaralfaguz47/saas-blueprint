type AlertVariant = "default" | "info" | "warning" | "destructive";

const variantClasses: Record<AlertVariant, string> = {
  default: "border-(--border-subtle) bg-(--bg-surface) text-(--text-primary)",
  info: "border-blue-500/50 bg-blue-500/10 text-blue-800 dark:text-blue-200",
  warning: "border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-200",
  destructive: "border-(--destructive)/50 bg-(--destructive)/10 text-(--destructive)",
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

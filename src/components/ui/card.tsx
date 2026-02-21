const cardRootClass =
  "rounded-xl border border-(--border-subtle) bg-(--bg-surface) overflow-hidden";

/** Composable root for CardHeader/CardContent/CardFooter. */
export function CardRoot({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className ? `${cardRootClass} ${className}` : cardRootClass}>
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        className
          ? `border-b border-(--border-subtle) px-4 py-3 ${className}`
          : "border-b border-(--border-subtle) px-4 py-3"
      }
    >
      {children}
    </div>
  );
}

export function CardContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className ? `p-4 ${className}` : "p-4"}>{children}</div>
  );
}

export function CardFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        className
          ? `border-t border-(--border-subtle) px-4 py-3 ${className}`
          : "border-t border-(--border-subtle) px-4 py-3"
      }
    >
      {children}
    </div>
  );
}

/** Simple card with title and description (existing API). */
export function Card({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className={`${cardRootClass} p-6`}>
      <h3 className="text-xl font-semibold leading-snug text-(--text-primary)">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-(--text-secondary)">
        {description}
      </p>
    </div>
  );
}

export function Separator({
  className,
  orientation = "horizontal",
}: {
  className?: string;
  orientation?: "horizontal" | "vertical";
}) {
  const base =
    orientation === "horizontal"
      ? "h-px w-full bg-(--border-subtle)"
      : "h-full w-px bg-(--border-subtle)";
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={className ? `${base} ${className}` : base}
    />
  );
}

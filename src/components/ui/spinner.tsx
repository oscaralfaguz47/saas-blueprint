/**
 * Spinner for loading states. Uses CSS animation (no extra dependencies).
 * size: "sm" for inline/menu, "md" for cards, "lg" for full-page.
 */
export function Spinner({
  size = "md",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClasses = {
    sm: "h-4 w-4 border-2",
    md: "h-8 w-8 border-2",
    lg: "h-10 w-10 border-[3px]",
  };

  return (
    <span
      role="status"
      aria-label="Loading"
      className={[
        "inline-block animate-spin rounded-full border-(--border-subtle) border-t-(--color-primary)",
        sizeClasses[size],
        className,
      ].join(" ")}
    />
  );
}

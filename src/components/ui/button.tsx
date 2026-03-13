import Link from "next/link";

type ButtonVariant = "primary" | "secondary";

export function ButtonLink({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: React.ReactNode;
  variant?: ButtonVariant;
}) {
  const base =
    "inline-flex h-11 items-center justify-center rounded-lg px-4 text-sm font-medium transition-colors";

  const variants: Record<ButtonVariant, string> = {
    primary: "bg-(--color-primary) text-white hover:bg-(--color-primary-hover)",
    secondary: "border border-(--border-subtle) text-(--text-primary) hover:bg-(--bg-surface-elev)",
  };

  return (
    <Link href={href} className={`${base} ${variants[variant]}`}>
      {children}
    </Link>
  );
}

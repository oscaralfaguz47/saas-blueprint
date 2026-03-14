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
    primary: "bg-(--color-primary) text-white shadow-sm ring-1 ring-inset ring-white/20 hover:bg-(--color-primary-hover)",
    secondary: "border border-(--border-strong) bg-(--bg-surface) text-(--text-primary) shadow-sm hover:bg-(--bg-surface-hover)",
  };

  return (
    <Link href={href} className={`${base} ${variants[variant]}`}>
      {children}
    </Link>
  );
}

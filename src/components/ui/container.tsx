export function Container({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-8 ${className ?? ""}`.trim()}>
      {children}
    </div>
  );
}

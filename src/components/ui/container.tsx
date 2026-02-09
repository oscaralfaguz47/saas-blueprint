export function Container({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-8">
      {children}
    </div>
  );
}

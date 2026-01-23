export function Card({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-6">
      <h3 className="text-xl font-semibold leading-snug text-(--text-primary)">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-(--text-secondary)">
        {description}
      </p>
    </div>
  );
}

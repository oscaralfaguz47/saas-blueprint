export default function RequestsListPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-(--text-primary)">
          Requests
        </h1>
        <p className="mt-2 text-sm text-(--text-secondary)">
          List coming next.
        </p>
      </div>

      {/* Optional KPI strip — placeholders when no data */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 py-3">
          <div className="text-quiet-uppercase">
            Open
          </div>
          <div className="mt-1 text-lg font-semibold text-(--text-primary)">—</div>
        </div>
        <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 py-3">
          <div className="text-quiet-uppercase">
            In progress
          </div>
          <div className="mt-1 text-lg font-semibold text-(--text-primary)">—</div>
        </div>
        <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 py-3">
          <div className="text-quiet-uppercase">
            Closed
          </div>
          <div className="mt-1 text-lg font-semibold text-(--text-primary)">—</div>
        </div>
        <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wider text-(--text-muted)">
            This month
          </div>
          <div className="mt-1 text-lg font-semibold text-(--text-primary)">—</div>
        </div>
      </div>
    </div>
  );
}

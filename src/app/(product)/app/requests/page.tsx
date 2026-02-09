export default function RequestsListPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">
          Requests
        </h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          List coming next.
        </p>
      </div>

      {/* Optional KPI strip — placeholders when no data */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Open
          </div>
          <div className="mt-1 text-lg font-semibold text-[var(--text-primary)]">—</div>
        </div>
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
            In progress
          </div>
          <div className="mt-1 text-lg font-semibold text-[var(--text-primary)]">—</div>
        </div>
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Closed
          </div>
          <div className="mt-1 text-lg font-semibold text-[var(--text-primary)]">—</div>
        </div>
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
            This month
          </div>
          <div className="mt-1 text-lg font-semibold text-[var(--text-primary)]">—</div>
        </div>
      </div>
    </div>
  );
}

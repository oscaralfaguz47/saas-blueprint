"use client";

import { type PlanChangeConfirmationViewModel } from "@/lib/billing/plan-change-view-model";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

type Props = {
  open: boolean;
  viewModel: PlanChangeConfirmationViewModel | null;
  isLoading: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function PlanChangeConfirmModal({
  open,
  viewModel,
  isLoading,
  onConfirm,
  onClose,
}: Props) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={viewModel?.title ?? "Confirm plan change"}
      closeDisabled={isLoading}
      allowOverlayClose={false}
      contentClassName="max-h-[90vh] overflow-hidden flex flex-col max-w-md"
    >
      {viewModel && (
        <div className="-mx-6 max-h-[calc(90vh-7rem)] overflow-y-auto overscroll-contain px-6 pb-6">
          <div className="space-y-5">
            {viewModel.helperText && (
              <p className="text-sm text-(--text-secondary)">{viewModel.helperText}</p>
            )}

            <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) divide-y divide-(--border-subtle)">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs font-medium text-(--text-muted)">Current plan</span>
                <span className="text-sm font-medium text-(--text-primary)">
                  {viewModel.currentPlan.displayName}
                </span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs font-medium text-(--text-muted)">New plan</span>
                <span className="text-sm font-medium text-(--text-primary)">
                  {viewModel.newPlan.displayName}
                </span>
              </div>
            </div>

            {viewModel.showChargedToday && (
              <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 py-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <span className="text-xs font-medium text-(--text-muted) mt-0.5">
                    {viewModel.chargedTodayLabel ?? "Charged today"}
                  </span>
                  <div className="text-right">
                    {viewModel.chargedTodayAmount ? (
                      <span className="text-lg font-semibold text-(--text-primary)">
                        {viewModel.chargedTodayAmount.formatted}
                      </span>
                    ) : (
                      <span className="text-sm font-medium text-(--text-primary)">
                        Prorated amount
                      </span>
                    )}
                  </div>
                </div>
                {viewModel.chargedTodayExplanation && (
                  <p className="text-xs text-(--text-muted)">
                    {viewModel.chargedTodayExplanation}
                  </p>
                )}
                {viewModel.showNextRenewal && viewModel.nextRenewalText && (
                  <div className="pt-1 border-t border-(--border-subtle) flex items-center justify-between">
                    <span className="text-xs font-medium text-(--text-muted)">Next renewal</span>
                    <span className="text-xs text-(--text-secondary)">
                      {viewModel.nextRenewalText}
                      {viewModel.nextRenewalDate && (
                        <span className="text-(--text-muted)"> on {viewModel.nextRenewalDate}</span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            )}

            {viewModel.showEffectiveDate && (
              <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 py-4 space-y-3">
                {viewModel.effectiveDate && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-(--text-muted)">
                      {viewModel.effectiveDateLabel ?? "Effective on"}
                    </span>
                    <span className="text-sm font-medium text-(--text-primary)">
                      {viewModel.effectiveDate}
                    </span>
                  </div>
                )}
                {viewModel.showUntilThenMessage && viewModel.untilThenMessage && (
                  <p className="text-xs text-(--text-muted)">{viewModel.untilThenMessage}</p>
                )}
                {viewModel.showAfterMessage && viewModel.afterMessage && (
                  <div className="pt-1 border-t border-(--border-subtle)">
                    <p className="text-xs text-(--text-secondary)">{viewModel.afterMessage}</p>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={onConfirm}
                disabled={isLoading}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Spinner size="sm" />
                    Loading...
                  </>
                ) : (
                  viewModel.primaryCtaLabel
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-50"
              >
                {viewModel.secondaryCtaLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}

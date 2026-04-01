                      {nextInvoicePlanLabel} plan · {formatPriceMonthly(nextInvoicePlanCents)}
                    </p>
                    {nextInvoiceOverageCents > 0 && (
                      <p className="text-sm text-(--text-secondary)">
                        Estimated overage · ${(nextInvoiceOverageCents / 100).toFixed(2)}
                      </p>
                    )}
                    <p className="border-t border-(--border-subtle) pt-2 text-base font-semibold text-(--text-primary)">
                      Estimated total · {formatPriceMonthly(nextInvoiceTotalCents)}
                    </p>
                  </>
                )}
              </CardContent>
            </CardRoot>
          )}
          {/* Payment method */}
          {(billingState.hasPaidPlan || billingState.isPastDue || billingState.isSuspended) && (
            <CardRoot className="shadow-sm border border-(--border-subtle)">
              <CardHeader className="pb-3">
                <p className="text-xs font-semibold tracking-wider text-(--text-muted) uppercase">
                  Payment method
                </p>
              </CardHeader>
              <CardContent>
                {paymentMethodLoading ? (
                  <Skeleton className="h-14 w-full max-w-sm" />
                ) : paymentMethod ? (
                  <>
                    <div className="flex items-start gap-3">
                      <CardBrandIcon brand={paymentMethod.brand} className="shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-(--text-primary)">
                          {formatCardBrand(paymentMethod.brand)} •••• {paymentMethod.last4}
                        </p>
                        <p className="mt-0.5 text-xs text-(--text-muted)">
                          Expires{" "}
                          {formatExpiry(paymentMethod.expiryMonth, paymentMethod.expiryYear)}
                        </p>
                      </div>
                    </div>
                    {nextChargeDate && (
                      <p className="mt-2 text-xs text-(--text-muted)">
                        Used for next invoice {nextChargeDate}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-(--text-muted)">No payment method on file.</p>
                )}
                <button
                  type="button"
                  onClick={handleChangePaymentMethod}
                  disabled={paymentMethodUpdateLoading}
                  className="mt-4 inline-flex h-9 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-50"
                >
                  {paymentMethodUpdateLoading ? "Loading…" : "Change payment method"}
                </button>
              </CardContent>
            </CardRoot>
          )}
        </div>
      ) : null}

      {/* Row 3: Invoices — full width */}
      {transactions.length > 0 && (
        <CardRoot className="w-full shadow-sm">
          <CardHeader>
            <p className="text-xs font-medium tracking-wide text-(--text-muted) uppercase">
              Invoices
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {transactionsLoading ? (
              <div className="p-4">
                <Skeleton className="h-20 w-full" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 border-b border-(--border-subtle) bg-(--bg-surface) shadow-[0_1px_0_0_var(--border-subtle)]">
                    <tr>
                      <th className="bg-(--bg-surface) px-4 py-3 text-left font-medium text-(--text-muted)">
                        Invoice
                      </th>
                      <th className="bg-(--bg-surface) px-4 py-3 text-left font-medium text-(--text-muted)">
                        Period
                      </th>
                      <th className="bg-(--bg-surface) px-4 py-3 text-left font-medium text-(--text-muted)">
                        Status
                      </th>
                      <th className="bg-(--bg-surface) px-4 py-3 text-right font-medium text-(--text-muted)">
                        Amount
                      </th>
                      <th className="bg-(--bg-surface) px-4 py-3 text-right font-medium text-(--text-muted)">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => {
                      const statusLower = t.status?.toLowerCase() ?? "";
                      const statusVariant =
                        statusLower === "completed"
                          ? "success"
                          : statusLower === "pending" || statusLower === "past_due"
                            ? "warning"
                            : statusLower === "failed"
                              ? "destructive"
                              : "secondary";
                      return (
                        <tr
                          key={t.id}
                          className="border-b border-(--border-subtle) transition-colors hover:bg-(--bg-surface-elev)"
                        >
                          <td className="px-4 py-3 font-medium text-(--text-primary)">
                            {t.receiptNumber ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-(--text-secondary)">
                            {formatDate(t.billedAt)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={statusVariant}>{t.status ?? "—"}</Badge>
                          </td>
                          <td className="px-4 py-3 text-right text-(--text-primary)">
                            {(t.total.cents / 100).toFixed(2)} {t.total.currency}
                          </td>
                          <td className="px-4 py-3 text-right" data-invoice-action>
                            <InvoiceRowActions
                              transaction={t}
                              onViewInvoice={() =>
                                window.open(
                                  `/api/billing/transactions/${t.id}/invoice-redirect`,
                                  "_blank",
                                )
                              }
                              onEditBilling={() => openEditBillingModal(t.id)}
                              onPaidInvoice={
                                t.providerTransactionId
                                  ? () => openPaidInvoiceCheckout(t.providerTransactionId!)
                                  : undefined
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                    {transactions.length > 0 &&
                      (transactionsHasMore || transactionsLoadingMore) && (
                        <tr ref={transactionsScrollSentinelRef}>
                          <td colSpan={5} className="px-4 py-3 text-center">
                            {transactionsLoadingMore ? (
                              <span className="inline-flex items-center gap-2 text-sm text-(--text-muted)">
                                <Spinner size="sm" />
                                Loading more…
                              </span>
                            ) : (
                              <span className="text-sm text-(--text-muted)">Scroll for more</span>
                            )}
                          </td>
                        </tr>
                      )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </CardRoot>
      )}

      {/* Edit billing details (invoice-specific) modal */}
      <Dialog
        open={editBillingTransactionId != null}
        onClose={closeEditBillingModal}
        title="Edit billing details"
        description="Update customer and address for this invoice only."
        closeDisabled={editBillingSaving}
        allowOverlayClose={!editBillingSaving}
        contentClassName="max-w-md"
      >
        <div className="space-y-4">
          {editBillingDetailsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner className="h-8 w-8" />
            </div>
          ) : editBillingDetails ? (
            <>
              <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) p-3 text-sm">
                <p className="font-medium text-(--text-primary)">Invoice summary</p>
                <p className="mt-1 text-(--text-secondary)">
                  {editBillingDetails.invoiceNumber
                    ? `Invoice ${editBillingDetails.invoiceNumber}`
                    : "Invoice"}
                  {editBillingDetails.billedAt
                    ? ` · ${formatDate(editBillingDetails.billedAt)}`
                    : ""}
                </p>
                <p className="mt-0.5 text-(--text-primary)">
                  {(editBillingDetails.totalCents / 100).toFixed(2)} {editBillingDetails.currency}
                </p>
              </div>
              {editBillingSubmitError && (
                <p className="text-sm text-(--color-danger)" role="alert">
                  {editBillingSubmitError}
                </p>
              )}
              <div className="grid gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-(--text-muted)">
                    Full name
                  </label>
                  <Input
                    value={editBillingForm.fullName}
                    onChange={(e) =>
                      setEditBillingForm((f) => ({ ...f, fullName: e.target.value }))
                    }
                    placeholder="Required"
                    maxLength={255}
                    aria-invalid={!!editBillingFieldErrors.fullName}
                    aria-describedby={
                      editBillingFieldErrors.fullName ? "edit-fullName-error" : undefined
                    }
                  />
                  {editBillingFieldErrors.fullName && (
                    <p
                      id="edit-fullName-error"
                      className="mt-1 text-xs text-(--color-danger)"
                    >
                      {editBillingFieldErrors.fullName}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-(--text-muted)">
                    Company name
                  </label>
                  <Input
                    value={editBillingForm.companyName}
                    onChange={(e) =>
                      setEditBillingForm((f) => ({ ...f, companyName: e.target.value }))
                    }
                    placeholder="Optional"
                    maxLength={255}
                    aria-invalid={!!editBillingFieldErrors.companyName}
                  />
                  {editBillingFieldErrors.companyName && (
                    <p className="mt-1 text-xs text-(--color-danger)">
                      {editBillingFieldErrors.companyName}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-(--text-muted)">
                    Tax ID
                  </label>
                  <p className="mb-1.5 text-xs text-(--text-muted)">
                    Ensure the tax identifier matches the correct format for the customer&apos;s
                    country to ensure tax is calculated accurately.{" "}
                    <a
                      href="https://www.paddle.com/help/start/set-up-paddle/what-format-should-i-use-for-my-vat-id"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-(--color-primary) underline hover:no-underline"
                    >
                      Check valid formats
                    </a>
                  </p>
                  <Input
                    value={editBillingForm.taxId}
                    onChange={(e) => setEditBillingForm((f) => ({ ...f, taxId: e.target.value }))}
                    placeholder="Optional"
                    maxLength={64}
                    aria-invalid={!!editBillingFieldErrors.taxId}
                    aria-describedby={editBillingFieldErrors.taxId ? "edit-taxId-error" : undefined}
                  />
                  {editBillingFieldErrors.taxId && (
                    <p
                      id="edit-taxId-error"
                      className="mt-1 text-xs text-(--color-danger)"
                    >
                      {editBillingFieldErrors.taxId}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-(--text-muted)">
                    First line of address
                  </label>
                  <Input
                    value={editBillingForm.addressLine1}
                    onChange={(e) =>
                      setEditBillingForm((f) => ({ ...f, addressLine1: e.target.value }))
                    }
                    placeholder="Optional"
                    maxLength={255}
                    aria-invalid={!!editBillingFieldErrors.addressLine1}
                  />
                  {editBillingFieldErrors.addressLine1 && (
                    <p className="mt-1 text-xs text-(--color-danger)">
                      {editBillingFieldErrors.addressLine1}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-(--text-muted)">
                    Second line of address
                  </label>
                  <Input
                    value={editBillingForm.addressLine2}
                    onChange={(e) =>
                      setEditBillingForm((f) => ({ ...f, addressLine2: e.target.value }))
                    }
                    placeholder="Optional"
                    maxLength={255}
                    aria-invalid={!!editBillingFieldErrors.addressLine2}
                  />
                  {editBillingFieldErrors.addressLine2 && (
                    <p className="mt-1 text-xs text-(--color-danger)">
                      {editBillingFieldErrors.addressLine2}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-(--text-muted)">City</label>
                  <Input
                    value={editBillingForm.city}
                    onChange={(e) => setEditBillingForm((f) => ({ ...f, city: e.target.value }))}
                    placeholder={editBillingDetails.city?.trim() ? undefined : "Optional"}
                    maxLength={255}
                    aria-invalid={!!editBillingFieldErrors.city}
                    disabled={!!editBillingDetails.city?.trim()}
                    readOnly={!!editBillingDetails.city?.trim()}
                    className={
                      editBillingDetails.city?.trim()
                        ? "cursor-not-allowed bg-(--muted)"
                        : undefined
                    }
                  />
                  {editBillingDetails.city?.trim() ? (
                    <p className="mt-1 text-xs text-(--text-muted)">
                      Cannot be changed for this invoice.
                    </p>
                  ) : null}
                  {editBillingFieldErrors.city && (
                    <p className="mt-1 text-xs text-(--color-danger)">
                      {editBillingFieldErrors.city}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-(--text-muted)">
                    Region / State
                  </label>
                  <Input
                    value={editBillingForm.region}
                    onChange={(e) => setEditBillingForm((f) => ({ ...f, region: e.target.value }))}
                    placeholder={editBillingDetails.region?.trim() ? undefined : "Optional"}
                    maxLength={255}
                    aria-invalid={!!editBillingFieldErrors.region}
                    disabled={!!editBillingDetails.region?.trim()}
                    readOnly={!!editBillingDetails.region?.trim()}
                    className={
                      editBillingDetails.region?.trim()
                        ? "cursor-not-allowed bg-(--muted)"
                        : undefined
                    }
                  />
                  {editBillingDetails.region?.trim() ? (
                    <p className="mt-1 text-xs text-(--text-muted)">
                      Cannot be changed for this invoice.
                    </p>
                  ) : null}
                  {editBillingFieldErrors.region && (
                    <p className="mt-1 text-xs text-(--color-danger)">
                      {editBillingFieldErrors.region}
                    </p>
                  )}
                </div>
              </div>
              <Alert variant="warning" className="text-sm font-medium">
                This invoice can only be edited once. Please review all fields before submitting.
              </Alert>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeEditBillingModal}
                  disabled={editBillingSaving}
                  className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 py-2 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitEditBilling}
                  disabled={editBillingSaving}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-(--color-primary) px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {editBillingSaving ? (
                    <>
                      <Spinner className="h-4 w-4" />
                      Saving…
                    </>
                  ) : (
                    "Save changes"
                  )}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </Dialog>

      {/* Row 4: Billing profile (half) | optional placeholder */}
      {(billingState.hasPaidPlan || transactions.length > 0) && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <BillingProfileSection />
          {/* Billing contact placeholder — reserved for future use */}
        </div>
      )}

      {/* Change plan dialog */}
      {(() => {
        const scheduledCancellation = Boolean(
          summary.cancelAtPeriodEnd && summary.pendingPlanCode === "free",
        );
        const effectiveDateStr = summary.periodEnd ? formatDate(summary.periodEnd) : "";
        return (
          <Dialog
            open={changePlanOpen}
            onClose={() => setChangePlanOpen(false)}
            title="Change plan"
            description={
              scheduledCancellation
                ? `Subscription cancellation scheduled. Your workspace will move to the Free plan${effectiveDateStr ? ` on ${effectiveDateStr}` : " at the end of your billing period"}. You can resume a paid plan before that date.`
                : summary.pendingPlanCode && summary.pendingPlanCode !== "free"
                  ? "Compare plans. You have a scheduled downgrade; you can replace it with another plan below."
                  : "Compare plans and choose what fits your workspace. Upgrades apply immediately. Downgrades take effect at the end of your billing period."
            }
            contentClassName="max-w-6xl w-full"
          >
            {/* Plan cards: horizontal scroll only on small viewports; grid on md+ so no scroll on desktop */}
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
              <div className="overflow-x-auto px-4 pt-4 pb-2 sm:px-6 md:overflow-x-visible">
                <div className="flex min-w-max gap-4 md:grid md:min-w-0 md:auto-rows-fr md:grid-cols-2 lg:grid-cols-4">
                  {IN_APP_PLAN_CATALOG.map((plan) => {
                    const isCurrent = plan.code === billingState.currentPlan;
                    const isScheduled =
                      summary.pendingPlanCode &&
                      summary.pendingPlanCode !== "free" &&
                      plan.code === summary.pendingPlanCode;
                    const isScheduledFree = scheduledCancellation && plan.code === "free";
                    const canUpgrade =
                      isUpgrade(billingState.currentPlan, plan.code) &&
                      !billingState.isPastDue &&
                      !billingState.isSuspended;
                    const canDowngrade = isDowngrade(billingState.currentPlan, plan.code);
                    const hasScheduledDowngrade =
                      summary.pendingPlanCode && summary.pendingPlanCode !== "free";
                    const isOtherLowerWithScheduled =
                      hasScheduledDowngrade && canDowngrade && !isCurrent && !isScheduled;
                    const isResumePaidPlan =
                      scheduledCancellation && plan.code !== "free" && !isCurrent;
                    const effectiveDate = summary.periodEnd ? formatDate(summary.periodEnd) : "";
                    const buttonsDisabled = scheduleLoading || checkoutLoading;

                    return (
                      <div
                        key={plan.code}
                        className={`flex min-h-0 w-64 min-w-64 shrink-0 flex-col rounded-xl border p-4 md:w-auto md:min-w-0 ${
                          plan.mostPopular
                            ? "border-(--color-primary)/50 bg-(--bg-surface-elev)"
                            : "border-(--border-subtle) bg-(--bg-surface)"
                        }`}
                      >
                        <div className="min-h-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-semibold text-(--text-primary)">{plan.name}</h3>
                            <div className="flex flex-wrap items-center justify-end gap-1.5">
                              {isCurrent && <Badge variant="secondary">Current</Badge>}
                              {(isScheduled || isScheduledFree) && (
                                <Badge variant="secondary">Scheduled</Badge>
                              )}
                              {plan.mostPopular &&
                                !isCurrent &&
                                !isScheduled &&
                                !isScheduledFree && <Badge variant="secondary">Most popular</Badge>}
                            </div>
                          </div>
                          <p className="mt-1 text-lg font-medium text-(--text-primary)">
                            {formatPriceMonthly(plan.priceMonthlyCents)}/month
                          </p>
                          {isCurrent &&
                            (hasScheduledDowngrade || scheduledCancellation) &&
                            effectiveDate && (
                              <p className="mt-1 text-xs text-(--text-muted)">
                                Current until {effectiveDate}
                              </p>
                            )}
                          {(isScheduled || isScheduledFree) && effectiveDate && (
                            <p className="mt-1 text-xs text-(--text-muted)">
                              Will become active on {effectiveDate}
                            </p>
                          )}
                          <p className="mt-2 text-xs text-(--text-muted)">{plan.bestFor}</p>
                          <ul className="mt-3 space-y-1.5 text-xs text-(--text-secondary)">
                            {plan.includes.slice(0, 5).map((item, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <span
                                  className="mt-0.5 shrink-0 text-(--color-primary)"
                                  aria-hidden
                                >
                                  ✓
                                </span>
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                          {plan.limits.length > 0 && (
                            <ul className="mt-2 space-y-1 text-xs text-(--text-muted)">
                              {plan.limits.slice(0, 3).map((item, i) => (
                                <li key={i}>{item}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div className="mt-auto shrink-0 pt-4">
                          <span
                            className="mb-4 block h-px w-full bg-(--border-subtle)"
                            aria-hidden
                          />
                          {isCurrent ? (
                            <button
                              type="button"
                              disabled
                              className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-(--border-subtle) bg-(--muted) text-sm font-medium text-(--text-muted)"
                            >
                              Current plan
                            </button>
                          ) : isScheduled ? (
                            <button
                              type="button"
                              disabled
                              className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-(--border-subtle) bg-(--muted) text-sm font-medium text-(--text-muted)"
                            >
                              Scheduled
                            </button>
                          ) : isScheduledFree ? (
                            <button
                              type="button"
                              disabled
                              className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-(--border-subtle) bg-(--muted) text-sm font-medium text-(--text-muted)"
                            >
                              Scheduled
                            </button>
                          ) : canUpgrade ? (
                            <button
                              type="button"
                              onClick={() => handleSelectPlan(plan)}
                              disabled={buttonsDisabled}
                              className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-(--color-primary) text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:opacity-50"
                            >
                              Upgrade
                            </button>
                          ) : isResumePaidPlan ? (
                            <>
                              <p className="mb-2 text-center text-xs text-(--text-muted)">
                                Replaces your scheduled cancellation.
                              </p>
                              <button
                                type="button"
                                onClick={() => handleSelectPlan(plan)}
                                disabled={buttonsDisabled}
                                title="Replaces your scheduled cancellation."
                                className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-50"
                              >
                                Resume with this plan
                              </button>
                            </>
                          ) : isOtherLowerWithScheduled ? (
                            <>
                              {effectiveDate ? (
                                <p className="mb-2 text-center text-xs text-(--text-muted)">
                                  Replaces your scheduled downgrade. Effective on {effectiveDate}.
                                </p>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => handleSelectPlan(plan)}
                                disabled={buttonsDisabled}
                                title="Replaces your scheduled downgrade."
                                className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-50"
                              >
                                Schedule instead
                              </button>
                            </>
                          ) : canDowngrade && !scheduledCancellation ? (
                            <button
                              type="button"
                              onClick={() => handleSelectPlan(plan)}
                              disabled={buttonsDisabled}
                              title="Downgrades take effect at the end of your billing period."
                              className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-50"
                            >
                              Downgrade (end of period)
                            </button>
                          ) : (
                            <span className="text-xs text-(--text-muted)">
                              {billingState.isPastDue || billingState.isSuspended
                                ? "Update payment method to change plan."
                                : "?"}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </Dialog>
        );
      })()}

      {/* Confirm plan change dialog — overlay close prevented to avoid accidental dismiss */}
      <Dialog
        open={confirmPlanOpen}
        onClose={closeConfirm}
        title={confirmTarget?.direction === "upgrade" ? "Confirm upgrade" : "Confirm change"}
        closeDisabled={scheduleLoading || checkoutLoading}
        allowOverlayClose={false}
        contentClassName="max-h-[90vh] overflow-hidden flex flex-col max-w-md"
      >
        {confirmTarget && (
          <div className="-mx-6 max-h-[calc(90vh-7rem)] overflow-y-auto overscroll-contain px-6 pb-6">
            <div className="space-y-4">
              {confirmTarget.direction === "upgrade" ? (
                <>
                  <div className="space-y-3 text-sm">
                    <div>
                      <p className="text-xs font-medium text-(--text-muted)">Current plan</p>
                      <p className="mt-0.5 font-medium text-(--text-primary)">
                        {PLAN_LABELS[
                          changePlanPreview?.currentPlanCode ?? summary?.planCode ?? "free"
                        ] ??
                          changePlanPreview?.currentPlanCode ??
                          summary?.planCode ??
                          "free"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-(--text-muted)">New plan</p>
                      <p className="mt-0.5 font-medium text-(--text-primary)">
                        {confirmTarget.plan.name}
                        {changePlanPreview?.nextPriceCents != null && (
                          <span className="font-normal text-(--text-secondary)">
                            {" "}
                            — {formatPriceMonthly(changePlanPreview.nextPriceCents)}/month
                          </span>
                        )}
                      </p>
                    </div>
                    {changePlanPreview?.effectiveAt === "immediate" &&
                      changePlanPreview?.nextPriceCents != null && (
                        <div>
                          <p className="text-xs font-medium text-(--text-muted)">Due now</p>
                          <p className="mt-0.5 text-(--text-primary)">
                            {formatPriceMonthly(changePlanPreview.nextPriceCents)} (prorated)
                          </p>
                        </div>
                      )}
                    {changePlanPreview?.effectiveAt === "next_period" &&
                      changePlanPreview?.effectiveFromDate && (
                        <p className="text-(--text-muted)">
                          Effective {formatDate(changePlanPreview.effectiveFromDate)}.
                        </p>
                      )}
                    <p className="text-(--text-muted)">
                      {changePlanPreview?.requiresCheckout
                        ? "You'll enter your payment details in the next step."
                        : changePlanPreview?.effectiveAt === "immediate"
                          ? "Billing cycle remains the same. Your plan will update after payment is confirmed."
                          : "Your new amount will be charged at the end of the current billing cycle."}
                    </p>
                    {paymentMethod && !changePlanPreview?.requiresCheckout && (
                      <div>
                        <p className="text-xs font-medium text-(--text-muted)">Payment method</p>
                        <p className="mt-0.5 text-(--text-primary)">
                          {formatCardBrand(paymentMethod.brand)} •••• {paymentMethod.last4}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleConfirmUpgrade}
                      disabled={checkoutLoading}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:opacity-50"
                    >
                      {checkoutLoading ? (
                        <>
                          <Spinner size="sm" />
                          Preparing…
                        </>
                      ) : (
                        `Upgrade to ${confirmTarget.plan.name}`
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={closeConfirm}
                      disabled={checkoutLoading}
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* REMOVED: old Activate plan form (EPIC 4) */}
                  <p className="text-sm text-(--text-primary)">
                    You are downgrading to {confirmTarget.plan.name}. Downgrades take effect at the
                    end of the current billing period.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleConfirmDowngrade}
                      disabled={scheduleLoading}
                      className="inline-flex h-9 items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:opacity-50"
                    >
                      {scheduleLoading ? "Loading…" : "Schedule downgrade"}
                    </button>
                    <button
                      type="button"
                      onClick={closeConfirm}
                      disabled={scheduleLoading}
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </Dialog>

      {/* Payment declined — UI only: layout, spacing, amber accent. No logic/handler changes. */}
      <Dialog
        open={paymentDeclinedModalOpen}
        onClose={closePaymentDeclinedModal}
        title={
          <span className="inline-flex items-center gap-2">
            <IconAlertCircle
              size={20}
              className="shrink-0 text-amber-600 dark:text-amber-500"
              aria-hidden
            />
            <span>Payment declined</span>
          </span>
        }
        contentClassName="max-w-md border-l-4 border-amber-500"
      >
        <div className="flex flex-col gap-5">
          {/* Amber alert banner — presentational only */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-medium">
              Payment could not be processed. Update your payment method to continue.
            </p>
          </div>

          {/* Context: card brand + last4 emphasized */}
          <p className="text-sm text-(--text-primary)">
            {paymentMethod ? (
              <>
                Your{" "}
                <span className="font-medium text-(--text-primary)">
                  {formatCardBrand(paymentMethod.brand)} •••• {paymentMethod.last4}
                </span>{" "}
                was declined while attempting to upgrade your workspace.
              </>
            ) : (
              <>Your card was declined while attempting to upgrade your workspace.</>
            )}
          </p>

          {/* Upgrade plan — existing data, neutral info card */}
          {paymentDeclinedPlanCode && (
            <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-4 py-3">
              <p className="text-xs font-medium tracking-wide text-(--text-muted) uppercase">
                Upgrade plan
              </p>
              <p className="mt-1.5 text-sm font-semibold text-(--text-primary)">
                {PLAN_LABELS[paymentDeclinedPlanCode] ?? paymentDeclinedPlanCode} —{" "}
                {(() => {
                  const plan = IN_APP_PLAN_CATALOG.find((p) => p.code === paymentDeclinedPlanCode);
                  return plan ? formatPriceMonthly(plan.priceMonthlyCents) + "/month" : "";
                })()}
              </p>
            </div>
          )}

          {/* Possible reasons — neutral tone, clean spacing */}
          <div>
            <p className="text-xs font-medium text-(--text-muted)">Possible reasons</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm leading-relaxed text-(--text-secondary)">
              <li>Insufficient funds</li>
              <li>Card expired</li>
              <li>Bank blocked the transaction</li>
            </ul>
          </div>

          {/* Primary instruction */}
          <p className="text-sm font-medium text-(--text-primary)">
            Please update your payment method to continue.
          </p>

          {/* Reassurance — smaller, muted */}
          <p className="text-xs text-(--text-muted)">
            Your upgrade will resume automatically after updating your payment method.
          </p>

          {/* Buttons: same handlers, no logic change. Spacing and visual hierarchy only. */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handlePaymentDeclinedUpdateMethod}
              disabled={paymentMethodUpdateLoading}
              className="inline-flex h-9 min-w-36 items-center justify-center gap-2 rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover) focus:ring-2 focus:ring-(--color-primary) focus:ring-offset-2 focus:outline-none disabled:opacity-50"
            >
              {paymentMethodUpdateLoading ? (
                <>
                  <Spinner size="sm" />
                  Opening…
                </>
              ) : (
                "Update payment method"
              )}
            </button>
            <button
              type="button"
              onClick={closePaymentDeclinedModal}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) focus:ring-2 focus:ring-(--border-subtle) focus:ring-offset-2 focus:outline-none"
            >
              Cancel
            </button>
          </div>
        </div>
      </Dialog>
      </div>
    </>
  );
}
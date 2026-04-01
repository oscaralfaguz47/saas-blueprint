      summary.subscriptionStatus.toUpperCase() === "PAST_DUE" ||
      summary.subscriptionStatus.toUpperCase() === "SUSPENDED");

  useEffect(() => {
    if (!shouldShowPaymentMethod) return;
    fetchPaymentMethod();
  }, [shouldShowPaymentMethod, fetchPaymentMethod]);

  useEffect(() => {
    if (billingParam !== "canceled") {
      canceledToastShownRef.current = false;
      return;
    }
    if (canceledToastShownRef.current) return;
    canceledToastShownRef.current = true;
    toast.addToast("info", "Checkout canceled.");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("billing");
    const qs = params.toString();
    router.replace(pathname + (qs ? `?${qs}` : ""), { scroll: false });
  }, [billingParam, pathname, router, searchParams, toast]);

  useEffect(() => {
    if (billingParam !== "updated" || postCheckoutPollStartedRef.current) return;
    postCheckoutPollStartedRef.current = true;

    const retryPlan = ((): PlanCode | null => {
      try {
        const stored = sessionStorage.getItem("billing:retryUpgradePlan");
        if (stored === "starter" || stored === "pro" || stored === "enterprise")
          return stored as PlanCode;
      } catch {
        // ignore
      }
      return null;
    })();

    if (retryPlan) {
      (async () => {
        setLoading(true);
        try {
          const res = await apiFetch("/api/billing/change-plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetPlanCode: retryPlan, effective: "immediate" }),
            showToastOnError: true,
          });
          try {
            sessionStorage.removeItem("billing:retryUpgradePlan");
          } catch {
            // ignore
          }
          if (res.ok) {
            const planLabel = PLAN_LABELS[retryPlan] ?? retryPlan;
            toastRef.current.addToast("success", `Plan updated to ${planLabel}.`);
            await refetchBillingState(true);
            router.replace("/app/settings/workspace?tab=billing", { scroll: false });
          } else {
            const json = await res.json().catch(() => ({}));
            const msg =
              (json as { message?: string })?.message ??
              "Upgrade could not be applied. Please try again.";
            toastRef.current.addToast("error", msg);
            router.replace("/app/settings/workspace?tab=billing", { scroll: false });
          }
        } catch {
          toastRef.current.addToast("error", "Something went wrong. Please try again.");
          router.replace("/app/settings/workspace?tab=billing", { scroll: false });
        } finally {
          setLoading(false);
          postCheckoutPollStartedRef.current = false;
        }
      })();
      return;
    }

    const expectedPlan = (): PlanCode | null => {
      try {
        const prev = sessionStorage.getItem("billing:postCheckoutPlan");
        if (prev === "starter" || prev === "pro") return prev;
      } catch {
        // ignore
      }
      return null;
    };
    const targetPlan = expectedPlan();

    const isResolved = (data: BillingSummary | null): boolean => {
      if (!data) return false;
      const plan = (data.planCode.toLowerCase() || "free") as PlanCode;
      const status = data.subscriptionStatus.toUpperCase();
      if (targetPlan && plan === targetPlan && status === "ACTIVE") return true;
      if (
        !targetPlan &&
        (plan === "starter" || plan === "pro" || plan === "enterprise") &&
        status === "ACTIVE"
      )
        return true;
      return false;
    };

    setPostCheckoutState("polling");
    setLoading(true);
    pollAttemptsRef.current = 0;

    const callReconcile = async () => {
      try {
        await apiFetch("/api/billing/paddle/reconcile", {
          method: "POST",
          showToastOnError: false,
        });
      } catch {
        // ignore
      }
    };

    let mounted = true;
    const poll = async () => {
      await callReconcile();
      const data = await refetchBillingState(true);
      if (!mounted) return;
      setLoading(false);
      pollAttemptsRef.current += 1;
      if (data && isResolved(data)) {
        setPostCheckoutState("resolved");
        const planLabel = PLAN_LABELS[data.planCode] ?? data.planCode;
        toastRef.current.addToast("success", `Plan updated to ${planLabel}.`);
        try {
          sessionStorage.removeItem("billing:postCheckoutPlan");
        } catch {
          // ignore
        }
        postCheckoutGotDataRef.current = true;
        router.replace("/app/settings/workspace?tab=billing", { scroll: false });
        return;
      }
      if (pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
        setPostCheckoutState("timeout");
        setLoading(false);
        return;
      }
      setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();
    return () => {
      mounted = false;
    };
  }, [billingParam, apiFetch, router, refetchBillingState]);

  // When summary already shows paid+active while polling (e.g. webhook beat us), transition to resolved so the banner hides
  useEffect(() => {
    if (billingParam !== "updated" || postCheckoutState !== "polling" || !summary) return;
    const plan = (summary.planCode?.toLowerCase() || "free") as PlanCode;
    const status = summary.subscriptionStatus?.toUpperCase() ?? "";
    if ((plan === "starter" || plan === "pro" || plan === "enterprise") && status === "ACTIVE") {
      setPostCheckoutState("resolved");
      const planLabel = PLAN_LABELS[summary.planCode] ?? summary.planCode;
      toastRef.current.addToast("success", `Plan updated to ${planLabel}.`);
      try {
        sessionStorage.removeItem("billing:postCheckoutPlan");
      } catch {
        // ignore
      }
      postCheckoutGotDataRef.current = true;
      router.replace("/app/settings/workspace?tab=billing", { scroll: false });
    }
  }, [billingParam, postCheckoutState, summary, router]);

  const handleOpenChangePlan = useCallback(() => {
    setChangePlanOpen(true);
  }, []);

  const handleChangePaymentMethod = useCallback(async () => {
    setPaymentMethodUpdateLoading(true);
    try {
      const res = await apiFetch("/api/billing/paddle/update-payment-method-transaction", {
        method: "POST",
        showToastOnError: true,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const transactionId = (json.data as { transactionId?: string })?.transactionId;
      if (!transactionId) {
        toast.addToast("error", "Could not open payment method update. Please try again.");
        return;
      }
      const Paddle =
        typeof window !== "undefined"
          ? (
              window as {
                Paddle?: {
                  Checkout?: {
                    open: (opts: {
                      transactionId: string;
                      settings?: { displayMode: string };
                    }) => void;
                  };
                };
              }
            ).Paddle
          : undefined;
      if (Paddle?.Checkout?.open) {
        applyPaddleCheckoutOverlayStyles();
        Paddle.Checkout.open({
          transactionId,
          settings: { displayMode: "overlay" },
        });
      } else {
        toast.addToast("error", "Payment window could not open. Refresh the page and try again.");
      }
    } finally {
      setPaymentMethodUpdateLoading(false);
    }
  }, [toast]);

  const openPaidInvoiceCheckout = useCallback(
    async (providerTransactionId: string) => {
      const Paddle =
        typeof window !== "undefined"
          ? (
              window as {
                Paddle?: {
                  Checkout?: {
                    open: (opts: {
                      transactionId: string;
                      settings?: { displayMode: string };
                    }) => void;
                  };
                };
              }
            ).Paddle
          : undefined;
      if (Paddle?.Checkout?.open) {
        applyPaddleCheckoutOverlayStyles();
        Paddle.Checkout.open({
          transactionId: providerTransactionId,
          settings: { displayMode: "overlay" },
        });
      } else {
        toast.addToast("error", "Payment window could not open. Refresh the page and try again.");
      }
    },
    [toast],
  );

  const handleSelectPlan = useCallback(
    async (plan: InAppPlanItem) => {
      const current = billingState.currentPlan;
      if (plan.code === current) return;
      if (isUpgrade(current, plan.code)) {
        setChangePlanOpen(false);
        setConfirmTarget({ plan, direction: "upgrade" });
        try {
          const res = await apiFetch(
            `/api/billing/change-plan/preview?targetPlanCode=${encodeURIComponent(plan.code)}`,
            { showToastOnError: false },
          );
          if (!res.ok) {
            toast.addToast("error", "Could not load plan preview.");
            return;
          }
          const json = await res.json().catch(() => ({}));
          const data = json.data as ChangePlanPreview | undefined;
          if (data) {
            setChangePlanPreview(data);
            setConfirmPlanOpen(true);
          }
        } catch {
          toast.addToast("error", "Could not load plan preview.");
        }
      } else if (isDowngrade(current, plan.code)) {
        setConfirmTarget({ plan, direction: "downgrade" });
        setChangePlanOpen(false);
        setConfirmPlanOpen(true);
      }
    },
    [billingState.currentPlan, apiFetch, toast],
  );

  const handleConfirmUpgrade = useCallback(async () => {
    if (!confirmTarget || confirmTarget.direction !== "upgrade") return;
    setCheckoutLoading(true);
    try {
      const res = await apiFetch("/api/billing/change-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetPlanCode: confirmTarget.plan.code,
          effective: "immediate",
        }),
        showToastOnError: true,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const details = (json as { details?: { code?: string } })?.details;
        if (details?.code === "PAYMENT_DECLINED") {
          try {
            sessionStorage.setItem("billing:retryUpgradePlan", confirmTarget.plan.code);
          } catch {
            // ignore
          }
          setConfirmPlanOpen(false);
          setConfirmTarget(null);
          setChangePlanPreview(null);
          setPaymentDeclinedPlanCode(confirmTarget.plan.code);
          setPaymentDeclinedModalOpen(true);
        }
        return;
      }
      const data = json.data as {
        mode: string;
        effective?: string;
        transactionId?: string;
        environment?: string;
      };
      setConfirmPlanOpen(false);
      setConfirmTarget(null);
      setChangePlanPreview(null);
      if (data.mode === "checkout" && data.transactionId) {
        try {
          sessionStorage.setItem("billing:postCheckoutPlan", confirmTarget.plan.code);
        } catch {
          // ignore
        }
        const Paddle =
          typeof window !== "undefined"
            ? (
                window as {
                  Paddle?: {
                    Checkout?: {
                      open: (opts: {
                        transactionId: string;
                        settings?: { displayMode: string };
                      }) => void;
                    };
                  };
                }
              ).Paddle
            : undefined;
        if (Paddle?.Checkout?.open) {
          applyPaddleCheckoutOverlayStyles();
          Paddle.Checkout.open({
            transactionId: data.transactionId,
            settings: { displayMode: "overlay" },
          });
        } else {
          toast.addToast("error", "Payment window could not open. Refresh the page and try again.");
        }
      } else {
        if (data.effective === "immediate") {
          toast.addToast(
            "success",
            "Upgrade in progress. Your plan will update after payment is confirmed.",
          );
        } else {
          toast.addToast(
            "success",
            `Plan change to ${confirmTarget.plan.name} scheduled for next billing cycle.`,
          );
        }
        await fetchSummary();
      }
    } finally {
      setCheckoutLoading(false);
    }
  }, [confirmTarget, apiFetch, toast, fetchSummary, session?.user?.email]);

  const handleConfirmDowngrade = useCallback(async () => {
    if (!confirmTarget || confirmTarget.direction !== "downgrade") return;
    setScheduleLoading(true);
    try {
      const effective = confirmTarget.plan.code === "free" ? "next_period" : "next_period";
      const res = await apiFetch("/api/billing/change-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetPlanCode: confirmTarget.plan.code,
          effective,
        }),
        showToastOnError: true,
      });
      if (!res.ok) return;
      setConfirmPlanOpen(false);
      setConfirmTarget(null);
      toast.addToast(
        "success",
        confirmTarget.plan.code === "free" ? "Downgrade scheduled." : "Plan change scheduled.",
      );
      await fetchSummary();
    } finally {
      setScheduleLoading(false);
    }
  }, [confirmTarget, apiFetch, toast, fetchSummary]);

  const closeConfirm = useCallback(() => {
    setConfirmPlanOpen(false);
    setConfirmTarget(null);
    setChangePlanPreview(null);
  }, []);

  const closePaymentDeclinedModal = useCallback(() => {
    setPaymentDeclinedModalOpen(false);
    setPaymentDeclinedPlanCode(null);
    try {
      sessionStorage.removeItem("billing:retryUpgradePlan");
    } catch {
      // ignore
    }
  }, []);

  const handlePaymentDeclinedUpdateMethod = useCallback(() => {
    setPaymentDeclinedModalOpen(false);
    handleChangePaymentMethod();
  }, [handleChangePaymentMethod]);

  const handleClearScheduledChange = useCallback(async () => {
    setClearScheduledChangeLoading(true);
    try {
      const res = await apiFetch("/api/billing/clear-scheduled-change", {
        method: "POST",
        showToastOnError: true,
      });
      if (!res.ok) return;
      const json = await res.json().catch(() => ({}));
      const data = json.data as { cleared?: boolean };
      if (data.cleared) {
        toast.addToast("success", "Scheduled change cleared. Your current plan will continue.");
        setChangePlanOpen(false);
        await fetchSummary();
      }
    } finally {
      setClearScheduledChangeLoading(false);
    }
  }, [apiFetch, toast, fetchSummary]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-(--text-primary)">Billing overview</h2>
          <p className="mt-1 text-sm text-(--text-secondary)">
            Manage your plan, invoices, and payment methods.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <CardRoot className="shadow-sm">
            <CardHeader>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-3 h-6 w-24" />
              <Skeleton className="mt-2 h-4 w-40" />
            </CardHeader>
            <CardFooter>
              <Skeleton className="h-9 w-28" />
            </CardFooter>
          </CardRoot>
          <CardRoot className="shadow-sm">
            <CardHeader>
              <Skeleton className="h-4 w-20" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="mt-2 h-2.5 w-full" />
            </CardContent>
          </CardRoot>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-(--text-primary)">Billing overview</h2>
          <p className="mt-1 text-sm text-(--text-secondary)">
            Manage your plan, invoices, and payment methods.
          </p>
        </div>
        <Alert variant="destructive" title="Error" description={error} />
        <button
          type="button"
          onClick={() => fetchSummary()}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev)"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-(--text-primary)">Billing overview</h2>
          <p className="mt-1 text-sm text-(--text-secondary)">
            Manage your plan, invoices, and payment methods.
          </p>
        </div>
        <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-5 shadow-sm">
          <p className="text-sm text-(--text-muted)">
            No billing data available. Create or select a workspace with a plan to see usage.
          </p>
        </div>
      </div>
    );
  }

  const allowance = summary.included + summary.rolloverAvailable;
  const usagePct = allowance > 0 ? Math.min(100, (summary.used / allowance) * 100) : 0;
  const planLabel = PLAN_LABELS[summary.planCode] ?? summary.planCode;
  const primaryCtaLabel =
    billingState.isPastDue || billingState.isSuspended ? "Update payment method" : "Change plan";
  const showChangePlan = !billingState.isPastDue && !billingState.isSuspended;

  const nextChargeDate = summary?.periodEnd ? formatDate(summary.periodEnd) : null;
  const currentPlanItem = IN_APP_PLAN_CATALOG.find((p) => p.code === billingState.currentPlan);

  // Next invoice reflects scheduled downgrade or cancellation (not current plan when a change is scheduled)
  const isScheduledCancelToFree =
    summary?.pendingChangeType === "cancel_to_free_end_of_period" ||
    (Boolean(summary?.cancelAtPeriodEnd) &&
      (summary?.pendingPlanCode === "free" || summary?.pendingPlanCode == null));
  const isScheduledDowngradeToPaid =
    summary?.pendingChangeType === "downgrade_end_of_period" &&
    summary?.pendingPlanCode &&
    summary.pendingPlanCode !== "free";

  let nextInvoicePlanLabel = planLabel;
  let nextInvoicePlanCents = currentPlanItem?.priceMonthlyCents ?? 0;
  if (isScheduledCancelToFree) {
    nextInvoicePlanLabel = "Free";
    nextInvoicePlanCents = 0;
  } else if (isScheduledDowngradeToPaid && summary?.pendingPlanCode) {
    const targetPlanItem = IN_APP_PLAN_CATALOG.find((p) => p.code === summary.pendingPlanCode);
    nextInvoicePlanLabel = PLAN_LABELS[summary.pendingPlanCode] ?? summary.pendingPlanCode;
    nextInvoicePlanCents = targetPlanItem?.priceMonthlyCents ?? 0;
  }

  const nextInvoiceOverageCents = isScheduledCancelToFree ? 0 : (summary?.overageEstimate ?? 0);
  const nextInvoiceTotalCents = nextInvoicePlanCents + nextInvoiceOverageCents;

  return (
    <>
      <div className="space-y-6">
        {clientToken && (
          <Script
            src={PADDLE_SCRIPT_URL}
            strategy="afterInteractive"
            onLoad={handlePaddleScriptLoad}
          />
        )}
        <div>
        <h2 className="text-lg font-semibold text-(--text-primary)">Billing overview</h2>
        <p className="mt-1 text-sm text-(--text-secondary)">
          Manage your plan, invoices, and payment methods.
        </p>
      </div>

      {/* Post-checkout: setting up account (EPIC 4 n8n-style) */}
      {postCheckoutState === "polling" && (
        <Alert
          variant="info"
          title="Setting up account?"
          description="We're confirming your plan with the payment provider. This usually takes a few seconds."
        />
      )}
      {postCheckoutState === "timeout" && (
        <Alert variant="warning" title="Still processing your payment">
          <p className="mt-1">
            We&apos;re still processing your payment. Refresh in a moment to see the latest status.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setPostCheckoutState("idle");
                refetchBillingState();
              }}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm font-medium hover:bg-(--bg-surface-elev)"
            >
              Refresh
            </button>
          </div>
        </Alert>
      )}

      {/* Status banners: scheduled downgrade or cancellation */}
      {summary.pendingChangeType === "cancel_to_free_end_of_period" && (
        <Alert
          variant="info"
          title="Cancellation scheduled"
          description={`You'll move to Free on ${formatDate(summary.entitlementEffectiveUntil ?? summary.periodEnd)}. You can resume a paid plan whenever you want.`}
        >
          <button
            type="button"
            onClick={handleClearScheduledChange}
            disabled={clearScheduledChangeLoading}
            className="mt-2 inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm font-medium hover:bg-(--bg-surface-elev) disabled:opacity-50"
          >
            {clearScheduledChangeLoading ? (
              <>
                <Spinner size="sm" />
                Updating…
              </>
            ) : (
              "Resume my current plan"
            )}
          </button>
        </Alert>
      )}
      {summary.pendingChangeType === "downgrade_end_of_period" && summary.pendingPlanCode && (
        <Alert
          variant="info"
          title="Downgrade scheduled"
          description={`Downgrade scheduled to ${PLAN_LABELS[summary.pendingPlanCode] ?? summary.pendingPlanCode} on ${formatDate(summary.entitlementEffectiveUntil ?? summary.periodEnd)}. You'll keep ${PLAN_LABELS[summary.planCode] ?? summary.planCode} until then.`}
        >
          <button
            type="button"
            onClick={handleClearScheduledChange}
            disabled={clearScheduledChangeLoading}
            className="mt-2 inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm font-medium hover:bg-(--bg-surface-elev) disabled:opacity-50"
          >
            {clearScheduledChangeLoading ? (
              <>
                <Spinner size="sm" />
                Updating…
              </>
            ) : (
              `Cancel schedule downgrade and keep the ${PLAN_LABELS[summary.planCode] ?? summary.planCode} plan`
            )}
          </button>
        </Alert>
      )}
      {summary.paymentStatus === "past_due" && (
        <Alert
          variant="warning"
          title="Payment failed"
          description={
            summary.graceEndsAt
              ? `We couldn't process your renewal payment. Update your payment method within 7 days to avoid interruption. Grace period ends on ${formatDate(summary.graceEndsAt)}.`
              : "We couldn't process your renewal payment. Update your payment method within 7 days to avoid interruption."
          }
        >
          <button
            type="button"
            onClick={handleChangePaymentMethod}
            disabled={paymentMethodUpdateLoading}
            className="mt-2 inline-flex h-9 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm font-medium hover:bg-(--bg-surface-elev) disabled:opacity-50"
          >
            {paymentMethodUpdateLoading ? "Loading…" : "Change payment method"}
          </button>
        </Alert>
      )}
      {billingState.isPastDue && summary.paymentStatus !== "past_due" && (
        <Alert
          variant="warning"
          title="Payment issue"
          description="Your subscription is past due. Update your payment method to avoid service interruption."
        >
          <button
            type="button"
            onClick={handleChangePaymentMethod}
            disabled={paymentMethodUpdateLoading}
            className="mt-2 inline-flex h-9 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm font-medium hover:bg-(--bg-surface-elev) disabled:opacity-50"
          >
            {paymentMethodUpdateLoading ? "Loading…" : "Update payment method"}
          </button>
        </Alert>
      )}
      {billingState.isInGrace &&
        summary.graceUntil &&
        !billingState.isPastDue &&
        summary.paymentStatus !== "past_due" && (
          <Alert
            variant="warning"
            description={`Grace period until ${formatDate(summary.graceUntil)}.`}
          />
        )}
      {billingState.isSuspended && (
        <Alert
          variant="destructive"
          title="Suspended"
          description="Your subscription is suspended. Resolve billing to restore access."
        >
          <button
            type="button"
            onClick={handleChangePaymentMethod}
            disabled={paymentMethodUpdateLoading}
            className="mt-2 inline-flex h-9 items-center justify-center rounded-lg border border-(--border-subtle) px-3 text-sm font-medium disabled:opacity-50"
          >
            {paymentMethodUpdateLoading ? "Loading…" : "Update payment method"}
          </button>
        </Alert>
      )}
      {billingState.isCanceled && (
        <Alert
          variant="info"
          title="Canceled"
          description={
            summary.periodEnd
              ? `Access until ${formatDate(summary.periodEnd)}. Reactivate by changing plan.`
              : "Reactivate by changing plan."
          }
        />
      )}

      {/* Row 1: Plan & Subscription | Usage */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Plan & Subscription */}
        <CardRoot className="relative overflow-hidden border border-(--border-strong) bg-(--bg-surface-elev) shadow-sm">
          <CardHeader className="pb-4">
            <p className="text-xs font-semibold tracking-wider text-(--text-muted) uppercase">
              Plan &amp; subscription
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="text-2xl font-bold tracking-tight text-(--text-primary)">{planLabel} plan</span>
              <Badge
                variant={
                  billingState.isCancelingAtPeriodEnd &&
                  (summary.pendingPlanCode === "free" || !summary.pendingPlanCode)
                    ? "secondary"
                    : statusBadgeVariant(summary.subscriptionStatus)
                }
              >
                {statusBadgeLabel(
                  summary.subscriptionStatus,
                  summary.cancelAtPeriodEnd,
                  summary.pendingPlanCode,
                  summary.periodEnd,
                  summary.pendingChangeType,
                )}
              </Badge>
            </div>
            {billingState.hasPaidPlan &&
              currentPlanItem &&
              currentPlanItem.priceMonthlyCents > 0 && (
                <p className="mt-2 text-base font-medium text-(--text-primary)">
                  {formatPriceMonthly(currentPlanItem.priceMonthlyCents)} / month
                </p>
              )}
            {nextChargeDate && billingState.hasPaidPlan && (
              <p className="mt-1 text-sm text-(--text-muted)">Next charge · {nextChargeDate}</p>
            )}
            <p className="mt-3 text-sm text-(--text-secondary)">
              Usage this period · {summary.used} / {allowance > 0 ? allowance : summary.included}{" "}
              requests
              {summary.rolloverAvailable > 0 ? ` (${summary.rolloverAvailable} rollover)` : ""}
            </p>
            {summary.pendingPlanCode && summary.pendingPlanCode !== "free" && (
              <p className="mt-2 text-xs text-(--text-muted)">
                Scheduled to downgrade to{" "}
                {PLAN_LABELS[summary.pendingPlanCode] ?? summary.pendingPlanCode} on{" "}
                {formatDate(summary.periodEnd)}.
              </p>
            )}
          </CardHeader>
          <CardFooter className="flex flex-wrap items-center gap-2 border-t border-(--border-strong) bg-[color-mix(in_srgb,var(--color-bg-surface-elev)_50%,transparent)] pt-3">
            {showChangePlan && (
              <button
                type="button"
                onClick={handleOpenChangePlan}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white shadow-sm ring-1 ring-inset ring-white/20 hover:bg-(--color-primary-hover)"
              >
                Change plan
              </button>
            )}
          </CardFooter>
        </CardRoot>

        {/* Usage */}
        <CardRoot className="shadow-sm">
          <CardHeader className="pb-3">
            <p className="text-xs font-semibold tracking-wider text-(--text-muted) uppercase">Usage this month</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-(--text-secondary)">Requests used</p>
              <p className="mt-1 text-3xl font-bold tracking-tight text-(--text-primary)">
                {summary.used} / {allowance > 0 ? allowance : summary.included} requests
              </p>
            </div>
            <div
              className="h-2.5 w-full overflow-hidden rounded-full bg-(--border-subtle)"
              role="progressbar"
              aria-valuenow={usagePct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={`h-full rounded-full transition-[width] ${
                  summary.threshold100
                    ? "bg-(--destructive)"
                    : summary.threshold80
                      ? "bg-amber-500"
                      : "bg-(--color-primary)"
                }`}
                style={{ width: `${usagePct}%` }}
              />
            </div>
            {nextChargeDate && (
              <p className="text-xs text-(--text-muted)">Resets {nextChargeDate}</p>
            )}
            {summary.threshold80 && !summary.threshold100 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                You&apos;ve used 80% or more of your request allowance.
              </p>
            )}
            {summary.threshold100 && (
              <p className="text-xs text-(--destructive)">
                You&apos;ve reached your request allowance for this period.
              </p>
            )}
            {summary.overageEstimate > 0 && (
              <p className="text-xs text-(--text-muted)">
                Overage estimate: ${(summary.overageEstimate / 100).toFixed(2)}
                {summary.overageCapReached && " (cap reached)"}
              </p>
            )}
          </CardContent>
        </CardRoot>
      </div>

      {/* Row 2: Next Invoice | Payment Method — only when at least one is relevant */}
      {(billingState.hasPaidPlan && nextChargeDate) ||
      billingState.hasPaidPlan ||
      billingState.isPastDue ||
      billingState.isSuspended ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Next Invoice — reflects scheduled downgrade or cancellation; no charge when moving to Free */}
          {billingState.hasPaidPlan && nextChargeDate && (
            <CardRoot className="shadow-sm border border-(--border-subtle)">
              <CardHeader className="pb-3">
                <p className="text-xs font-semibold tracking-wider text-(--text-muted) uppercase">
                  Next invoice
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {isScheduledCancelToFree ? (
                  <>
                    <p className="text-sm font-medium text-(--text-primary)">No upcoming invoice</p>
                    <p className="text-sm text-(--text-secondary)">
                      You&apos;re moving to Free on {nextChargeDate}. No charge after that.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-(--text-primary)">{nextChargeDate}</p>
                    <p className="text-sm text-(--text-secondary)">

import {
  type PlanCode,
  getPlanFromCatalog,
  isUpgrade,
  isDowngrade,
} from "@/lib/billing/plan-catalog";

export type PlanChangeModalVariant =
  | "upgrade_immediate_full_charge"
  | "upgrade_immediate_prorated_charge"
  | "billing_change_immediate_full_charge"
  | "billing_change_immediate_prorated_charge"
  | "downgrade_end_of_period"
  | "cancel_to_free_end_of_period";

export type PlanDescriptor = {
  code: PlanCode;
  name: string;
  billingInterval: "monthly" | "annual";
  displayName: string;
};

export type MoneyDisplay = {
  amount: number;
  currency: string;
  formatted: string;
};

export type BreakdownRow = {
  label: string;
  value: string;
};

export type PlanChangeConfirmationViewModel = {
  variant: PlanChangeModalVariant;
  title: string;
  helperText?: string;

  currentPlan: PlanDescriptor;
  newPlan: PlanDescriptor;

  showChargedToday: boolean;
  chargedTodayLabel?: string;
  chargedTodayAmount?: MoneyDisplay;
  chargedTodayExplanation?: string;

  showNextRenewal: boolean;
  nextRenewalText?: string;
  nextRenewalDate?: string;

  showEffectiveDate: boolean;
  effectiveDateLabel?: string;
  effectiveDate?: string;

  showUntilThenMessage: boolean;
  untilThenMessage?: string;

  showAfterMessage: boolean;
  afterMessage?: string;

  primaryCtaLabel: string;
  secondaryCtaLabel: string;
};

export type PlanChangeViewModelInput = {
  currentPlanCode: PlanCode;
  currentBillingInterval: "monthly" | "annual";
  targetPlanCode: PlanCode;
  targetBillingInterval: "monthly" | "annual";
  effectiveAt: "immediate" | "next_period";
  fullPlanPriceCents: number | null;
  currency: string;
  requiresCheckout: boolean;
  renewalOrEffectiveDate: string | null;
};

function formatCurrency(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatDateDisplay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function planIntervalLabel(interval: "monthly" | "annual"): string {
  return interval === "annual" ? "Annual" : "Monthly";
}

function buildPlanDescriptor(
  code: PlanCode,
  interval: "monthly" | "annual"
): PlanDescriptor {
  const plan = getPlanFromCatalog(code);
  const name = plan?.name ?? code.charAt(0).toUpperCase() + code.slice(1);
  const intervalLabel = planIntervalLabel(interval);
  const displayName = code === "free" ? "Free" : `${name} ${intervalLabel}`;
  return { code, name, billingInterval: interval, displayName };
}

function resolveVariant(input: PlanChangeViewModelInput): PlanChangeModalVariant {
  const {
    currentPlanCode,
    targetPlanCode,
    effectiveAt,
    currentBillingInterval,
    targetBillingInterval,
    requiresCheckout,
  } = input;

  if (targetPlanCode === "free") {
    return "cancel_to_free_end_of_period";
  }

  if (effectiveAt === "next_period") {
    return "downgrade_end_of_period";
  }

  const tierUpgrade = isUpgrade(currentPlanCode, targetPlanCode);
  const intervalChange = currentBillingInterval !== targetBillingInterval;
  const sameTier = currentPlanCode === targetPlanCode;

  const isBillingCycleChange =
    (sameTier || (!tierUpgrade && !isDowngrade(currentPlanCode, targetPlanCode))) &&
    intervalChange;

  const isFullCharge = requiresCheckout || currentPlanCode === "free";

  if (isBillingCycleChange) {
    return isFullCharge
      ? "billing_change_immediate_full_charge"
      : "billing_change_immediate_prorated_charge";
  }

  return isFullCharge
    ? "upgrade_immediate_full_charge"
    : "upgrade_immediate_prorated_charge";
}

export function buildPlanChangeViewModel(
  input: PlanChangeViewModelInput
): PlanChangeConfirmationViewModel {
  const {
    currentPlanCode,
    currentBillingInterval,
    targetPlanCode,
    targetBillingInterval,
    fullPlanPriceCents,
    currency,
    renewalOrEffectiveDate,
  } = input;

  const variant = resolveVariant(input);
  const currentPlan = buildPlanDescriptor(currentPlanCode, currentBillingInterval);
  const newPlan = buildPlanDescriptor(targetPlanCode, targetBillingInterval);
  const renewalDateDisplay = renewalOrEffectiveDate
    ? formatDateDisplay(renewalOrEffectiveDate)
    : null;

  const fullPriceFormatted =
    fullPlanPriceCents != null ? formatCurrency(fullPlanPriceCents, currency) : null;

  const renewalIntervalLabel = targetBillingInterval === "annual" ? "year" : "month";

  switch (variant) {
    case "upgrade_immediate_full_charge": {
      const intervalLabel = targetBillingInterval === "annual" ? "annual" : "monthly";
      return {
        variant,
        title: "Confirm upgrade",
        helperText: `You're upgrading to ${newPlan.displayName}.`,
        currentPlan,
        newPlan,
        showChargedToday: true,
        chargedTodayLabel: "Charged today",
        chargedTodayAmount:
          fullPlanPriceCents != null && fullPriceFormatted
            ? { amount: fullPlanPriceCents, currency, formatted: fullPriceFormatted }
            : undefined,
        chargedTodayExplanation: `Your first ${intervalLabel} payment will be charged today.`,
        showNextRenewal: renewalDateDisplay != null && fullPriceFormatted != null,
        nextRenewalText: fullPriceFormatted
          ? `${fullPriceFormatted}/${renewalIntervalLabel}`
          : undefined,
        nextRenewalDate: renewalDateDisplay ?? undefined,
        showEffectiveDate: false,
        showUntilThenMessage: false,
        showAfterMessage: false,
        primaryCtaLabel: `Upgrade to ${newPlan.name}${targetBillingInterval === "annual" ? " Annual" : ""}`,
        secondaryCtaLabel: "Cancel",
      };
    }

    case "upgrade_immediate_prorated_charge": {
      return {
        variant,
        title: "Confirm upgrade",
        helperText: "Only the prorated amount will be charged today.",
        currentPlan,
        newPlan,
        showChargedToday: true,
        chargedTodayLabel: "Charged today",
        chargedTodayAmount: undefined,
        chargedTodayExplanation:
          "Prorated charge after credit for unused time on your current plan.",
        showNextRenewal: renewalDateDisplay != null && fullPriceFormatted != null,
        nextRenewalText: fullPriceFormatted
          ? `${fullPriceFormatted}/${renewalIntervalLabel}`
          : undefined,
        nextRenewalDate: renewalDateDisplay ?? undefined,
        showEffectiveDate: false,
        showUntilThenMessage: false,
        showAfterMessage: false,
        primaryCtaLabel: `Upgrade to ${newPlan.name}${targetBillingInterval === "annual" ? " Annual" : ""}`,
        secondaryCtaLabel: "Cancel",
      };
    }

    case "billing_change_immediate_full_charge": {
      return {
        variant,
        title: "Confirm billing change",
        helperText: "Your annual payment will be charged today.",
        currentPlan,
        newPlan,
        showChargedToday: true,
        chargedTodayLabel: "Charged today",
        chargedTodayAmount:
          fullPlanPriceCents != null && fullPriceFormatted
            ? { amount: fullPlanPriceCents, currency, formatted: fullPriceFormatted }
            : undefined,
        chargedTodayExplanation: "Your first annual payment will be charged today.",
        showNextRenewal: renewalDateDisplay != null && fullPriceFormatted != null,
        nextRenewalText: fullPriceFormatted
          ? `${fullPriceFormatted}/${renewalIntervalLabel}`
          : undefined,
        nextRenewalDate: renewalDateDisplay ?? undefined,
        showEffectiveDate: false,
        showUntilThenMessage: false,
        showAfterMessage: false,
        primaryCtaLabel: "Confirm billing change",
        secondaryCtaLabel: "Cancel",
      };
    }

    case "billing_change_immediate_prorated_charge": {
      return {
        variant,
        title: "Confirm billing change",
        helperText: "Only the prorated amount will be charged today.",
        currentPlan,
        newPlan,
        showChargedToday: true,
        chargedTodayLabel: "Charged today",
        chargedTodayAmount: undefined,
        chargedTodayExplanation:
          "Prorated charge after credit for unused time on your current plan.",
        showNextRenewal: renewalDateDisplay != null && fullPriceFormatted != null,
        nextRenewalText: fullPriceFormatted
          ? `${fullPriceFormatted}/${renewalIntervalLabel}`
          : undefined,
        nextRenewalDate: renewalDateDisplay ?? undefined,
        showEffectiveDate: false,
        showUntilThenMessage: false,
        showAfterMessage: false,
        primaryCtaLabel: "Confirm billing change",
        secondaryCtaLabel: "Cancel",
      };
    }

    case "downgrade_end_of_period": {
      return {
        variant,
        title: "Confirm downgrade",
        helperText:
          "Your current plan will remain active until the end of the billing period.",
        currentPlan,
        newPlan,
        showChargedToday: false,
        showNextRenewal: false,
        showEffectiveDate: true,
        effectiveDateLabel: "Effective on",
        effectiveDate: renewalDateDisplay ?? undefined,
        showUntilThenMessage: true,
        untilThenMessage: `You'll keep ${currentPlan.displayName} features until your current billing period ends.`,
        showAfterMessage: true,
        afterMessage:
          fullPriceFormatted && renewalDateDisplay
            ? `Next renewal: ${fullPriceFormatted}/${renewalIntervalLabel} on ${renewalDateDisplay}`
            : undefined,
        primaryCtaLabel: "Schedule downgrade",
        secondaryCtaLabel: "Cancel",
      };
    }

    case "cancel_to_free_end_of_period": {
      return {
        variant,
        title: "Confirm cancellation",
        helperText:
          "Your paid plan will remain active until the end of the billing period.",
        currentPlan,
        newPlan,
        showChargedToday: false,
        showNextRenewal: false,
        showEffectiveDate: true,
        effectiveDateLabel: "Effective on",
        effectiveDate: renewalDateDisplay ?? undefined,
        showUntilThenMessage: true,
        untilThenMessage:
          "You'll keep your current paid features until the billing period ends.",
        showAfterMessage: true,
        afterMessage: renewalDateDisplay
          ? `After ${renewalDateDisplay}, your workspace will move to Free.`
          : "Your workspace will move to Free after the billing period ends.",
        primaryCtaLabel: "Cancel plan",
        secondaryCtaLabel: "Keep plan",
      };
    }
  }
}

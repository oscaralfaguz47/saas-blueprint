/**
 * Country rules for billing: postal/region required, VAT B2B strict.
 * Single source of truth for validation and Paddle tax behaviour.
 */

import { BILLING_COUNTRY_OPTIONS } from "@/lib/countries";

const COUNTRY_RULES = {
  topCountryOrder: [
    "US", "CA", "GB", "DE", "FR", "ES", "IT", "NL", "IE", "CH", "NO", "SE",
    "AU", "NZ", "JP", "KR", "BR", "MX", "CR", "PA", "AR", "CL", "CO", "PE", "UY",
  ],
  postalNotRequired: [
    "AE", "QA", "OM", "YE", "AF", "AO", "AG", "BS", "BZ", "BJ", "BW", "BF", "BI",
    "CM", "CF", "TD", "KM", "CG", "CD", "DJ", "DM", "ER", "FJ", "GA", "GM", "GH",
    "GD", "GN", "GW", "GY", "HT", "HN", "JM", "KE", "KI", "KP", "LA", "LC", "LR",
    "LY", "ML", "MR", "MW", "MO", "MS", "MU", "NA", "NR", "NU", "PA", "RW", "SB",
    "SC", "SL", "SO", "SR", "SS", "ST", "SY", "TF", "TG", "TL", "TO", "TT", "TV",
    "TZ", "UG", "VU", "WS", "ZW", "CR",
  ],
  regionRequired: ["US", "CA", "AU", "BR", "MX", "AR"],
  vatB2bStrict: [
    "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
    "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES",
    "SE", "GB", "NO", "CH",
  ],
} as const;

const postalNotRequiredSet = new Set(
  COUNTRY_RULES.postalNotRequired.map((c) => c.toUpperCase())
);
const regionRequiredSet = new Set(
  COUNTRY_RULES.regionRequired.map((c) => c.toUpperCase())
);
const vatB2bStrictSet = new Set(
  COUNTRY_RULES.vatB2bStrict.map((c) => c.toUpperCase())
);

/** Countries that must show and require postal code in checkout (same as Paddle "Your details"). */
export const POSTAL_CODE_REQUIRED = new Set(
  ["US", "CA", "GB", "AU", "NZ", "IE", "NL", "DE", "FR", "ES", "IT"].map((c) => c.toUpperCase())
);

export function isPostalCodeRequiredForCheckout(code: string | null | undefined): boolean {
  const upper = code?.trim()?.toUpperCase() ?? "";
  return upper.length === 2 && POSTAL_CODE_REQUIRED.has(upper);
}

export type CountryRule = {
  postalRequired: boolean;
  regionRequired: boolean;
  vatB2bStrict: boolean;
};

/**
 * Returns country options for billing: top countries first, then A–Z.
 */
export function getAllCountryOptions(): { value: string; label: string }[] {
  const top = COUNTRY_RULES.topCountryOrder;
  const byCode = new Map(BILLING_COUNTRY_OPTIONS.map((c) => [c.value, c]));
  const topOptions: { value: string; label: string }[] = [];
  for (const code of top) {
    const opt = byCode.get(code);
    if (opt) {
      topOptions.push(opt);
      byCode.delete(code);
    }
  }
  const rest = Array.from(byCode.values()).sort((a, b) =>
    a.label.localeCompare(b.label)
  );
  return [...topOptions, ...rest];
}

/**
 * Returns rules for a country code (ISO 3166-1 alpha-2). Case-insensitive.
 */
export function getCountryRule(code: string | null | undefined): CountryRule {
  const upper = code?.trim?.().toUpperCase() ?? "";
  return {
    postalRequired: upper.length === 2 && !postalNotRequiredSet.has(upper),
    regionRequired: upper.length === 2 && regionRequiredSet.has(upper),
    vatB2bStrict: upper.length === 2 && vatB2bStrictSet.has(upper),
  };
}

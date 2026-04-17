/** Shared currency options — used in workspace settings and request forms. */
export const CURRENCY_OPTIONS: { value: string; label: string }[] = [
  { value: "USD", label: "USD — United States Dollar" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "GBP", label: "GBP — British Pound" },
  { value: "CAD", label: "CAD — Canadian Dollar" },
  { value: "AUD", label: "AUD — Australian Dollar" },
  { value: "MXN", label: "MXN — Mexican Peso" },
  { value: "CRC", label: "CRC — Costa Rican Colón" },
  { value: "BRL", label: "BRL — Brazilian Real" },
  { value: "COP", label: "COP — Colombian Peso" },
  { value: "ARS", label: "ARS — Argentine Peso" },
  { value: "CLP", label: "CLP — Chilean Peso" },
  { value: "PEN", label: "PEN — Peruvian Sol" },
  { value: "CHF", label: "CHF — Swiss Franc" },
  { value: "JPY", label: "JPY — Japanese Yen" },
  { value: "CNY", label: "CNY — Chinese Yuan" },
  { value: "INR", label: "INR — Indian Rupee" },
];

/** Just the 3-letter codes, for validation. */
export const CURRENCY_CODES = CURRENCY_OPTIONS.map((c) => c.value);

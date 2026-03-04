import "server-only";

import { PADDLE_API_BASE, getPaddleApiKey } from "../paddle-api";

export type ReviseTransactionPayload = {
  fullName: string;
  companyName?: string | null;
  taxId?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  /** When true, omit city from address in the request (Paddle: "city/region can't be revised if already present"). */
  cityAlreadyPresent?: boolean;
  /** When true, omit region from address in the request. */
  regionAlreadyPresent?: boolean;
};

/** Paddle revise request body: customer.name, business.name, business.tax_identifier, address.first_line, etc. */
function buildReviseBody(payload: ReviseTransactionPayload): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (payload.fullName?.trim()) {
    body.customer = { name: payload.fullName.trim().slice(0, 255) };
  }
  const hasBusiness = payload.companyName?.trim() || payload.taxId?.trim();
  if (hasBusiness) {
    const business: Record<string, string> = {};
    if (payload.companyName?.trim()) business.name = payload.companyName.trim().slice(0, 255);
    if (payload.taxId?.trim()) business.tax_identifier = payload.taxId.trim().slice(0, 64);
    body.business = business;
  }
  // Include address when we have at least first_line. Omit city/region when already present (Paddle: "can't be revised if already present").
  if (payload.addressLine1?.trim()) {
    const address: Record<string, unknown> = {
      first_line: payload.addressLine1.trim().slice(0, 255),
      second_line: payload.addressLine2?.trim?.()?.slice(0, 255) ?? null,
    };
    if (!payload.cityAlreadyPresent && payload.city?.trim()) {
      address.city = payload.city.trim().slice(0, 255);
    }
    if (!payload.regionAlreadyPresent && payload.region?.trim()) {
      address.region = payload.region.trim().slice(0, 255);
    }
    body.address = address;
  }
  return body;
}

/** Map Paddle revise error field paths to our form field names. */
const PADDLE_REVISE_FIELD_TO_OUR: Record<string, string> = {
  "customer.name": "fullName",
  "business.name": "companyName",
  "business.tax_identifier": "taxId",
  "address.first_line": "addressLine1",
  "address.second_line": "addressLine2",
  "address.city": "city",
  "address.region": "region",
};

export type ReviseResult =
  | { ok: true }
  | { ok: false; message?: string; fieldErrors: Record<string, string> };

/**
 * Revise customer/billing details for a billed or completed transaction (invoice-specific).
 * POST /transactions/{id}/revise. Only allowed once per transaction by Paddle.
 */
export async function reviseTransactionBillingDetails(
  providerTransactionId: string,
  payload: ReviseTransactionPayload
): Promise<ReviseResult> {
  const body = buildReviseBody(payload);
  if (Object.keys(body).length === 0) {
    return { ok: false, message: "At least one field is required.", fieldErrors: {} };
  }

  const res = await fetch(
    `${PADDLE_API_BASE}/transactions/${encodeURIComponent(providerTransactionId)}/revise`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getPaddleApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (res.ok) return { ok: true };

  const text = await res.text();
  const fieldErrors: Record<string, string> = {};
  let message = "Failed to update billing details. Please try again.";

  try {
    const jsonStr = text.includes("{") ? text.slice(text.indexOf("{")) : text;
    const parsed = JSON.parse(jsonStr) as {
      error?: {
        detail?: string;
        code?: string;
        errors?: Array<{ field?: string; message?: string }>;
      };
    };
    const err = parsed?.error;
    if (err?.detail && typeof err.detail === "string") {
      message = err.detail;
    }
    const list = err?.errors;
    if (Array.isArray(list)) {
      for (const e of list) {
        const paddleField = e?.field?.trim?.();
        const msg = (e?.message ?? "Invalid value").trim().slice(0, 200);
        const ourField = paddleField ? PADDLE_REVISE_FIELD_TO_OUR[paddleField] ?? paddleField : "field";
        fieldErrors[ourField] = msg;
      }
    }
  } catch {
    // keep default message
  }

  return { ok: false, message, fieldErrors };
}

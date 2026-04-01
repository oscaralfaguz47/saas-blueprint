import "server-only";

import { PADDLE_API_BASE, getPaddleApiKey } from "../paddle-api";

export type UpdateBillingDetailsParams = {
  providerCustomerId: string;
  /** Paddle address ID (add_xxx). If missing, first address is used when address fields are sent. */
  providerAddressId?: string | null;
  /** Paddle business ID (biz_xxx). If missing, first business is used when business fields are sent. */
  providerBusinessId?: string | null;
  /** Editable only; Country is set at checkout and not updated here. */
  companyName?: string | null;
  vatId?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  /** Paddle address description (e.g. subscription ID for identification). */
  description?: string | null;
  /** Two-letter ISO 3166-1 alpha-2 country code. Editable in billing details. */
  countryCode?: string | null;
};

async function paddleFetch<T>(
  path: string,
  init: RequestInit
): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const res = await fetch(`${PADDLE_API_BASE}${path}`, {
      ...init,
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Bearer ${getPaddleApiKey()}`,
        ...init.headers,
      },
    });
    if (!res.ok) {
      const err = await res.text();
      return { ok: false, error: `${res.status}: ${err}` };
    }
    const json = (await res.json()) as { data?: T };
    return { ok: true, data: json.data };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const isTimeout =
      e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return {
      ok: false,
      error: isTimeout ? "Paddle API timeout. Please try again." : message,
    };
  }
}

/** Paddle list returns active addresses by default; archived are excluded unless status=archived. */
function isEntityArchivedError(error: string): boolean {
  return (
    error.includes("entity_archived") ||
    error.includes("archived") ||
    error.includes("cannot be modified")
  );
}

/** Paddle API field name -> our form/API field name (billing details). */
const PADDLE_FIELD_TO_OUR_FIELD: Record<string, string> = {
  country_code: "countryCode",
  tax_identifier: "vatId",
  name: "companyName",
  first_line: "addressLine1",
  second_line: "addressLine2",
  city: "city",
  region: "region",
  postal_code: "postalCode",
};

export type PaddleFieldError = { field: string; message: string };

/**
 * Parse Paddle 400 response body into a user-facing message and field-level errors.
 * Aligns Paddle field names with our form fields (e.g. tax_identifier -> vatId).
 */
export function parsePaddleValidationError(errorBody: string): {
  message: string;
  fieldErrors: PaddleFieldError[];
} {
  const fieldErrors: PaddleFieldError[] = [];
  let message = "Validation failed. Please check your entries.";

  try {
    const jsonStr = errorBody.includes("{") ? errorBody.slice(errorBody.indexOf("{")) : errorBody;
    const parsed = JSON.parse(jsonStr) as {
      error?: {
        detail?: string;
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
        const ourField = paddleField ? PADDLE_FIELD_TO_OUR_FIELD[paddleField] ?? paddleField : "field";
        fieldErrors.push({ field: ourField, message: msg });
      }
      if (fieldErrors.length > 0 && message === "Validation failed. Please check your entries.") {
        message = fieldErrors[0].message;
      }
    }
  } catch {
    // leave message and fieldErrors as above/default
  }
  return { message, fieldErrors };
}

/**
 * EPIC 5: Update Paddle address and business for future invoices.
 * Does NOT change Country (set at checkout). Postal code is editable here and at checkout.
 * Uses PATCH /customers/{id}/addresses/{address_id} and PATCH /customers/{id}/businesses/{business_id}.
 * When the stored address is archived (entity_archived), fetches active addresses and retries with the first one.
 */
export type UpdatePaddleBillingDetailsResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: PaddleFieldError[];
  addressIdUsed?: string;
  businessIdUsed?: string;
};

export async function updatePaddleBillingDetails(
  params: UpdateBillingDetailsParams
): Promise<UpdatePaddleBillingDetailsResult> {
  const {
    providerCustomerId,
    providerAddressId,
    providerBusinessId,
    countryCode,
    companyName,
    vatId,
    addressLine1,
    addressLine2,
    city,
    region,
    postalCode,
    description,
  } = params;

  const hasAddressFields =
    countryCode !== undefined ||
    addressLine1 !== undefined ||
    addressLine2 !== undefined ||
    city !== undefined ||
    region !== undefined ||
    postalCode !== undefined ||
    description !== undefined;
  const hasBusinessFields = companyName !== undefined || vatId !== undefined;

  let addressId = providerAddressId?.trim() || null;
  if (hasAddressFields && !addressId) {
    const list = await paddleFetch<Array<{ id: string }>>(
      `/customers/${encodeURIComponent(providerCustomerId)}/addresses?per_page=10`,
      { method: "GET" }
    );
    if (!list.ok) return { ok: false, error: list.error };
    addressId = list.data?.[0]?.id?.trim() || null;
  }

  if (hasAddressFields && addressId) {
    const body: Record<string, unknown> = {};
    if (countryCode !== undefined)
      body.country_code = typeof countryCode === "string" && countryCode.length >= 2 ? countryCode.trim().toUpperCase().slice(0, 2) : null;
    if (addressLine1 !== undefined) body.first_line = addressLine1 ?? null;
    if (addressLine2 !== undefined) body.second_line = addressLine2 ?? null;
    if (city !== undefined) body.city = city ?? null;
    if (region !== undefined) body.region = region ?? null;
    if (postalCode !== undefined) body.postal_code = postalCode ?? null;
    if (description !== undefined)
      body.description = typeof description === "string" && description.length > 0 ? description.slice(0, 191) : null;

    let res = await paddleFetch(
      `/customers/${encodeURIComponent(providerCustomerId)}/addresses/${encodeURIComponent(addressId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok && isEntityArchivedError(res.error ?? "")) {
      const list = await paddleFetch<Array<{ id: string }>>(
        `/customers/${encodeURIComponent(providerCustomerId)}/addresses?per_page=10`,
        { method: "GET" }
      );
      if (!list.ok) return { ok: false, error: list.error };
      const nextAddress = list.data?.find((a) => a.id?.trim() && a.id.trim() !== addressId);
      const fallbackId = nextAddress?.id?.trim() ?? list.data?.[0]?.id?.trim();
      if (fallbackId) {
        addressId = fallbackId;
        res = await paddleFetch(
          `/customers/${encodeURIComponent(providerCustomerId)}/addresses/${encodeURIComponent(addressId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );
      }
    }

    if (!res.ok) {
      const parsed = parsePaddleValidationError(res.error ?? "");
      return { ok: false, error: parsed.message, fieldErrors: parsed.fieldErrors };
    }
  }

  let addressIdUsed: string | undefined =
    hasAddressFields && addressId ? addressId : undefined;
  let businessId = providerBusinessId?.trim() || null;
  if (hasBusinessFields && !businessId) {
    const list = await paddleFetch<Array<{ id: string }>>(
      `/customers/${encodeURIComponent(providerCustomerId)}/businesses?per_page=10`,
      { method: "GET" }
    );
    if (!list.ok) return { ok: false, error: list.error };
    businessId = list.data?.[0]?.id?.trim() || null;
  }

  if (hasBusinessFields && businessId) {
    const body: Record<string, unknown> = {};
    if (companyName !== undefined) body.name = companyName ?? "";
    if (vatId !== undefined) body.tax_identifier = vatId ?? null;

    let res = await paddleFetch(
      `/customers/${encodeURIComponent(providerCustomerId)}/businesses/${encodeURIComponent(businessId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok && isEntityArchivedError(res.error ?? "")) {
      const list = await paddleFetch<Array<{ id: string }>>(
        `/customers/${encodeURIComponent(providerCustomerId)}/businesses?per_page=10`,
        { method: "GET" }
      );
      if (!list.ok) return { ok: false, error: list.error };
      const nextBusiness = list.data?.find((b) => b.id?.trim() && b.id.trim() !== businessId);
      const fallbackId = nextBusiness?.id?.trim() ?? list.data?.[0]?.id?.trim();
      if (fallbackId) {
        businessId = fallbackId;
        res = await paddleFetch(
          `/customers/${encodeURIComponent(providerCustomerId)}/businesses/${encodeURIComponent(businessId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );
      }
    }

    if (!res.ok) {
      const parsed = parsePaddleValidationError(res.error ?? "");
      return { ok: false, error: parsed.message, fieldErrors: parsed.fieldErrors };
    }
  }

  const businessIdUsed = hasBusinessFields && businessId ? businessId : undefined;
  return {
    ok: true,
    ...(addressIdUsed ? { addressIdUsed } : {}),
    ...(businessIdUsed ? { businessIdUsed } : {}),
  };
}

/**
 * Set the Paddle address description (e.g. subscription ID for identification).
 * Used after checkout when subscription is created/updated so the address shows which subscription it belongs to.
 */
export async function setPaddleAddressDescription(
  providerCustomerId: string,
  providerAddressId: string,
  description: string
): Promise<{ ok: boolean; error?: string }> {
  const body = { description: description.slice(0, 191) };
  const res = await paddleFetch(
    `/customers/${encodeURIComponent(providerCustomerId)}/addresses/${encodeURIComponent(providerAddressId.trim())}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

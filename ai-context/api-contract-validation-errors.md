# API Contract: Validation and Error Handling

## Purpose
Defines the API validation and error response standards.

---

# Validation

All API payloads must be validated using **Zod**.

Includes:

- request body
- query parameters

Invalid input must return:
HTTP 400


---

# Error Format

All API errors must follow this structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": {}
  }
}

Standard HTTP Codes
400 validation
401 unauthenticated
403 forbidden
404 not found
409 conflict
429 rate limited
500 server error

Known Error Mapping
Known database conflicts must map to:
409

Never swallow errors silently.

Related Documents

../GEMINI.md


---

# 8️⃣ `ai-context/ui-ux-contract.md`

```md
# UI/UX Contract

## Purpose
Defines the UI/UX design standards for the application.

---

# Component Structure

UI primitives must live in:
src/components/ui


Domain components must live in feature folders.

---

# Required Screen States

Every screen must support:

- loading
- empty
- error

---

# Upgrade Required UX

If an action is blocked by plan limits:

The UI must:

- clearly explain the reason
- show usage
- show upgrade CTA

---

# Sensitive Data

The UI must never expose:

- cross-tenant data
- internal IDs unless required

---

## Related Documents

- ../GEMINI.md
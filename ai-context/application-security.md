# Application Security

## Purpose

Defines the core application-level security rules.

These protections mitigate common web vulnerabilities such as:

- XSS
- CSRF
- SSRF
- open redirects
- injection attacks
- unsafe rendering

## Scope

Applies to:

- UI components
- API endpoints
- server-side rendering
- data processing

---

# Core Security Rules

## 1. XSS Prevention

Never trust or directly render user-provided HTML.

Rules:

- Escape all user-generated content.
- Never use `dangerouslySetInnerHTML` unless strictly necessary.
- If HTML rendering is required, sanitize using a trusted library.

Allowed libraries:
DOMPurify
sanitize-html


---

## 2. CSRF Protection

Mutating endpoints must enforce CSRF protection.

Options include:

- same-site cookies
- CSRF tokens
- double-submit cookie pattern

If cookies are used for auth, CSRF protection is mandatory.

---

## 3. SSRF Prevention

Server code must never allow arbitrary outbound requests.

Rules:

- do not allow arbitrary URLs from user input
- validate allowed domains
- block private network ranges

Disallowed destinations include:
localhost
127.0.0.1
169.254.x.x
10.x.x.x
192.168.x.x
172.16.x.x

---

## 4. Open Redirect Prevention

Never redirect users to URLs provided directly by user input.

Redirects must be validated against:

- internal routes
- trusted allowlists

---

## 5. Input Normalization

All user inputs must be normalized before use.

Examples:

- trim whitespace
- normalize casing
- enforce expected formats

---

## 6. HTML and Markdown Rendering

If rich content is supported:

- sanitize HTML
- restrict allowed tags
- strip script tags
- disable inline event handlers

---

## Implementation Guidance

- prefer server-side validation
- sanitize user-generated content
- validate any redirect destination
- restrict outbound network calls

---

## Related Documents

- ../GEMINI.md
- ./api-security.md
- ./secrets-and-cryptography.md
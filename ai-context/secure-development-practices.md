# Secure Development Practices

## Purpose

Defines how developers must build software securely.

Ensures security is integrated into the development lifecycle.

---

# Scope

Applies to:

- feature development
- code reviews
- testing
- deployment processes

---

# Core Principles

## 1. Security by Design

Security must be considered during system design.

Developers must evaluate:

- authentication
- authorization
- data exposure
- attack surface

before implementing features.

---

## 2. Least Privilege

Systems and components must operate with minimal permissions.

Examples:

- database access limited to required queries
- API tokens limited in scope
- CI pipelines limited to required operations

---

## 3. Secure Code Reviews

All code changes must undergo review.

Reviewers must check for:

- authorization flaws
- tenant isolation errors
- insecure data handling
- unsafe input handling

Security considerations must be part of every review.

---

## 4. Secrets Protection

Secrets must never appear in:

- source code
- commit history
- logs
- frontend bundles

Secrets must be stored in environment configuration.

---

## 5. Logging Discipline

Logs must never expose:

- passwords
- tokens
- secret keys
- sensitive personal data

Logs should contain only operational information.

---

## 6. Testing Security Scenarios

Security-sensitive functionality must include testing.

Examples:

- permission checks
- tenant isolation
- access control

Automated tests should validate critical security flows.

---

## 7. Incident Awareness

Developers must be aware of security incidents.

When a vulnerability is discovered:

1. assess scope
2. apply mitigation
3. deploy fixes quickly
4. review similar code paths

---

## Implementation Guidance

Secure development requires continuous awareness.

Developers must assume that:

- user inputs are hostile
- attackers probe APIs
- misuse scenarios will occur

Systems must fail safely and defensively.

---

## Related Documents

- ../GEMINI.md
- ./application-security.md
- ./api-security.md
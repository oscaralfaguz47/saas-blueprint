# Authentication and Session Security

## Purpose

Defines authentication hardening and session lifecycle rules.

Ensures secure login, session management, and identity protection.

## Scope

Applies to:

- login flows
- session management
- password reset
- authentication tokens
- MFA

---

# Core Security Rules

## 1. Session Expiration

Sessions must expire automatically.

Recommended policy:
Idle timeout: 12 hours
Absolute expiration: 7 days

Sessions must be revocable.

---

## 2. Secure Session Storage

Sessions must:

- be stored securely
- never expose tokens to the client unnecessarily

JWT tokens must:

- be signed
- include expiration

---

## 3. Brute Force Protection

Login endpoints must implement protection against brute force attacks.

Mechanisms:

- rate limiting
- temporary lockout
- captcha after repeated failures

---

## 4. Password Reset Security

Password reset tokens must:

- be single-use
- expire quickly (recommended: 15–30 minutes)
- be cryptographically random

Tokens must be stored **hashed**.

---

## 5. MFA / Two-Factor Authentication

Where supported, MFA must be implemented using:

- TOTP
- hardware keys
- trusted authenticator apps

SMS-based MFA should be avoided if possible.

---

## 6. Suspicious Login Detection

Detect unusual logins:

Examples:

- new location
- new device
- abnormal login frequency

Optional mitigation:

- email confirmation
- step-up verification

---

## Implementation Guidance

Authentication flows must be resilient against:

- credential stuffing
- brute force attacks
- session fixation

---

## Related Documents

- ../GEMINI.md
- ./security-multitenancy.md


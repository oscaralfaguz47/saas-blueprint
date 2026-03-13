# Secrets and Cryptography

## Purpose

Defines how secrets, tokens, and cryptographic material must be handled.

---

# Core Rules

## 1. Secrets Management

Secrets must never be stored in:

- source code
- frontend bundles
- logs

Secrets must live in environment configuration.

---

## 2. Token Handling

Sensitive tokens must be:

- hashed before storage
- generated using secure randomness

---

## 3. Cryptographic Randomness

Random tokens must be generated using secure generators.

Example:
crypto.randomBytes

---

## 4. Secret Rotation

Secrets must support periodic rotation.

Examples:

- API keys
- webhook secrets
- database credentials

---

## Related Documents

- ../GEMINI.md

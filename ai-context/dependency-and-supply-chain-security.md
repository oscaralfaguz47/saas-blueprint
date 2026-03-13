# Dependency and Supply Chain Security

## Purpose

Defines rules to protect the application against vulnerabilities introduced through third-party dependencies, packages, and build pipelines.

Modern attacks frequently target the software supply chain.

This document ensures that dependencies and build processes remain secure.

---

# Scope

Applies to:

- npm dependencies
- third-party libraries
- CI/CD pipelines
- build systems
- package registries

---

# Core Security Rules

## 1. Dependency Minimization

Only install dependencies that are strictly necessary.

Before adding a dependency:

- verify maintenance status
- review security advisories
- confirm license compatibility

Avoid large libraries when smaller alternatives exist.

---

## 2. Lockfile Discipline

The project must always commit a lockfile.

Example:
package-lock.json
pnpm-lock.yaml
yarn.lock

Never regenerate lockfiles unnecessarily.

Lockfiles guarantee deterministic builds.

---

## 3. Automated Vulnerability Scanning

Dependencies must be scanned for known vulnerabilities.

Recommended tools:

- npm audit
- Snyk
- Dependabot
- GitHub Security Advisories

Critical vulnerabilities must be addressed immediately.

---

## 4. Dependency Update Policy

Dependencies must be updated regularly.

Recommended policy:
Security patches: immediately
Minor updates: periodically
Major updates: reviewed carefully

Breaking updates must be tested in staging environments.

---

## 5. Malicious Package Detection

Before installing a new dependency:

- verify repository authenticity
- check maintainers
- review download counts
- inspect source code if possible

Avoid newly published packages without community trust.

---

## 6. CI/CD Security

Build pipelines must follow least privilege principles.

Rules:

- CI tokens must have minimal permissions
- secrets must never appear in build logs
- build artifacts must not contain secrets

---

## 7. Dependency Integrity

Where possible, enable integrity checks.

Example:
npm integrity hashes

This ensures packages are not tampered with during installation.

---

## Implementation Guidance

When adding new dependencies:

1. evaluate necessity
2. review security history
3. verify package authenticity
4. document reasoning if the dependency is large or complex

---

## Related Documents

- ../GEMINI.md
- ./secrets-and-cryptography.md
- ./secure-development-practices.md
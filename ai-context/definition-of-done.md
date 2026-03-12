# Definition of Done

## Purpose
Defines the criteria that must be satisfied before a change is considered complete.

---

# Requirements

All implementations must:

- compile successfully
- respect TypeScript types
- maintain tenant isolation
- include authorization checks
- include Zod validation
- maintain architectural consistency

---

# Implementation Guidelines

For non-trivial changes:

1. propose a short implementation plan
2. modify only necessary files
3. avoid speculative abstractions
4. keep code production-grade

---

# Security Requirements

Sensitive actions must:

- enforce RBAC
- respect tenant isolation
- create audit log entries when applicable

---

## Related Documents

- ../GEMINI.md

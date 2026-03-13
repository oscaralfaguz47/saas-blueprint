# Architecture

## Purpose
This document defines the foundational architecture rules for the application.

It establishes the canonical patterns, technologies, and constraints that must be followed when implementing new features or modifying existing code.

These rules ensure the system remains maintainable, secure, and consistent.

## Scope
Applies to the entire codebase unless a module-level document introduces stricter constraints without weakening these rules.

## Official Stack

The system is a production-grade multi-tenant SaaS built with:

- Next.js App Router
- Route Handlers (`src/app/api/**/route.ts`)
- NextAuth (JWT strategy)
- Prisma ORM
- PostgreSQL
- Zod for validation
- Tailwind CSS
- shadcn/ui components

The system follows a **server-first architecture**.

---

# Core Architectural Rules

## 1. App Router Only

The application must use **Next.js App Router conventions exclusively**.

Allowed:
src/app//page.tsx
src/app//layout.tsx
src/app/api/**/route.ts


Not allowed:

- `pages/`
- `pages/api`
- legacy routing patterns

All APIs must be implemented using **Route Handlers**.

---

## 2. Server-First Rendering

All components must be **Server Components by default**.

Client Components are allowed **only when strictly required**, such as when using:

- React hooks (`useState`, `useEffect`, etc.)
- browser APIs
- event handlers (`onClick`, `onChange`, etc.)

Client Components should remain **small leaf components**.

---

## 3. No Server Actions

Server Actions (`"use server"`) must not be used.

All mutations and side effects must go through **API Route Handlers**.

Reason:
- predictable API contracts
- easier testing
- better observability
- better access control

---

## 4. Route Groups Must Be Respected

Existing route groups must remain consistent.

Example groups:

(public)
(auth)
(product)


Do not introduce new route groups unless the change is consistent with the existing routing model.

---

## 5. Shared Helper Functions

Critical logic must be centralized using shared helpers.

Examples:

- tenant resolution
- RBAC permission checks
- request access rules
- plan limit checks

Avoid duplicating business logic across handlers or components.

---

## 6. Single Source of Truth

Critical domain logic must exist in **one authoritative location**.

Avoid patterns where the same business logic is implemented in:

- UI
- API
- helper utilities

All important rules must be enforced **server-side**.

---

## 7. Domain Separation

Code organization must respect clear domain boundaries.

Suggested directories:

src/components/ui
src/components/app
src/components/auth
src/components/settings

src/lib
src/server


UI primitives must live in:

src/components/ui


Domain components must live in feature folders.

---

## Implementation Guidance

When implementing new features:

1. Respect the server-first architecture.
2. Implement mutations through Route Handlers.
3. Use shared helpers when available.
4. Avoid introducing new architectural patterns.

---

## Related Documents

- ../GEMINI.md
- ./security-multitenancy.md
- ./authorization-rbac-and-request-access.md
- ./prisma-and-performance.md
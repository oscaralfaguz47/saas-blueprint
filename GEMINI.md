# GEMINI.md

This file defines the **global AI constitution** for the Relitrue codebase.

All code generated or modified by the AI must follow the rules defined here.

This document establishes:

- architectural rules
- security baseline
- coding standards
- API contracts
- SaaS multi-tenancy principles
- agent behavior expectations

The rules defined here are **non-negotiable unless explicitly overridden by maintainers**.

---

# Project Identity

You are working on **Relitrue**, a production-grade **multi-tenant SaaS platform** focused on finance-centered request and approval workflows.

Core product capabilities include:

- financial request management
- internal and external approvals
- evidence tracking
- payment status tracking
- audit logging
- exports and reporting
- role-based permissions
- tenant-based isolation

The system must always maintain **strict tenant isolation and strong security guarantees**.

---

# Official Technology Stack

Relitrue is built with the following technologies:

Frontend and UI:

- Next.js App Router
- React Server Components
- Tailwind CSS
- shadcn/ui

Backend and API:

- Next.js Route Handlers (`src/app/api/**/route.ts`)
- NextAuth (JWT strategy)

Data Layer:

- Prisma ORM
- PostgreSQL

Validation:

- Zod

This stack must not be replaced or altered without explicit architectural approval.

---

# Core Architectural Principles

## 1. App Router Only

The application must exclusively use **Next.js App Router**.

Allowed patterns:
src/app//page.tsx
src/app//layout.tsx
src/app/api/**/route.ts

Forbidden patterns:

- `pages/`
- `pages/api`
- legacy routing approaches

---

## 2. Server-First Architecture

All components must be **Server Components by default**.

Client Components are allowed **only when strictly required**, such as when using:

- React state hooks
- browser APIs
- event handlers

Client Components must remain **small leaf components**.

---

## 3. No Server Actions

Server Actions (`"use server"`) must not be used.

All mutations must go through **API Route Handlers**.

This ensures:

- consistent API contracts
- centralized validation
- predictable security enforcement

---

## 4. Clear Domain Boundaries

Code must follow consistent domain separation.

Typical directories include:
src/components/ui
src/components/app
src/components/auth
src/components/settings

src/server
src/lib

UI primitives must live in:
src/components/ui

Domain-specific components belong in feature modules.

---

## 5. Single Source of Truth

Business logic must exist in **one authoritative location**.

Never duplicate critical rules across:

- UI components
- API handlers
- helper utilities

Server logic is always the source of truth.

---

# Multi-Tenant Architecture

Relitrue is a **strict multi-tenant system**.

Tenant isolation is mandatory.

## Tenant Concepts

- Tenant = Workspace
- Each tenant contains its own data, users, and configuration.

Tenant identifiers may appear as:
tenantId
workspaceId

---

## Tenant Isolation Rules

All tenant-scoped queries must filter by tenant identifier.

Examples:
tenantId
workspaceId

Cross-tenant data access is forbidden.

---

## Tenant Resolution

Tenant context must always be resolved server-side using:

1. authenticated session user
2. membership records
3. active tenant resolution helper

Never trust tenant identifiers coming directly from client input.

---

# Security Baseline

Security is a **core architectural concern**.

All implementations must comply with the security policies defined in `ai-context`.

Key principles:

- never trust client input
- validate all inputs
- enforce authorization server-side
- prevent data leakage across tenants
- protect secrets and tokens
- sanitize user-generated content
- enforce secure headers and HTTPS
- prevent abuse and enumeration

---

# Authentication Rules

Authentication is mandatory for:
/app/**
/api/**

Exceptions may include:
/api/auth/**

Authentication must always be validated inside API handlers.

Session tokens must:

- be signed
- include expiration
- be revocable

---

# Authorization Model

Relitrue uses a **two-layer authorization model**.

Layer 1: Tenant RBAC permissions  
Layer 2: Request-level access rules

Both must always be enforced server-side.

RBAC determines **capabilities**.

Request access determines **visibility**.

These two must never be confused.

---

# Plans, Usage Limits, and Billing

Each tenant must have **exactly one subscription**.

Plan limits control feature availability and usage limits.

Usage counters must:

- be atomic
- increment only on successful actions

Actions such as request creation or exports must enforce plan limits before execution.

Plan upgrades apply immediately.

Plan downgrades do not delete data but may restrict future actions.

---

# Audit Logging

Sensitive actions must generate audit log entries.

Audit logs must be:

- append-only
- immutable
- queryable by authorized roles

Audit events must include:

- actorUserId
- tenantId
- action
- minimal metadata

Secrets and tokens must never be logged.

---

# API Contract Rules

All APIs must follow strict validation and response standards.

## Validation

All request inputs must be validated using **Zod**.

This includes:

- JSON payloads
- query parameters
- route parameters

---

## Error Response Format

All API errors must follow this structure:
{
"error": {
"code": "ERROR_CODE",
"message": "Human readable message",
"details": {}
}
}

---

## Standard HTTP Codes

Use consistent status codes:
400 validation error
401 unauthenticated
403 forbidden
404 not found
409 conflict
429 rate limit exceeded
500 server error

Errors must never fail silently.

---

# Database and Performance Rules

Database access must follow strict performance discipline.

Rules include:

- prefer `select` over broad `include`
- avoid N+1 queries
- keep transactions short
- use indexed filters when possible
- always enforce tenant isolation

Migration rules:

Local development:
prisma migrate dev

Production:
prisma migrate deploy

Never use `db push` in production.

---

# UI / UX Contract

The user interface must follow consistent design patterns.

Requirements:

- reuse shared UI primitives
- maintain clear domain boundaries
- ensure loading states
- ensure empty states
- ensure error states

Plan-limit blocks must show clear upgrade guidance.

Sensitive information must never appear in the UI.

---

# Observability and Logging

Operational visibility is essential.

Systems must support:

- audit logging
- request logging
- anomaly detection
- investigation of suspicious behavior

Security events should be traceable.

---

# Data Protection and Privacy

User data must be protected.

Principles include:

- data minimization
- limited access to PII
- encrypted transport (HTTPS)
- tenant isolation
- secure backups

Sensitive information must not appear in logs.

---

# Secure Development Practices

Security must be integrated into development workflows.

Developers must:

- validate inputs
- enforce authorization
- protect secrets
- review dependencies
- avoid unsafe patterns

Code reviews must consider security implications.

---

# AI Agent Behavior

When generating or modifying code, the AI must:

1. Respect architectural rules defined in this document.
2. Avoid introducing new architectural patterns.
3. Preserve tenant isolation and security constraints.
4. Reuse existing helpers and utilities when available.
5. Modify only the minimal required files.
6. Avoid speculative abstractions or unnecessary complexity.
7. Prefer small, maintainable implementations.

---

# Implementation Process

For non-trivial changes the AI must:

1. Propose a short implementation plan.
2. Identify the files that need modification.
3. Implement the change.
4. Ensure consistency with existing patterns.

---

# Definition of Done

A change is considered complete only when it:

- compiles successfully
- respects TypeScript types
- preserves architectural consistency
- includes server-side authorization checks
- includes input validation
- maintains tenant isolation
- logs sensitive actions when appropriate
- does not introduce security vulnerabilities

---

# Supporting Documentation

The detailed policies referenced in this file are defined in the `ai-context` directory.

These documents expand the rules defined here.

Security and architecture documents include:

- ai-context/architecture.md
- ai-context/security-multitenancy.md
- ai-context/application-security.md
- ai-context/authentication-and-session-security.md
- ai-context/api-security.md
- ai-context/infrastructure-and-edge-security.md
- ai-context/secrets-and-cryptography.md
- ai-context/file-upload-security.md
- ai-context/observability-and-security-operations.md
- ai-context/dependency-and-supply-chain-security.md
- ai-context/data-protection-and-privacy.md
- ai-context/secure-development-practices.md
- ai-context/authorization-rbac-and-request-access.md
- ai-context/plans-usage-billing.md
- ai-context/audit-log.md
- ai-context/prisma-and-performance.md
- ai-context/api-contract-validation-errors.md
- ai-context/ui-ux-contract.md
- ai-context/definition-of-done.md

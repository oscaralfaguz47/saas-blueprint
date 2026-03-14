# EPIC: Global Theme, Color System, UI/UX Refresh, and SEO-Safe Front-end Hardening

## EPIC ID
UI-FOUNDATION-GLOBAL-THEME-AND-DESIGN-REFRESH

## Priority
High

## Scope
Global. This EPIC applies to the entire application, including:
- Product application pages
- Public marketing pages
- Public legal pages
- Authentication pages
- Shared UI primitives
- Shared layouts
- All theme-aware components
- All surfaces, typography, borders, states, and feedback patterns

## Mandatory instruction
Always follow the architecture and security rules defined in `GEMINI.md` and `ai-context/*`.

---

## 1. Objective

Implement a complete global UI foundation refresh for Relitrue so that the application feels like a modern, premium, trustworthy financial approvals SaaS.

The refresh must:
- preserve the current product architecture
- preserve existing business logic
- preserve all permission checks, billing flows, auth flows, and server-side behavior
- remain lightweight and efficient
- remain fully SEO friendly
- improve visual hierarchy, consistency, accessibility, and maintainability
- standardize the theme system across both product and public pages
- eliminate unnecessary visual inconsistency between dark and light modes
- ensure all shared components consume the same semantic design tokens

This is not a cosmetic patch. This is a global foundation refactor for design tokens, theme application, visual semantics, and shared UI primitives.

---

## 2. Product design direction

Relitrue is a financial approvals platform. The visual system must communicate:
- trust
- clarity
- control
- auditability
- operational precision
- security
- calm, modern enterprise quality

The UI must not feel:
- playful
- overly startup-bright
- generic template-like
- visually flat
- visually muddy in dark mode
- too white and washed-out in light mode

### Desired brand direction
- Primary brand direction: refined blue / slate / ink
- Green reserved for success and approved states
- Amber reserved for warning, pending risk, or review states
- Red reserved for destructive, failed, or declined states
- Neutral surfaces must be cool and structured, not warm or beige
- Shadows must stay subtle; hierarchy should rely mostly on surfaces, borders, spacing, and typography

---

## 3. Non-goals

This EPIC must not:
- rewrite billing logic
- rewrite auth logic
- rewrite tenancy logic
- rewrite permission logic
- replace the existing routing structure unnecessarily
- introduce heavy UI libraries
- introduce CSS-in-JS
- introduce unnecessary animations
- introduce visual noise
- break existing APIs or domain behavior
- harm SEO or server-first rendering for public pages

---

## 4. Architecture requirements

### 4.1 Root layout must remain as server-first as possible
The global root layout must be kept lightweight. Do not attach client-only providers globally unless truly necessary.

### 4.2 Public and product trees must be intentionally separated
Ensure the app is structured so that:
- public pages remain as lightweight as possible
- product pages can use the required client providers
- theme behavior is consistent across both trees

### 4.3 Theme consistency across public and product pages
Relitrue users must be able to navigate public pages and product pages with a coherent theme experience.

The theme system must work consistently for:
- landing page
- pricing
- privacy
- terms
- auth pages
- product app pages

### 4.4 Do not duplicate theme logic
Use one coherent theme token system driven by CSS custom properties.

### 4.5 Do not spread hardcoded colors across components
All shared components must consume semantic tokens. Hardcoded colors should only be allowed when strictly necessary, such as:
- external card brand logos
- vendor logo assets
- highly specific illustrations
- one-off external embeds if needed

---

## 5. Theme strategy

### 5.1 Keep the current appearance model
Keep support for:
- `dark`
- `light`
- `system`

### 5.2 Keep server-driven initial appearance
Keep the current pattern where user appearance from the database can be used as the initial theme.

### 5.3 Keep local persistence for client responsiveness
Keep local persistence for appearance selection to preserve fast client-side switching.

### 5.4 Prevent theme flash
Ensure theme bootstrap executes early enough so the correct theme is applied before visible paint.

### 5.5 Apply theme consistently outside the product tree
Currently the product layout already mounts theme bootstrap and theme provider. Expand the theme strategy so public pages can also render with the correct appearance without flashing or mismatch.

### 5.6 Add `color-scheme`
Ensure dark and light modes define `color-scheme` correctly so native controls render consistently.

---

## 6. Global color system

Replace the current global palette with the following Relitrue palette and use it as the canonical theme token source.

## 6.1 Canonical theme tokens

```css
:root {
  color-scheme: dark;

  --bg-main: #0b1424;
  --bg-app: #0f1b2d;
  --bg-surface: #132238;
  --bg-surface-elev: #182a44;
  --bg-surface-hover: #1d3150;

  --color-primary: #3b82f6;
  --color-primary-hover: #2563eb;
  --color-primary-soft: rgba(59, 130, 246, 0.14);
  --color-accent: #0ea5e9;

  --color-success: #22c55e;
  --color-success-soft: rgba(34, 197, 94, 0.14);

  --color-warning: #f59e0b;
  --color-warning-soft: rgba(245, 158, 11, 0.14);

  --color-danger: #ef4444;
  --color-danger-soft: rgba(239, 68, 68, 0.14);
  --destructive: var(--color-danger);

  --border-subtle: rgba(148, 163, 184, 0.16);
  --border-strong: rgba(148, 163, 184, 0.28);

  --text-primary: #f8fafc;
  --text-secondary: #cbd5e1;
  --text-muted: #94a3b8;
  --text-disabled: #64748b;

  --nav-hover: rgba(148, 163, 184, 0.08);
  --nav-active: rgba(59, 130, 246, 0.14);

  --focus-ring: rgba(96, 165, 250, 0.38);
}

:root[data-theme="dark"] {
  color-scheme: dark;

  --bg-main: #0b1424;
  --bg-app: #0f1b2d;
  --bg-surface: #132238;
  --bg-surface-elev: #182a44;
  --bg-surface-hover: #1d3150;

  --color-primary: #3b82f6;
  --color-primary-hover: #2563eb;
  --color-primary-soft: rgba(59, 130, 246, 0.14);
  --color-accent: #0ea5e9;

  --color-success: #22c55e;
  --color-success-soft: rgba(34, 197, 94, 0.14);

  --color-warning: #f59e0b;
  --color-warning-soft: rgba(245, 158, 11, 0.14);

  --color-danger: #ef4444;
  --color-danger-soft: rgba(239, 68, 68, 0.14);
  --destructive: var(--color-danger);

  --border-subtle: rgba(148, 163, 184, 0.16);
  --border-strong: rgba(148, 163, 184, 0.28);

  --text-primary: #f8fafc;
  --text-secondary: #cbd5e1;
  --text-muted: #94a3b8;
  --text-disabled: #64748b;

  --nav-hover: rgba(148, 163, 184, 0.08);
  --nav-active: rgba(59, 130, 246, 0.14);

  --focus-ring: rgba(96, 165, 250, 0.38);
}

:root[data-theme="light"] {
  color-scheme: light;

  --bg-main: #f4f7fb;
  --bg-app: #f7f9fc;
  --bg-surface: #ffffff;
  --bg-surface-elev: #f8fafc;
  --bg-surface-hover: #f1f5f9;

  --color-primary: #2563eb;
  --color-primary-hover: #1d4ed8;
  --color-primary-soft: rgba(37, 99, 235, 0.10);
  --color-accent: #0284c7;

  --color-success: #16a34a;
  --color-success-soft: rgba(22, 163, 74, 0.12);

  --color-warning: #d97706;
  --color-warning-soft: rgba(217, 119, 6, 0.12);

  --color-danger: #dc2626;
  --color-danger-soft: rgba(220, 38, 38, 0.10);
  --destructive: var(--color-danger);

  --border-subtle: #dbe4ee;
  --border-strong: #c7d3e2;

  --text-primary: #0f172a;
  --text-secondary: #334155;
  --text-muted: #64748b;
  --text-disabled: #94a3b8;

  --nav-hover: #eef4fb;
  --nav-active: #e8f0ff;

  --focus-ring: rgba(37, 99, 235, 0.28);
}

@media (prefers-color-scheme: dark) {
  :root[data-theme="system"] {
    color-scheme: dark;

    --bg-main: #0b1424;
    --bg-app: #0f1b2d;
    --bg-surface: #132238;
    --bg-surface-elev: #182a44;
    --bg-surface-hover: #1d3150;

    --color-primary: #3b82f6;
    --color-primary-hover: #2563eb;
    --color-primary-soft: rgba(59, 130, 246, 0.14);
    --color-accent: #0ea5e9;

    --color-success: #22c55e;
    --color-success-soft: rgba(34, 197, 94, 0.14);

    --color-warning: #f59e0b;
    --color-warning-soft: rgba(245, 158, 11, 0.14);

    --color-danger: #ef4444;
    --color-danger-soft: rgba(239, 68, 68, 0.14);
    --destructive: var(--color-danger);

    --border-subtle: rgba(148, 163, 184, 0.16);
    --border-strong: rgba(148, 163, 184, 0.28);

    --text-primary: #f8fafc;
    --text-secondary: #cbd5e1;
    --text-muted: #94a3b8;
    --text-disabled: #64748b;

    --nav-hover: rgba(148, 163, 184, 0.08);
    --nav-active: rgba(59, 130, 246, 0.14);

    --focus-ring: rgba(96, 165, 250, 0.38);
  }
}

@media (prefers-color-scheme: light) {
  :root[data-theme="system"] {
    color-scheme: light;

    --bg-main: #f4f7fb;
    --bg-app: #f7f9fc;
    --bg-surface: #ffffff;
    --bg-surface-elev: #f8fafc;
    --bg-surface-hover: #f1f5f9;

    --color-primary: #2563eb;
    --color-primary-hover: #1d4ed8;
    --color-primary-soft: rgba(37, 99, 235, 0.10);
    --color-accent: #0284c7;

    --color-success: #16a34a;
    --color-success-soft: rgba(22, 163, 74, 0.12);

    --color-warning: #d97706;
    --color-warning-soft: rgba(217, 119, 6, 0.12);

    --color-danger: #dc2626;
    --color-danger-soft: rgba(220, 38, 38, 0.10);
    --destructive: var(--color-danger);

    --border-subtle: #dbe4ee;
    --border-strong: #c7d3e2;

    --text-primary: #0f172a;
    --text-secondary: #334155;
    --text-muted: #64748b;
    --text-disabled: #94a3b8;

    --nav-hover: #eef4fb;
    --nav-active: #e8f0ff;

    --focus-ring: rgba(37, 99, 235, 0.28);
  }
}

7. Global CSS and token rules
7.1 Use CSS variables as the single runtime source of truth

All theme-aware components must consume tokens from CSS variables.

7.2 Simplify global theme plumbing

If the current @theme block is not necessary for actual Tailwind token generation in the app, remove unnecessary indirection and keep the runtime token source simple and explicit.

7.3 Apply base colors globally

Ensure html and body use:

background: var(--bg-main)

color: var(--text-primary)

7.4 Add missing semantic tokens if needed

If required during implementation, add semantic tokens for:
- soft info background
- soft success background
- soft warning background
- soft danger background
- muted fill
- table header background
- overlay background

Add only if needed. Do not create a bloated token set.

8. Layout and rendering improvements
8.1 Root layout

Refactor root layout to remain lightweight and server-first.

8.2 Providers

Do not mount unnecessary client providers at the app root if they are only needed for authenticated/product experiences.

8.3 Public pages

Ensure public pages remain as lean as possible for:
- TTFB
- crawlability
- hydration cost
- SEO friendliness

8.4 Product layout

Keep product-specific providers in the product layout tree.

8.5 Theme bootstrap

Ensure the theme bootstrap strategy works for:
- authenticated product pages
- public landing page
- public marketing pages
- auth pages if themed

9. SEO requirements

All improvements must remain 100% SEO friendly.

9.1 Do not convert public pages into unnecessary client components

Keep public pages server-rendered whenever possible.

9.2 Do not add heavy providers to public pages unnecessarily

Avoid client runtime overhead on pages that do not need it.

9.3 Preserve metadata quality

Do not break current metadata behavior. Improve it if needed, but do not regress.

9.4 Avoid CLS and theme flash

The theme system must not cause visible layout shift or theme flicker on first paint.

9.5 Avoid injecting non-essential client-side theme work too late

Theme selection must happen before visible paint.

10. Global component refactor requirements

Refactor the shared components below so all of them fully align with the Relitrue token system and visual direction.

10.1 Tabs
Problems to solve

Current tabs feel too template-like

Active and inactive states are acceptable but not refined enough

Need a more premium product-panel relationship

Tabs must work beautifully in both light and dark modes

Required changes
- Keep tabs lightweight and custom
- Keep current API shape unless there is a compelling reason to improve accessibility semantics
- Improve visual hierarchy
- Ensure active tab feels connected to content panel
- Ensure inactive tabs are clearly secondary but still readable
- Use semantic token-driven backgrounds and borders
- Avoid over-using shadows
- Keep horizontal scroll behavior on narrow screens
- Preserve accessibility roles

Implementation intent
- Active tab: surface background, stronger text, clean border continuity into content panel
- Inactive tab: surface-elev background, softer text, hover state using hover token or surface-hover token
- Content panel: cleaner connection with tab row
- Keep a sober enterprise look

10.2 Badge
Problems to solve
- Current badge variants use too much hardcoded color logic
- Some badge variants depend on dark: styling instead of fully relying on theme tokens
- Visual consistency is incomplete

Required changes
- Refactor badges to use semantic token-driven styling
- Keep variants:
  - default
  - success
  - warning
  - destructive
  - secondary
- Ensure all badges look good in both light and dark
- Use soft surfaces, not noisy chips
- Keep them compact and readable

Required semantic behavior
- success uses success tokens
- warning uses warning tokens
- destructive uses danger/destructive tokens
- secondary uses neutral muted tokens
- default uses neutral surface styling

10.3 Alert
Problems to solve
- Current alerts rely on hardcoded blue/amber classes
- Alert system should feel more product-native and less ad hoc
- Dark/light consistency must improve

Required changes
- Refactor alerts to use semantic tokens
- Keep variants:
  - default
  - info
  - warning
  - destructive
- Ensure title/description spacing remains clean
- Ensure warning/destructive/info alerts are readable but not visually harsh
- Keep alerts suitable for billing, compliance, onboarding, and product notices

Visual direction
- Alerts must feel like trustworthy product feedback, not marketing banners
- Borders and backgrounds should be soft and controlled
- No oversaturated color blocks

10.4 Input
Problems to solve
- Input is functional but can be improved visually
- Focus treatment should align more tightly with the global token system
- Disabled state can be more intentional

Required changes
- Keep inputs lightweight
- Keep current API and forwardRef
- Improve focus styling using --focus-ring
- Ensure borders, surfaces, and placeholders align globally
- Improve disabled/readOnly visuals so they feel deliberate and accessible
- Preserve contrast in both themes

Required styling behavior
- default background should be a true surface
- focus ring must be token-driven
- invalid state support should remain compatible with field-level validation UI
- placeholder must remain subdued but legible

10.5 Skeleton
Problems to solve
- Skeleton is acceptable but too generic
- Should feel more integrated with the final surface hierarchy

Required changes
- Keep it lightweight
- Keep pulse animation unless there is a better equally lightweight approach
- Ensure skeleton color uses the correct elevated/muted surface
- Make sure it looks good in both themes

10.6 Toast
Problems to solve
- Toast styling is functional but not fully aligned with the refined token system
- Current use of bg-(--color-danger)/10 style patterns is directionally fine but should be standardized
- Toast dismissal hover styles are not theme-native enough

Required changes
- Keep the current toast architecture lightweight
- Do not introduce external toast libraries
- Keep toast provider and context
- Refine the visual system for:
  - error
  - success
  - info
- Use semantic surfaces and borders
- Improve dismiss button hover treatment
- Ensure spacing and shadow feel premium but restrained
- Ensure toasts read well on both dark and light backgrounds

Additional requirements
- Toasts should not visually dominate the UI
- Toasts must remain clearly legible and actionable
- Keep bottom-right positioning unless existing UX rules require otherwise

11. Additional shared component targets

The following shared product-facing components must also be aligned with the new system:

11.1 Buttons
Standardize:
- primary
- secondary
- neutral border buttons
- ghost/icon buttons where present

Requirements
- primary uses primary tokens
- secondary uses surface-elev + border + text-primary
- hover states use surface-hover or primary-hover depending on variant
- disabled states must be consistent and subdued
- focus ring must be token-driven

11.2 Cards
Standardize:
- card root
- header
- content
- footer

Requirements
- cards should rely on surface separation rather than heavy shadows
- borders must be subtle but visible
- elevated areas should feel intentional
- content spacing must stay consistent
- cards must feel clean in both themes

11.3 Dialog / Modal
Standardize all dialogs to:
- use token-based surfaces
- use consistent overlay darkness
- use consistent border and spacing
- use consistent header/footer structure
- avoid arbitrary theme mismatches

Requirements
- maintain accessibility
- maintain close behavior logic
- improve visual refinement only, unless structural fixes are needed
- overlay should feel strong enough without becoming too heavy

11.4 Tables
All tables, especially in billing and admin areas, must follow the global visual system.

Requirements
- sticky headers must use a clear surface
- row hover states must use surface-hover
- borders must be subtle and consistent
- text hierarchy must be clean
- actions column menus must feel integrated with the same surface system

11.5 Navigation
Refactor navigation styling to use semantic nav tokens.

Requirements
- use --nav-hover
- use --nav-active
- remove unnecessary runtime color-mix usage in hot-path nav states where tokenized equivalents are sufficient
- keep collapsed sidebar behavior
- keep mobile drawer behavior
- preserve current logic and permissions

11.6 Progress bars
Ensure progress bars and usage bars use semantic colors:
- primary for safe/normal
- warning near threshold
- destructive at cap or failure state

Avoid inconsistent ad hoc coloring.

12. Product UI refinement targets
The following product sections must be visually aligned with the new system:

12.1 App sidebar
Refactor sidebar to:
- use tokenized hover and active states
- improve brand box styling
- improve selected/current workspace state
- preserve performance and current behavior

Use:
- --nav-hover
- --nav-active
- --bg-surface-elev

12.2 App header
Refine:
- header surface
- icon buttons
- current workspace block
- notifications button
- invitation badge styling
- user menu trigger styling

12.3 Workspace Settings
The workspace settings area must feel more premium and consistent:
- tabs
- containers
- cards
- forms
- loading states
- data tables

12.4 Billing page
This page is high priority and must be polished thoroughly because it reflects trust and payments.

Required areas:
- plan and subscription card
- usage card
- next invoice card
- payment method card
- invoice table
- invoice actions dropdown
- edit billing modal
- change plan dialog
- confirm upgrade/downgrade modal
- payment declined modal
- billing profile section

Billing-specific visual goals
- enterprise billing clarity
- sober financial SaaS presentation
- strong hierarchy for totals and status
- clean warnings and payment failure states
- premium modal polish without heavy visual effects

13. Public marketing pages and landing page
This EPIC must also cover the public site.

Required goals
- landing page and public pages must share the same brand system as the product
- they must still feel marketing-friendly, but not disconnected from the app
- public pages must remain lightweight and SEO-safe
- typography, buttons, color palette, and spacing must align with the same design language

Requirements
- no random separate palette for public pages
- no inconsistent button system
- no mismatched light/dark behavior
- ensure public pages still look excellent when visited by logged-in users
- ensure appearance switching does not create visual mismatch between public and product views

14. Accessibility requirements
All updated components must preserve or improve accessibility.

Mandatory requirements
- maintain sufficient color contrast
- preserve focus visibility
- preserve keyboard accessibility
- preserve aria roles where already used correctly
- do not reduce readability in dark mode
- do not create low-contrast inactive tabs, muted text, or disabled states

Specific focus requirements
- all focusable controls must have a visible token-driven focus treatment
- do not remove focus styles
- do not rely on color alone for important destructive/warning contexts where text labels already exist

15. Performance requirements
This implementation must stay extremely lightweight.

Mandatory performance rules
- no heavy animation libraries
- no CSS-in-JS
- no new large UI library dependency
- no unnecessary provider nesting
- no unnecessary re-renders in shared primitives
- no expensive runtime clor calculations in repeated hot-path component rendering if equivalent semantic tokens can replace them
- keep styling primarily in CSS variables + utility classes
- preserve current straightforward component APIs where possible

Do not
- over-engineer the token system
- add unnecessary abstraction layers
- add a design system framework on top of the current codebase

16. File-level implementation targets
At minimum, review and update the following areas if applicable:
- app/layout.tsx
- public-facing layout files
- product layout files
- theme bootstrap strategy
- theme provider usage
- globals.css
- any Tailwind v4 theme/token glue if still needed
- sidebar component
- header component
- button component(s)
- card component(s)
- tabs component
- badge component
- alert component
- input component
- skeleton component
- toast component
- dialog component
- billing page and billing-related shared components
- landing page and public CTA/button sections
- auth page wrappers if they are theme-aware
- And all the components that are used in the product keeping the current behavior and logic, and keeping the same format for components.

17. Specific implementation directives
17.1 Sidebar
Replace ad hoc hover/active background generation with tokenized states:
- hover:bg-(--nav-hover)
- bg-(--nav-active)

17.2 Secondary buttons
Use a consistent neutral button treatment:
- border
- surface-elev background
- text-primary
- hover to surface-hover

17.3 Surface hierarchy
Ensure the entire app consistently uses:
- bg-main for outer canvas
- bg-app for major app shell regions
- bg-surface for base cards/panels
- bg-surface-elev for elevated or highlighted internal surfaces
- bg-surface-hover for hoverable surface interactions

17.4 Reduce inconsistent direct color usage
Replace component-level hardcoded green/amber/blue/red styles with semantic token-driven equivalents where practical.

17.5 Keep business logic intact
All changes must preserve:
- billing behavior
- plan changes
- invoice actions
- modal flows
- session behavior
- permissions
- route guards
- workspace switching
- product interactions

17.6 Preserve current responsive behavior
Do not regress:
- sidebar mobile drawer
- tab scrolling on small screens
- billing table behavior
- dialogs on smaller screens

18. QA and verification requirements
Visual QA

Verify the entire application in:
- dark mode
- light mode
- system mode
- desktop
- tablet
- mobile

Scope coverage
Verify at minimum:
- landing page
- pricing page
- privacy page
- terms page
- sign-in flow
- product shell
- requests page
- workspace settings
- billing
- dialogs
- tables
- toasts
- forms
- empty states
- skeleton states

UX QA
Verify:
- no visual flicker on initial load
- no theme mismatch between pages
- no low-contrast text
- no inconsistent surface colors
- no broken hover/focus states
- no SEO regressions on public pages

19. Acceptance criteria
- This EPIC is complete only when all of the following are true:
- The app uses one coherent global theme system across public and product pages.
- Dark mode feels premium, readable, and layered, not muddy or overly black.
- Light mode feels structured and refined, not flat or washed out.
- Public and product pages share the same brand language.
- Shared primitives consume semantic tokens consistently.
- Buttons, cards, tabs, badges, alerts, inputs, dialogs, skeletons, toasts, tables, and navigation all align visually.
- Hardcoded ad hoc color styling is removed or minimized.
- Sidebar and header states use tokenized nav/background behavior.
- Billing pages feel premium, trustworthy, and enterprise-grade.
- No business logic regressions are introduced.
- No SEO regressions are introduced.
- Public pages remain lightweight and server-friendly.
- Theme flash and hydration mismatch are avoided.
- Accessibility is preserved or improved.
- The implementation remains lightweight and maintainable.

20. Delivery expectations
Implement this EPIC as a cohesive global front-end foundation improvement, not as isolated local tweaks.
The final result must feel like a unified design system upgrade across the whole Relitrue application.

Prioritize:
- consistency
- clarity
- maintainability
- performance
- SEO safety
- enterprise-grade visual trust
- minimal but effective refinement

Do not leave the implementation half-tokenized or partially migrated. The result must be globally consistent.
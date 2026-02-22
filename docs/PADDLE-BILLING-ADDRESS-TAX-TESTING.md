# Billing address & optional Tax ID — How to test

## Prerequisites

1. Run migrations and generate Prisma client:
   ```bash
   npx prisma migrate deploy
   npx prisma generate
   ```
2. Paddle sandbox configured (see `docs/PADDLE-LOCAL-CHECKOUT.md` for ngrok + webhook).

## Local + ngrok

1. Start app and tunnel:
   ```bash
   pnpm dev
   pnpm tunnel   # or: npx ngrok http https://localhost:3000
   ```
2. In Paddle sandbox: set Default payment link and webhook URL to your ngrok URL.
3. Sign in to the app, open **Workspace Settings → Billing**.
4. **Checkout without billing**
   - Click **Change plan** → **Upgrade** (e.g. to Starter) → **Continue to checkout** (no billing form).
   - You should be redirected to Paddle checkout and complete purchase (no Tax ID required).
5. **Checkout with billing (no business)**
   - **Change plan** → **Upgrade** → **Add billing address (optional)**.
   - Select country (e.g. **Costa Rica**), fill postal code, city, address line 1.
   - **Continue to checkout** → complete on Paddle. No business/tax step; purchase should succeed.
6. **Checkout with business but no Tax ID (e.g. Costa Rica)**
   - **Add billing address** → Country **Costa Rica**, fill required fields.
   - Enable **Buying as a business (optional)** → enter Company name, leave Tax/VAT blank.
   - **Continue to checkout** → purchase should succeed (we do not send business to Paddle for CR).
7. **Tax ID validation error + retry**
   - Add billing, country e.g. **Germany**, enable **Buying as a business**, enter a **invalid** VAT number.
   - **Continue to checkout** → expect inline message "Tax identifier could not be validated".
   - Click **Continue without Tax ID** → checkout should proceed (retry without Tax ID).
8. **Billing profile persistence**
   - After saving billing once, open **Change plan** again → **Add billing address** → form should be prefilled from saved profile.

## Production

1. Deploy with env: `PADDLE_ENVIRONMENT=production`, correct price IDs and API key.
2. In Paddle production: approve domain, set Default payment link and webhook.
3. Repeat flows above (checkout without billing, with address, with business in EU/UK, retry without Tax ID).
4. Confirm webhook updates subscription and plan shows correctly after payment.

## Acceptance criteria (quick check)

- [ ] User in Costa Rica can purchase Starter/Pro **without** entering Tax ID (no dead end).
- [ ] Billing address can be collected, saved, and passed to Paddle (address_id on transaction).
- [ ] If user chooses business and enters a Tax ID Paddle can’t validate, app shows **Continue without Tax ID** and checkout completes.
- [ ] Webhook still updates subscription/plan; no auth redirects or CSRF issues.

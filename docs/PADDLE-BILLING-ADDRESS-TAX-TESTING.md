# Billing address & optional Tax ID — How to test

## Tax not calculating (e.g. US + ZIP 21103)

If the user selects **United States**, enters a taxable ZIP (e.g. **21103**), clicks **Continue**, but **Tax** stays **$0.00**, check Paddle Dashboard configuration:

1. **Checkout > Sales tax settings**
   - Ensure sales tax is **enabled** for your account.
   - For US: ensure **United States** (and state-level rules if required) is configured.
2. **Catalog > Product / Price**
   - For the price used at checkout (e.g. Starter monthly), ensure **Tax** is enabled and the price uses a tax mode that supports location-based calculation (e.g. “Automatic based on location” or tax-inclusive/exclusive as needed).
3. **Test mode**
   - In sandbox, confirm tax rules are set for the same regions you test (US, state, or ZIP).

The app creates the transaction **without** an address; Paddle Checkout collects country and ZIP in “Your details” and recalculates tax when the user clicks **Continue**. If tax still does not appear after that, the cause is almost always Dashboard tax configuration or the price’s tax settings.

## Google Pay / Apple Pay not showing

The app does **not** restrict payment methods; Paddle shows all methods that are **enabled in your Paddle account** and **valid for the transaction** (currency, country, device). If Google Pay or Apple Pay do not appear:

1. **Paddle Dashboard** — Check **Checkout** or **Payment methods** and ensure **Google Pay** and **Apple Pay** are enabled for your account and (if applicable) for the product/price.
2. **Device / browser** — Apple Pay typically appears only in **Safari** or on **Apple devices**; Google Pay in **Chrome** (and often not on iPhone/iPad). Test in the expected browser/device.
3. **Sandbox** — In test mode, some wallet options may be limited; confirm in Paddle docs or support for sandbox availability.

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

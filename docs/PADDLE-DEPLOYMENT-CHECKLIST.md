# Paddle checkout – deployment checklist

When you deploy (e.g. Vercel) and use **Upgrade** from the billing tab, the app redirects to your checkout page (e.g. `https://your-app.vercel.app/checkout?_ptxn=...`). If you see **"Something went wrong"** and a 403 **"Failed to retrieve JWT"** in the Network tab for `transaction-checkout`, the domain hosting that page is **not approved** in Paddle.

Paddle only allows checkout to run on domains you have explicitly approved. The transaction is created successfully (so it may show as "Incomplete" in Paddle), but when Paddle.js loads on your checkout URL and asks Paddle for the checkout session (JWT), Paddle returns 403 until the domain is approved.

## Checklist for each deployed URL (preview or production)

Do this for **every** domain that will host the checkout page (e.g. each Vercel preview or your production domain).

### 1. Add the domain in Paddle (website / domain approval)

- **Sandbox:** https://sandbox-vendors.paddle.com  
  Go to **Checkout** (or **Developer tools**) and find **Request website approval** / **Request domain approval** (wording may vary). Add the **exact domain** that will serve the checkout page, e.g.:
  - `saas-blueprint-three.vercel.app`  
  or the full origin, e.g.:
  - `https://saas-blueprint-three.vercel.app`
- **Production:** https://vendors.paddle.com → [Request domain approval](https://vendors.paddle.com/request-domain-approval)

Add each deployment hostname you use (e.g. `your-app.vercel.app`, `www.yourdomain.com`).

### 2. Set the Default payment link to that URL

- **Sandbox:** https://sandbox-vendors.paddle.com → **Checkout** → **Checkout settings**  
- **Production:** https://vendors.paddle.com → **Checkout** → **Checkout settings**

Set **Default payment link** to your checkout page URL, e.g.:

- `https://saas-blueprint-three.vercel.app/checkout`

This must match the domain you approved in step 1. Our API does not override this; Paddle uses it when generating `checkout.url` for new transactions.

### 3. Environment variables on the deployment

Ensure these are set in Vercel (or your host) for the same environment (sandbox vs production):

- `PADDLE_API_KEY` – server-side (sandbox or live key).
- `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` – client-side token from Paddle (Dashboard → Developer tools → Authentication). Use the **sandbox** client token for test/preview, **live** for production.
- `PADDLE_ENVIRONMENT` – `sandbox` or `production`.
- Price IDs and webhook URL as per your existing Paddle setup.

## Quick fix for your current 403

For **https://saas-blueprint-three.vercel.app**:

1. In **Paddle sandbox** (https://sandbox-vendors.paddle.com), add the domain `saas-blueprint-three.vercel.app` (or the full checkout URL) under Checkout → **Request website approval** / domain approval.
2. In **Checkout** → **Checkout settings**, set **Default payment link** to:  
   `https://saas-blueprint-three.vercel.app/checkout`
3. Retry **Upgrade** from the billing tab on that deployment.

After the domain is approved and the default link is set, the "Failed to retrieve JWT" error should stop and the overlay should open.

## Still getting 403 after domain approval?

If the domain is approved and the default payment link is set but you still see "Failed to retrieve JWT", check the following.

### 1. Client token: sandbox vs live and source

The **transaction** is created with your **server** API key (sandbox). Paddle.js must use a **sandbox client token** (`test_...`) for that same account so Paddle can issue the JWT.

- Get the token from **Paddle Sandbox**: https://sandbox-vendors.paddle.com/authentication-v2  
  Open the **Client-side tokens** tab → create or copy a token. It must start with **`test_`** (not `live_`).
- Do **not** use an API key in the frontend; use only a client-side token.
- The token must be from the **same** Paddle sandbox account that has the approved domain and the API key you use for checkout.

### 2. Domain spelling

Approved domain must match the URL exactly. A typo (e.g. **sass**-blueprint instead of **saas**-blueprint) will cause 403. In **Checkout → Website approval → Domain approval**, the listed domain should be exactly the host of your checkout (e.g. `saas-blueprint-three.vercel.app`).

### 3. Vercel environment variables

- In Vercel, set `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` for the environment you’re testing: **Production** and/or **Preview** (if you use branch deployments).
- After adding or changing any env var, **redeploy** (trigger a new build and deploy) so the app picks up the new value.

### 4. Token not revoked

If the client-side token was revoked in Paddle (Developer tools → Authentication → Client-side tokens), create a new token and update `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, then redeploy.

### 5. Verify what the app sees

On the checkout page you should see either “Using sandbox token (test_…).” or “Using live token (live_…).”. If you see “Check that your token starts with test_ or live_” or “Checkout is not configured”, the token is missing or wrong in the deployed app — fix the env var and redeploy. Call **GET /api/billing/paddle/checkout-config** in the browser (e.g. `https://your-app.vercel.app/api/billing/paddle/checkout-config`). It returns `clientTokenSet`, `tokenPrefix` (test_/live_), and `environment` so you can confirm the deployment has a client token and it matches your Paddle environment.

## References

- [Paddle: Pass a transaction to a checkout](https://developer.paddle.com/build/transactions/pass-transaction-checkout) – default payment link and domain approval.
- [Paddle: Checkout URL domain has not yet been approved](https://developer.paddle.com/errors/transactions/transaction_checkout_url_domain_is_not_approved).

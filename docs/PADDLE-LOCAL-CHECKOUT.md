# Paddle checkout and webhooks on local dev (ngrok)

Paddle **does not support localhost**. Checkout and webhooks need a **public URL**. Use ngrok to expose your local app over HTTPS.

This project runs the dev server with **HTTPS** (`next dev --experimental-https`), so the app is at **https://localhost:3000**. The tunnel must point at that HTTPS URL.

## 1. Run your app and ngrok

**Terminal 1 — app (HTTPS on port 3000):**

```bash
pnpm dev
```

**Terminal 2 — tunnel (forwards to https://localhost:3000):**

```bash
# Option A: use the project script (connects to local HTTPS)
pnpm tunnel
```

Or install ngrok and run it directly:

```bash
# Option B: install from https://ngrok.com/download then:
ngrok http https://localhost:3000
```

Note the **Forwarding** URL ngrok prints, e.g. `https://abc123.ngrok-free.app`. Use this as `YOUR-NGROK-URL` below.

## 2. Paddle sandbox setup

Open **Paddle sandbox**: https://sandbox-vendors.paddle.com/

### Checkout (payment link + website approval)

1. **Website approval**  
   **Checkout** → **Request website approval**.  
   Add your ngrok host, e.g. `abc123.ngrok-free.app` (or the full URL if the form asks). Save.

2. **Default payment link**  
   **Checkout** → **Checkout settings** → **Default payment link**:  
   `https://YOUR-NGROK-URL/checkout`  
   Example: `https://abc123.ngrok-free.app/checkout`

### Webhook (so subscription events reach your app)

1. Go to **Developer tools** → **Notifications** (or **Webhooks**).
2. Add a **Notification destination** (or edit existing):
   - **Destination URL:**  
     `https://YOUR-NGROK-URL/api/billing/paddle/webhook`  
     Example: `https://abc123.ngrok-free.app/api/billing/paddle/webhook`
   - Subscribe to the events you need. The app processes:
     - **Subscriptions:** `subscription.created`, `subscription.updated`, `subscription.activated`, `subscription.canceled`, `subscription.past_due`, `subscription.resumed`, `subscription.trialing`.
     - **Transactions:** `transaction.completed`.
     - **Billing profile (Paddle dashboard → customer address/business):** `address.created`, `address.updated`, `business.created`, `business.updated`.  
     If you enable these address/business events, changes made by a Paddle administrator to a customer’s address or business (VAT/company) in the Paddle dashboard are synced into the app’s billing profile automatically.
3. Copy the **Signing secret** and set it in your local `.env`:
   ```env
   PADDLE_WEBHOOK_SECRET="your_signing_secret_from_paddle"
   ```
4. Restart `pnpm dev` after changing `.env`.

## 3. Use the ngrok URL

- In the browser, open **https://YOUR-NGROK-URL** (not localhost).
- Sign in → Workspace Settings → Billing → **Change plan** → complete checkout.
- Paddle will send webhooks to `https://YOUR-NGROK-URL/api/billing/paddle/webhook`; your local server will receive them and update the subscription so the Billing tab shows the new plan.

## Quick reference: URLs to set in Paddle (local)

| Purpose              | URL |
|----------------------|-----|
| Default payment link | `https://YOUR-NGROK-URL/checkout` |
| Webhook destination  | `https://YOUR-NGROK-URL/api/billing/paddle/webhook` |

Replace `YOUR-NGROK-URL` with your ngrok Forwarding URL (e.g. `abc123.ngrok-free.app`).

## Notes

- **Free ngrok:** the URL changes each time you restart ngrok. Update both the Default payment link and the Webhook destination URL in Paddle when it changes (or use a reserved ngrok domain).
- Use **sandbox** credentials in `.env`: `PADDLE_API_KEY`, `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `PADDLE_WEBHOOK_SECRET`, and sandbox price IDs.
- For production, use your real domain; no tunnel. Webhook URL: `https://yourdomain.com/api/billing/paddle/webhook`.

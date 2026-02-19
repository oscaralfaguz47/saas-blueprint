# Paddle checkout on local dev (ngrok)

Paddle **does not support localhost** for checkout. The "Failed to retrieve JWT" / "Something went wrong" overlay happens because Paddle requires a **public, approved domain** for the page that loads Paddle.js.

Use a tunnel (e.g. ngrok) to expose your local app and point Paddle at that URL.

## 1. Run your app and ngrok

```bash
# Terminal 1: start the app (HTTP is fine; ngrok will expose it over HTTPS)
pnpm dev
```

```bash
# Terminal 2: expose port 3000 (install ngrok first: https://ngrok.com/download)
ngrok http 3000
```

Note the public URL ngrok shows, e.g. `https://abc123.ngrok-free.app`.

## 2. Paddle sandbox setup

1. Open **Paddle sandbox**: https://sandbox-vendors.paddle.com/
2. **Website approval**  
   Go to **Checkout** → **Request website approval** (or similar).  
   Add your ngrok domain, e.g. `https://abc123.ngrok-free.app` (or just the host `abc123.ngrok-free.app` if the form asks for a domain). Save.
3. **Default payment link**  
   Go to **Checkout** → **Checkout settings**.  
   Set **Default payment link** to:  
   `https://YOUR-NGROK-SUBDOMAIN.ngrok-free.app/checkout`  
   (replace with your actual ngrok URL). Save.

## 3. Use the ngrok URL

- Open your app in the browser at **https://YOUR-NGROK-SUBDOMAIN.ngrok-free.app** (not localhost).
- Sign in, go to Workspace Settings → Billing, click **Upgrade to Starter**.
- You should be redirected to `https://....ngrok-free.app/checkout?_ptxn=...` and the Paddle overlay should open.

## Notes

- Free ngrok URLs change each time you restart ngrok (unless you use a reserved domain). Update the Default payment link and website approval in Paddle when the URL changes.
- Keep `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` and `PADDLE_API_KEY` set to your **sandbox** credentials.
- For production, use your real domain (e.g. `https://yourdomain.com/checkout`) in Paddle; no tunnel needed.

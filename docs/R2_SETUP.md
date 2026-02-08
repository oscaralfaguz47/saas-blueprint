# Cloudflare R2 — Workspace logo upload

Workspace logos are stored in **Cloudflare R2** (S3-compatible). The app uses a **signed URL** flow: the server issues a short-lived PUT URL; the client uploads directly to R2; then the client calls a confirm endpoint so the server saves the object key.

---

## 1. Create an R2 bucket

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com).
2. Go to **R2 Object Storage** (left sidebar).
3. Click **Create bucket**.
4. Name it (e.g. `saas-blueprint-assets`). **Private** access is recommended (no public read).
5. Create the bucket.

---

## 2. Create R2 API tokens

1. In the R2 section, open **Manage R2 API Tokens** (or **Overview** → **Manage R2 API Tokens**).
2. Click **Create API token**.
3. Name it (e.g. `saas-blueprint-upload`).
4. Permissions: **Object Read & Write** (or **Edit** for the bucket).
5. Specify the bucket (or leave “Apply to all buckets”).
6. Create the token. You will see:
   - **Access Key ID**
   - **Secret Access Key**  
   Copy these; the secret is shown only once.

---

## 3. Get your Account ID

1. In the Cloudflare Dashboard, open any zone or the **R2** overview.
2. In the right sidebar, find **Account ID** (or go to **Workers & Pages** → **Overview** for the ID).
3. Copy the **Account ID**.

---

## 4. Set environment variables

Add these to your `.env` (and to Vercel / your host’s env config):

```bash
# Cloudflare R2 (workspace logo upload)
R2_ACCOUNT_ID=<your-account-id>
R2_ACCESS_KEY_ID=<access-key-id-from-step-2>
R2_SECRET_ACCESS_KEY=<secret-access-key-from-step-2>
R2_BUCKET_NAME=<your-bucket-name>
```

| Variable | Description |
|----------|-------------|
| `R2_ACCOUNT_ID` | Cloudflare account ID (step 3). |
| `R2_ACCESS_KEY_ID` | R2 API token access key (step 2). |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret (step 2). |
| `R2_BUCKET_NAME` | Name of the R2 bucket (step 1). |

If these are **not** set, logo upload endpoints return **503** with a message that logo upload is not configured.

---

## 5. CORS policy (required for browser uploads)

The browser sends a **PUT** request directly to R2. The bucket must allow your app’s origin via CORS, or you’ll see:

`Access to fetch at '...r2.cloudflarestorage.com' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header`

**Steps:**

1. In [Cloudflare Dashboard](https://dash.cloudflare.com) go to **R2** → your bucket.
2. Open **Settings** for the bucket.
3. Find **CORS policy** and add a rule (or edit the default).

Use a single rule that allows your app origin and the methods/headers needed for presigned PUT:

**Development (localhost):**

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"]
  }
]
```

**Production (replace with your app URL):**

```json
[
  {
    "AllowedOrigins": ["https://your-app.vercel.app", "https://app.yourdomain.com"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"]
  }
]
```

To allow both localhost and production in one config, add multiple entries in the array or list both origins in `AllowedOrigins` if your dashboard supports it (e.g. `["http://localhost:3000", "https://your-app.vercel.app"]`).

Save the CORS policy. After that, logo upload from the browser should work.

---

## 6. Dependencies

The app uses the AWS S3 SDK (R2 is S3-compatible). These are already in `package.json`:

- `@aws-sdk/client-s3`
- `@aws-sdk/s3-request-presigner`

No extra install step unless you removed them.

---

## 7. Object key format

Stored object keys follow:

```
tenants/{tenantId}/logo/{randomId}.{ext}
```

Example: `tenants/abc123/logo/9f8a7c6d.webp`

Only the **object key** is stored in the database (`Tenant.logoObjectKey`). Public URLs (if you add a public bucket or a proxy later) are **not** stored.

---

## 8. Optional: allow public read (e.g. for avatars)

If you want to **serve** logos (e.g. in the UI), you can:

- Create an R2 **custom domain** and enable public access for the bucket, or
- Use **Cloudflare Workers** (or your app) to proxy GET requests to R2 with a signed GET URL.

The app **serves** logos by redirecting to a short-lived signed GET URL (`GET /api/tenant/[tenantId]/logo`). If the logo does not load (e.g. 500), check the server console for `[r2-logo] getPresignedGetUrl failed:` and ensure all four R2 env vars are set and the API token has **Object Read & Write**.

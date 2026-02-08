# Environment Configuration Guide

This document describes how to configure different environments (demo and production) for the SaaS Blueprint.

## Environment Overview

| Environment | Branch | Purpose | Auto-Deploy | Database |
|------------|--------|---------|-------------|----------|
| **Demo** | `demo` | Testing & Staging | ✅ Yes | Separate DB |
| **Production** | `main` | Live Application | ⚠️ Manual | Production DB |

## Environment Variables

### Required Variables

These variables **must** be set for all environments:

```bash
# Database
DATABASE_URL=<postgres-connection-string>
DATABASE_DIRECT_URL=<direct-postgres-connection-string>

# Authentication
NEXTAUTH_URL=<app-url>
NEXTAUTH_SECRET=<32-char-secret>

# Optional but recommended
NODE_ENV=production  # or "development" for demo
```

### Environment-Specific Variables

#### Demo Environment

Set these in Vercel with **Preview** environment selected:

```bash
# Use demo database
DATABASE_URL=postgresql://user:pass@demo-db-host/demo-db
DATABASE_DIRECT_URL=postgresql://user:pass@demo-db-host/demo-db

# Demo domain
NEXTAUTH_URL=https://demo.yourdomain.com

# Demo OAuth apps (optional, can use same as prod for testing)
GOOGLE_CLIENT_ID=<demo-google-client-id>
GOOGLE_CLIENT_SECRET=<demo-google-client-secret>

# Demo email (optional)
EMAIL_FROM=demo@yourdomain.com
RESEND_API_KEY=<demo-resend-key>

# Demo admin
BOOTSTRAP_ADMIN_EMAIL=demo-admin@yourdomain.com

# Optional: workspace logo upload (Cloudflare R2)
# See docs/R2_SETUP.md for full steps
# R2_ACCOUNT_ID=
# R2_ACCESS_KEY_ID=
# R2_SECRET_ACCESS_KEY=
# R2_BUCKET_NAME=
```

#### Production Environment

Set these in Vercel with **Production** environment selected:

```bash
# Production database
DATABASE_URL=postgresql://user:pass@prod-db-host/prod-db
DATABASE_DIRECT_URL=postgresql://user:pass@prod-db-host/prod-db

# Production domain
NEXTAUTH_URL=https://app.yourdomain.com

# Production OAuth apps
GOOGLE_CLIENT_ID=<prod-google-client-id>
GOOGLE_CLIENT_SECRET=<prod-google-client-secret>

# Production email
EMAIL_FROM=noreply@yourdomain.com
RESEND_API_KEY=<prod-resend-key>

# Production admin
BOOTSTRAP_ADMIN_EMAIL=admin@yourdomain.com
PLATFORM_ADMIN_EMAILS=admin1@yourdomain.com,admin2@yourdomain.com
```

## Vercel Configuration

### Setting Environment Variables in Vercel

1. Go to your project in Vercel Dashboard
2. Navigate to **Settings → Environment Variables**
3. Add each variable with the appropriate environment:
   - **Production**: Only for `main` branch
   - **Preview**: For all branches except `main` (includes `demo`)
   - **Development**: For local development (optional)

### Example: Setting DATABASE_URL

1. Click **"Add New"**
2. **Key**: `DATABASE_URL`
3. **Value**: Your connection string
4. **Environment**: Select **Preview** for demo, **Production** for production
5. Click **"Save"**

## Database Setup

### Demo Database

1. **Create a separate PostgreSQL database** for demo
2. **Run migrations**:
   ```bash
   DATABASE_URL=<demo-db-url> pnpm prisma migrate deploy
   ```
3. **Seed (optional)**:
   ```bash
   DATABASE_URL=<demo-db-url> pnpm prisma db seed
   ```

### Production Database

1. **Create production PostgreSQL database**
2. **Run migrations** (manually, before first deployment):
   ```bash
   DATABASE_URL=<prod-db-url> pnpm prisma migrate deploy
   ```
3. **DO NOT seed** production database automatically

## OAuth Configuration

### Google OAuth

For each environment, create separate OAuth apps:

1. **Demo OAuth App**:
   - Authorized redirect URIs: `https://demo.yourdomain.com/api/auth/callback/google`
   - Use demo credentials in demo environment

2. **Production OAuth App**:
   - Authorized redirect URIs: `https://app.yourdomain.com/api/auth/callback/google`
   - Use production credentials in production environment

### GitHub OAuth (if used)

Same process - create separate OAuth apps for demo and production.

## Email Configuration

### Resend Setup

1. **Demo Environment**:
   - Create a separate Resend API key (optional)
   - Use demo domain for `EMAIL_FROM`

2. **Production Environment**:
   - Use production Resend API key
   - Use production domain for `EMAIL_FROM`

## Domain Configuration

### Demo Domain

1. In Vercel: **Settings → Domains**
2. Add domain: `demo.yourdomain.com`
3. Configure DNS as instructed
4. Assign to **Preview** deployments

### Production Domain

1. Add domain: `app.yourdomain.com` (or your main domain)
2. Configure DNS
3. Assign to **Production** deployments

## Deployment Workflow

### Demo Deployment (Automatic)

1. Push to `demo` branch
2. Vercel automatically:
   - Builds the project
   - Runs migrations (if configured)
   - Deploys to preview environment
   - Uses preview environment variables

### Production Deployment (Manual)

1. **Prepare**:
   - Ensure all tests pass
   - Review demo deployment
   - Run migrations manually if needed

2. **Deploy**:
   - Merge to `main` branch
   - Or manually deploy from Vercel dashboard
   - Vercel uses production environment variables

## Environment Validation

The app validates environment variables on startup. If required variables are missing:

- **Development**: Shows warning, continues
- **Production**: Fails fast, prevents deployment

To skip validation during build (if needed):
```bash
SKIP_ENV_VALIDATION=true
```

## Best Practices

### ✅ Do

- Use separate databases for demo and production
- Use different OAuth credentials
- Test in demo before production
- Keep production secrets secure
- Use strong `NEXTAUTH_SECRET` (32+ characters)
- Document all environment variables

### ❌ Don't

- Use production database in demo
- Commit `.env` files
- Share secrets between environments
- Deploy to production without testing in demo
- Use weak secrets
- Skip environment variable validation

## Troubleshooting

### Variables Not Loading

**Issue**: Environment variables not available at runtime

**Solutions**:
1. Verify variables are set for correct environment (Production/Preview)
2. Redeploy after adding variables
3. Check variable names (case-sensitive)
4. Verify no typos in variable names

### Database Connection Issues

**Issue**: Cannot connect to database

**Solutions**:
1. Verify `DATABASE_URL` is correct
2. Check database allows connections from Vercel IPs
3. Verify connection pooling settings
4. Check `DATABASE_DIRECT_URL` for migrations

### OAuth Redirect Errors

**Issue**: OAuth redirect fails

**Solutions**:
1. Verify `NEXTAUTH_URL` matches deployment URL
2. Check OAuth app redirect URIs match
3. Ensure OAuth credentials are correct for environment

## Security Checklist

- [ ] All secrets are in Vercel environment variables (not in code)
- [ ] Production secrets are different from demo
- [ ] `NEXTAUTH_SECRET` is 32+ characters, randomly generated
- [ ] Database credentials are secure
- [ ] OAuth credentials are environment-specific
- [ ] Email API keys are separate for demo/prod
- [ ] No secrets in git history
- [ ] Environment variables are reviewed regularly

## Migration Checklist

When setting up a new environment:

- [ ] Create database
- [ ] Set all required environment variables
- [ ] Configure OAuth apps
- [ ] Set up email service
- [ ] Run database migrations
- [ ] Seed database (demo only)
- [ ] Configure domain
- [ ] Test deployment
- [ ] Verify health check endpoint
- [ ] Test authentication flow
- [ ] Verify all features work

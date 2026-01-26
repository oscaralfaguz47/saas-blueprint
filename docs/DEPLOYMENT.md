# Deployment Guide - Vercel

This guide covers deploying the SaaS Blueprint to Vercel with multiple environments (demo and production).

## Overview

The project is configured to deploy to Vercel with:
- **Demo Environment**: Automatically deploys from the `demo` branch
- **Production Environment**: Configured for the `main` branch (deploy manually)

## Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **GitHub Repository**: Your code must be in a GitHub repository
3. **PostgreSQL Database**: You'll need separate databases for demo and production
4. **Environment Variables**: Prepare all required environment variables

## Initial Setup

### 1. Connect Repository to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **"Add New Project"**
3. Import your GitHub repository
4. Vercel will automatically detect Next.js

### 2. Configure Project Settings

**Framework Preset**: Next.js  
**Root Directory**: `./` (root)  
**Build Command**: `pnpm build` (or use `vercel-build` for auto-migrations)  
**Output Directory**: `.next` (default)  
**Install Command**: `pnpm install`

### 3. Environment Variables

You need to configure environment variables for each environment. Go to **Settings → Environment Variables** in your Vercel project.

#### Required Variables (All Environments)

```
DATABASE_URL=<your-postgres-connection-string>
DATABASE_DIRECT_URL=<your-direct-postgres-connection-string>
NEXTAUTH_URL=<your-app-url>
NEXTAUTH_SECRET=<generate-with-openssl-rand-base64-32>
```

#### Optional Variables

```
# OAuth Providers
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
GITHUB_CLIENT_ID=<your-github-client-id>
GITHUB_CLIENT_SECRET=<your-github-client-secret>

# Email
EMAIL_FROM=<no-reply@yourdomain.com>
RESEND_API_KEY=<your-resend-api-key>

# Platform Admin
BOOTSTRAP_ADMIN_EMAIL=<admin@example.com>
PLATFORM_ADMIN_EMAILS=<admin1@example.com,admin2@example.com>
```

#### Environment-Specific Variables

In Vercel, you can set variables for specific environments:
- **Production**: Only applies to `main` branch
- **Preview**: Applies to all branches except `main`
- **Development**: Applies to local development

**Recommendation**: Set different `DATABASE_URL` and `NEXTAUTH_URL` for demo vs production.

## Environment Configuration

### Demo Environment (Branch: `demo`)

1. **Create a Preview Environment in Vercel**:
   - Go to **Settings → Git**
   - Ensure "Production Branch" is set to `main`
   - Preview deployments will use the `demo` branch

2. **Set Demo-Specific Variables**:
   - In **Environment Variables**, add variables with **Preview** environment selected
   - Use a separate database for demo
   - Set `NEXTAUTH_URL` to your demo domain (e.g., `https://demo.yourdomain.com`)

3. **Database Setup for Demo**:
   ```bash
   # Run migrations on demo database
   DATABASE_URL=<demo-database-url> pnpm prisma migrate deploy
   
   # Seed demo database (optional)
   DATABASE_URL=<demo-database-url> pnpm prisma db seed
   ```

### Production Environment (Branch: `main`)

1. **Configure Production Branch**:
   - In **Settings → Git**, set "Production Branch" to `main`
   - Production deployments will only trigger on `main` branch

2. **Set Production Variables**:
   - Add variables with **Production** environment selected
   - Use your production database
   - Set `NEXTAUTH_URL` to your production domain (e.g., `https://app.yourdomain.com`)

3. **Database Setup for Production**:
   ```bash
   # Run migrations on production database
   DATABASE_URL=<production-database-url> pnpm prisma migrate deploy
   
   # DO NOT seed production database automatically
   ```

## Deployment Process

### Automatic Deployments

Vercel automatically deploys when you push to:
- **`demo` branch**: Creates a preview deployment
- **`main` branch**: Creates a production deployment (if auto-deploy is enabled)

### Manual Deployments

1. **Via Vercel Dashboard**:
   - Go to **Deployments** tab
   - Click **"Redeploy"** on any deployment
   - Or click **"Deploy"** → Select branch → Deploy

2. **Via Vercel CLI**:
   ```bash
   # Install Vercel CLI
   npm i -g vercel
   
   # Login
   vercel login
   
   # Deploy to preview
   vercel
   
   # Deploy to production
   vercel --prod
   ```

### Database Migrations

Migrations run automatically during build if you use the `vercel-build` script:

```json
{
  "scripts": {
    "vercel-build": "prisma generate && prisma migrate deploy && next build"
  }
}
```

**Important**: 
- Migrations run in **read-only mode** (`migrate deploy`) - they don't create new migrations
- Always test migrations locally first
- For production, consider running migrations manually before deployment

## Build Configuration

The project uses the following build configuration:

### `vercel.json`

- **Build Command**: `pnpm build` (or `pnpm vercel-build` for auto-migrations)
- **Install Command**: `pnpm install`
- **Framework**: Next.js (auto-detected)
- **Region**: `iad1` (US East)
- **Function Timeout**: 30 seconds for API routes

### Build Process

1. **Install Dependencies**: `pnpm install`
2. **Generate Prisma Client**: `prisma generate` (via postinstall)
3. **Run Migrations**: `prisma migrate deploy` (if using `vercel-build`)
4. **Build Next.js**: `next build`

## Domain Configuration

### Demo Domain

1. Go to **Settings → Domains**
2. Add your demo domain (e.g., `demo.yourdomain.com`)
3. Configure DNS as instructed by Vercel
4. Assign domain to **Preview** deployments

### Production Domain

1. Add your production domain (e.g., `app.yourdomain.com`)
2. Configure DNS
3. Assign domain to **Production** deployments

## Monitoring & Logs

### Viewing Logs

1. **Function Logs**: Go to **Deployments** → Click a deployment → **Functions** tab
2. **Build Logs**: Click on a deployment → **Build Logs**
3. **Runtime Logs**: **Logs** tab in Vercel dashboard

### Health Check

The app includes a health check endpoint:
- **URL**: `/api/health` or `/health`
- **Response**: `{ status: "ok", timestamp: "...", environment: "..." }`

Use this for:
- Uptime monitoring
- Deployment verification
- Load balancer health checks

## Best Practices

### 1. Environment Separation

- ✅ Use separate databases for demo and production
- ✅ Use different OAuth app credentials
- ✅ Use different email sending services (or separate Resend API keys)
- ✅ Never use production data in demo environment

### 2. Security

- ✅ Never commit `.env` files
- ✅ Use Vercel's environment variables (encrypted at rest)
- ✅ Rotate secrets regularly
- ✅ Use strong `NEXTAUTH_SECRET` (32+ characters)
- ✅ Enable Vercel's DDoS protection

### 3. Database

- ✅ Use connection pooling (Vercel Postgres, Neon, Supabase)
- ✅ Use `DATABASE_DIRECT_URL` for migrations
- ✅ Test migrations on demo before production
- ✅ Backup production database regularly

### 4. Performance

- ✅ Enable Vercel Analytics
- ✅ Use Edge Functions for static content
- ✅ Optimize images with Next.js Image
- ✅ Monitor function execution time

### 5. CI/CD

- ✅ Run tests before deployment (add to GitHub Actions)
- ✅ Use preview deployments for testing
- ✅ Review build logs before promoting to production
- ✅ Use deployment protection for production

## Troubleshooting

### Build Failures

**Issue**: Prisma client not generated
```bash
# Solution: Ensure postinstall script runs
# Check package.json has: "postinstall": "prisma generate"
```

**Issue**: Migration failures
```bash
# Solution: Run migrations manually first
pnpm prisma migrate deploy
```

### Runtime Errors

**Issue**: Database connection errors
- Check `DATABASE_URL` is set correctly
- Verify database allows connections from Vercel IPs
- Check connection pooling settings

**Issue**: Environment variables not loading
- Verify variables are set for correct environment (Production/Preview)
- Check variable names match exactly (case-sensitive)
- Redeploy after adding new variables

### Performance Issues

**Issue**: Slow API responses
- Check function timeout settings in `vercel.json`
- Optimize database queries
- Use connection pooling
- Consider caching strategies

## Rollback

If a deployment fails:

1. Go to **Deployments** tab
2. Find the last working deployment
3. Click **"..."** → **"Promote to Production"**

Or via CLI:
```bash
vercel rollback [deployment-url]
```

## Next Steps

1. ✅ Set up demo environment
2. ✅ Configure production environment (when ready)
3. ✅ Set up monitoring (Vercel Analytics, Sentry, etc.)
4. ✅ Configure custom domains
5. ✅ Set up automated backups for production database

## Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Prisma Deployment](https://www.prisma.io/docs/guides/deployment)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)

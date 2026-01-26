# Quick Start: Deploy to Vercel

This is a quick reference guide for deploying the SaaS Blueprint to Vercel. For detailed information, see [DEPLOYMENT.md](./DEPLOYMENT.md).

## 🚀 5-Minute Setup

### Step 1: Prepare Your Repository

```bash
# Ensure your code is pushed to GitHub
git add .
git commit -m "Prepare for Vercel deployment"
git push origin main
```

### Step 2: Connect to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **"Add New Project"**
3. Import your GitHub repository
4. Vercel will auto-detect Next.js ✅

### Step 3: Configure Build Settings

Vercel should auto-detect these, but verify:

- **Framework Preset**: Next.js
- **Build Command**: `pnpm build` (or `pnpm vercel-build` for auto-migrations)
- **Output Directory**: `.next` (default)
- **Install Command**: `pnpm install`

### Step 4: Set Environment Variables

Go to **Settings → Environment Variables** and add:

#### For Demo (Preview Environment)

Click **"Add New"** and set:

| Variable | Value | Environment |
|----------|-------|-------------|
| `DATABASE_URL` | Your demo DB connection string | **Preview** |
| `DATABASE_DIRECT_URL` | Your demo DB direct connection | **Preview** |
| `NEXTAUTH_URL` | `https://your-demo-url.vercel.app` | **Preview** |
| `NEXTAUTH_SECRET` | Generate with `openssl rand -base64 32` | **Preview** |

#### For Production (Production Environment)

Same variables, but:
- Use production database
- Set `NEXTAUTH_URL` to your production domain
- Select **Production** environment

### Step 5: Deploy Demo

1. Create and push to `demo` branch:
   ```bash
   git checkout -b demo
   git push origin demo
   ```

2. Vercel will automatically:
   - Detect the push
   - Build the project
   - Deploy to preview environment
   - Use preview environment variables

3. Check deployment status in Vercel dashboard

### Step 6: Set Up Database

Before first deployment, set up your database:

```bash
# For demo database
DATABASE_URL=<demo-db-url> pnpm prisma migrate deploy

# Optional: Seed demo database
DATABASE_URL=<demo-db-url> pnpm prisma db seed
```

### Step 7: Verify Deployment

1. Visit your deployment URL (shown in Vercel dashboard)
2. Check health endpoint: `https://your-url.vercel.app/api/health`
3. Test authentication flow
4. Verify all features work

## 🎯 Next Steps

- ✅ Configure custom domain (see [DEPLOYMENT.md](./DEPLOYMENT.md))
- ✅ Set up production environment (when ready)
- ✅ Configure OAuth providers
- ✅ Set up email service
- ✅ Review [ENVIRONMENTS.md](./ENVIRONMENTS.md) for advanced configuration

## ⚠️ Common Issues

### Build Fails

**Problem**: Prisma client not found
**Solution**: Ensure `postinstall` script runs: `"postinstall": "prisma generate"`

### Database Connection Error

**Problem**: Cannot connect to database
**Solution**: 
- Verify `DATABASE_URL` is correct
- Check database allows connections from Vercel
- Verify connection pooling settings

### Environment Variables Not Loading

**Problem**: Variables undefined at runtime
**Solution**:
- Verify variables are set for correct environment (Preview/Production)
- Redeploy after adding variables
- Check variable names (case-sensitive)

## 📚 Full Documentation

- [Complete Deployment Guide](./DEPLOYMENT.md)
- [Environment Configuration](./ENVIRONMENTS.md)
- [Main README](../README.md)

## 🆘 Need Help?

1. Check [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions
2. Review Vercel logs in dashboard
3. Check [Vercel Documentation](https://vercel.com/docs)

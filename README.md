# SaaS Blueprint

A production-ready, multi-tenant SaaS boilerplate built with Next.js, TypeScript, Prisma, and NextAuth. Designed to be a solid foundation for building scalable SaaS applications.

## 🏗️ Architecture

### Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript (strict mode)
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: NextAuth.js (JWT strategy)
- **Styling**: Tailwind CSS v4
- **Validation**: Zod
- **Package Manager**: pnpm

### Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── (auth)/            # Auth route group
│   ├── (product)/         # Product/app route group
│   ├── (public)/          # Public marketing pages
│   ├── api/               # API Route Handlers
│   └── layout.tsx          # Root layout
├── components/            # React components
│   ├── app/               # App-specific components
│   ├── auth/              # Auth components
│   ├── ui/                # Reusable UI components
│   └── theme/             # Theme components
├── lib/                   # Shared utilities
│   ├── api-response.ts    # API response helpers
│   ├── validations.ts     # Zod schemas
│   ├── errors.ts          # Error handling
│   └── env.ts             # Environment validation
└── server/                # Server-only code
    ├── auth-options.ts    # NextAuth configuration
    ├── db.ts              # Prisma client
    ├── security/          # Authorization logic
    └── services/          # Business logic services
```

### Key Features

- ✅ **Multi-tenant Architecture**: Isolated tenant data with RBAC
- ✅ **Role-Based Access Control**: Tenant and platform-level permissions
- ✅ **Authentication**: NextAuth with Google OAuth and Magic Links
- ✅ **Audit Logging**: Comprehensive audit trail for all actions
- ✅ **Type Safety**: Full TypeScript with strict mode
- ✅ **Input Validation**: Zod schemas for all API inputs
- ✅ **Error Handling**: Standardized error responses
- ✅ **Security Headers**: Production-ready security configuration
- ✅ **Theme Support**: Dark/light mode with system preference

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- pnpm (recommended) or npm/yarn
- PostgreSQL database

### Installation

1. **Clone the repository**

```bash
git clone <your-repo-url>
cd saas-blueprint
```

2. **Install dependencies**

```bash
pnpm install
```

3. **Set up environment variables**

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required variables:
- `DATABASE_URL`: PostgreSQL connection string
- `DATABASE_DIRECT_URL`: Direct connection for migrations
- `NEXTAUTH_URL`: Your app URL (e.g., `http://localhost:3000`)
- `NEXTAUTH_SECRET`: JWT secret (generate with `openssl rand -base64 32`)

4. **Set up the database**

```bash
# Run migrations
pnpm prisma migrate dev

# Seed the database (optional)
pnpm prisma db seed
```

5. **Start the development server**

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📚 Core Concepts

### Multi-Tenancy

The application uses a **shared database, isolated data** approach:

- Each user belongs to one or more **Tenants** (workspaces)
- All tenant-scoped data is filtered by `tenantId`
- Users can have different roles in different tenants
- Platform admins can manage all tenants

### Authentication Flow

1. User signs in via NextAuth (Google OAuth or Magic Link)
2. On first login, a default tenant is automatically created
3. User is assigned the "Owner" role in their default tenant
4. Session contains user ID (JWT strategy)

### Authorization

The app uses a **permission-based RBAC system**:

- **Tenant Permissions**: Scoped to a specific tenant
  - `tenant.users.read`, `tenant.users.invite`, `tenant.users.manage`
  - `tenant.roles.manage`, `tenant.settings.manage`
  - `tenant.audit.read`, `tenant.billing.manage`

- **Platform Permissions**: Platform-wide admin permissions
  - `admin.tenants.read`, `admin.tenants.suspend`
  - `admin.users.read`, `admin.users.block`
  - `admin.sessions.revoke`, `admin.mfa.reset`
  - `admin.billing.read`, `admin.audit.read`

### Default Roles

**Tenant Roles** (created per tenant):
- **Owner**: Full access to tenant
- **Admin**: Manage users and settings (no billing)
- **Member**: Read-only access

**Platform Roles** (global):
- **PlatformAdmin**: Full platform access
- **SupportAdmin**: Support operations
- **BillingOps**: Billing management
- **ReadOnlySupport**: Read-only support access

## 🔒 Security

### Best Practices Implemented

- ✅ Server-side authorization checks
- ✅ Tenant data isolation enforced at database level
- ✅ Input validation with Zod
- ✅ SQL injection protection (Prisma)
- ✅ XSS protection (React)
- ✅ CSRF protection (NextAuth)
- ✅ Security headers (HSTS, X-Frame-Options, etc.)
- ✅ Token-based authentication (JWT)
- ✅ Audit logging for sensitive operations

### Environment Variables Security

- Never commit `.env` files
- Use `.env.example` as a template
- Validate required env vars at startup
- Use strong secrets for `NEXTAUTH_SECRET`

## 📝 API Development

### Creating API Routes

All API routes are in `src/app/api/**/route.ts`. Follow these patterns:

```typescript
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody, yourSchema } from "@/lib/validations";

export const GET = withErrorHandler(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  // Your logic here
  
  return apiSuccess({ data: "your data" });
});

export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const body = await parseBody(req, yourSchema);
  
  // Your logic here
  
  return apiSuccess({ id: "created-id" }, 201);
});
```

### Validation

Use Zod schemas in `src/lib/validations.ts`:

```typescript
export const yourSchema = z.object({
  name: z.string().min(1).max(100),
  email: emailSchema,
});
```

## 🗄️ Database

### Migrations

```bash
# Create a new migration
pnpm prisma migrate dev --name your_migration_name

# Apply migrations in production
pnpm prisma migrate deploy
```

### Prisma Studio

View and edit data in a GUI:

```bash
pnpm prisma studio
```

## 🧪 Development

### Code Quality

- **ESLint**: Configured with Next.js rules
- **Prettier**: Code formatting
- **TypeScript**: Strict mode enabled

```bash
# Lint
pnpm lint

# Format
pnpm format

# Type check
pnpm tsc --noEmit
```

### Project Conventions

- **Server Components by default**: Use `"use client"` only when needed
- **No Server Actions**: Use API Route Handlers instead
- **Tenant isolation**: Always filter by `tenantId`
- **Type safety**: Avoid `any`, use proper types
- **Error handling**: Use `withErrorHandler` wrapper

## 📦 Deployment

### Vercel Deployment

This project is configured for deployment on Vercel with support for multiple environments.

#### Quick Start

1. **Connect Repository**:
   - Push your code to GitHub
   - Import project in [Vercel Dashboard](https://vercel.com/dashboard)
   - Vercel will auto-detect Next.js configuration

2. **Configure Environments**:
   - **Demo**: Automatically deploys from `demo` branch
   - **Production**: Configured for `main` branch (manual deploy)

3. **Set Environment Variables**:
   - Go to **Settings → Environment Variables**
   - Add all required variables (see `.env.example`)
   - Set different values for Preview (demo) and Production

4. **Deploy**:
   - Push to `demo` branch for automatic demo deployment
   - Deploy `main` branch manually when ready for production

#### Build, migrations, and seed

- **Migrations** run on every deploy (via `vercel-build`).
- **Seed** runs only when `RUN_SEED` is set to a truthy value (`1`, `true`, `yes`, `on`) in Vercel environment variables. Normally leave it unset; set it temporarily when you need to update system catalogs (permissions, roles, plans), then unset after a successful deploy.
- See **[Vercel: Migrations and Seed](docs/ops/vercel-seeding.md)** for the full flow and STRICT_SEED behavior.

#### Detailed Documentation

- **[Deployment Guide](docs/DEPLOYMENT.md)**: Complete Vercel deployment instructions
- **[Environment Configuration](docs/ENVIRONMENTS.md)**: How to configure demo and production environments

### Environment Variables

Required variables for all environments:
- `DATABASE_URL`: PostgreSQL connection string
- `DATABASE_DIRECT_URL`: Direct connection for migrations
- `NEXTAUTH_URL`: Your app URL
- `NEXTAUTH_SECRET`: JWT secret (generate with `openssl rand -base64 32`)

See `.env.example` for the complete list.

### Database

Use a managed PostgreSQL service:
- [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres)
- [Neon](https://neon.tech)
- [Supabase](https://supabase.com)
- [Railway](https://railway.app)

**Important**: Use separate databases for demo and production environments.

## 🤝 Contributing

This is a boilerplate project. Feel free to:

1. Fork the repository
2. Create your feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🙏 Acknowledgments

Built with:
- [Next.js](https://nextjs.org)
- [Prisma](https://www.prisma.io)
- [NextAuth.js](https://next-auth.js.org)
- [Tailwind CSS](https://tailwindcss.com)
- [Zod](https://zod.dev)

---

**Note**: This is a boilerplate. Customize it for your specific needs, add your branding, and build your SaaS! 🚀

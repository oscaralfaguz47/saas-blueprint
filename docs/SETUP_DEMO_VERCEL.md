# Paso a Paso: Configurar Demo en Vercel

Guía detallada para configurar **solo el ambiente demo** en Vercel usando el branch `demo`.

## 📋 Paso 1: Crear el Proyecto en Vercel

### 1.1. En la pantalla "New Project"

**Lo que ves:**
- Repository: `oscaralfaguz47/saas-blueprint`
- Branch: `main` (auto-seleccionado) ✅ **Esto está bien, déjalo así**
- Framework Preset: `Next.js` ✅
- Root Directory: `./` ✅
- Project Name: `saas-blueprint` ✅

**Acción:**
1. ✅ **NO cambies el branch a `demo` aquí** - déjalo en `main`
2. ✅ Verifica que Framework Preset sea `Next.js`
3. ✅ Verifica que Root Directory sea `./`
4. ✅ Puedes cambiar el Project Name si quieres (ej: `saas-blueprint-demo`)

### 1.2. Expandir "Build and Output Settings" (Opcional)

Haz clic en la flecha para expandir y verifica:

- **Build Command**: `pnpm build` (o déjalo en auto)
- **Output Directory**: `.next` (default)
- **Install Command**: `pnpm install` (o déjalo en auto)

**Nota:** Si no ves estas opciones, está bien. Vercel las detectará automáticamente.

### 1.3. NO configures Environment Variables todavía

**No expandas** "Environment Variables" todavía. Lo haremos después.

### 1.4. Haz clic en "Deploy"

Haz clic en el botón negro **"Deploy"** en la parte inferior.

**Esto creará el proyecto y hará un primer deployment desde `main`** - está bien, lo usaremos solo para configurar.

---

## 📋 Paso 2: Esperar el Primer Build

1. Verás una pantalla de "Building..."
2. Este build puede fallar (es normal, faltan variables de entorno)
3. **No te preocupes**, lo configuraremos después

---

## 📋 Paso 3: Configurar Git Integration (IMPORTANTE)

Una vez creado el proyecto:

### 3.1. Ir a Settings

1. En el dashboard de Vercel, ve a tu proyecto
2. Haz clic en **"Settings"** (arriba)
3. En el menú lateral, haz clic en **"Git"**

### 3.2. Configurar Production Branch

**Lo que necesitas hacer:**

1. En la sección **"Production Branch"**:
   - Verás que está configurado como `main`
   - **Déjalo así por ahora** ✅
   - Esto significa que solo `main` hará deployments de "Production"
   - Todos los demás branches (incluido `demo`) harán "Preview" deployments

2. **Esto es perfecto** porque:
   - `demo` branch → Preview deployments (tu ambiente demo)
   - `main` branch → Production deployments (no lo usaremos todavía)

### 3.3. Verificar Auto-Deploy

Asegúrate de que:
- ✅ **"Automatic deployments from Git"** esté activado
- ✅ Esto hará que cada push a `demo` cree un nuevo preview deployment

---

## 📋 Paso 4: Configurar Variables de Entorno para Demo

### 4.1. Ir a Environment Variables

1. En **Settings**, haz clic en **"Environment Variables"** (menú lateral)

### 4.2. Agregar Variables para Preview (Demo)

**IMPORTANTE:** Todas las variables deben tener **"Preview"** seleccionado.

Haz clic en **"Add New"** y agrega cada una:

#### Variable 1: DATABASE_URL
- **Key**: `DATABASE_URL`
- **Value**: Tu connection string de PostgreSQL para demo
- **Environment**: ✅ Selecciona **"Preview"** (NO Production)
- **Add**

#### Variable 2: DATABASE_DIRECT_URL
- **Key**: `DATABASE_DIRECT_URL`
- **Value**: Tu direct connection string (mismo que DATABASE_URL si usas pooling)
- **Environment**: ✅ Selecciona **"Preview"**
- **Add**

#### Variable 3: NEXTAUTH_URL
- **Key**: `NEXTAUTH_URL`
- **Value**: `https://saas-blueprint-xxxxx.vercel.app` (usa la URL que Vercel te dio, o tu dominio demo)
- **Environment**: ✅ Selecciona **"Preview"**
- **Add**

#### Variable 4: NEXTAUTH_SECRET
- **Key**: `NEXTAUTH_SECRET`
- **Value**: Genera uno con: `openssl rand -base64 32` (o usa el que ya tienes)
- **Environment**: ✅ Selecciona **"Preview"**
- **Add**

#### Variables Opcionales (si las usas):

**GOOGLE_CLIENT_ID** (Preview)
**GOOGLE_CLIENT_SECRET** (Preview)
**EMAIL_FROM** (Preview)
**RESEND_API_KEY** (Preview)
**BOOTSTRAP_ADMIN_EMAIL** (Preview)

### 4.3. Verificar

Deberías ver todas las variables listadas con el tag **"Preview"** al lado.

**NO agregues variables con "Production" todavía** - solo Preview.

---

## 📋 Paso 5: Preparar el Branch Demo

### 5.1. Crear Branch Demo (si no existe)

En tu terminal local:

```bash
# Asegúrate de estar en main y tener los últimos cambios
git checkout main
git pull origin main

# Crea el branch demo
git checkout -b demo

# Push el branch a GitHub
git push origin demo
```

### 5.2. Verificar en GitHub

Ve a tu repositorio en GitHub y verifica que el branch `demo` existe.

---

## 📋 Paso 6: Configurar Base de Datos Demo

### 6.1. Crear Base de Datos

Crea una base de datos PostgreSQL separada para demo (usando Neon, Supabase, Railway, etc.)

### 6.2. Ejecutar Migraciones

En tu terminal local:

```bash
# Conecta a tu base de datos demo
DATABASE_URL="postgresql://user:pass@host/demo-db" pnpm prisma migrate deploy

# Opcional: Seed la base de datos demo
DATABASE_URL="postgresql://user:pass@host/demo-db" pnpm prisma db seed
```

**Nota:** Usa la misma `DATABASE_URL` que pusiste en las variables de entorno de Vercel.

---

## 📋 Paso 7: Trigger Deployment desde Demo

### Opción A: Push a Demo Branch

```bash
# Asegúrate de estar en demo
git checkout demo

# Haz cualquier cambio pequeño (o solo push)
echo "# Demo deployment" >> README.md
git add .
git commit -m "Trigger demo deployment"
git push origin demo
```

### Opción B: Redeploy desde Vercel

1. Ve a **"Deployments"** en Vercel
2. Encuentra cualquier deployment anterior
3. Haz clic en **"..."** → **"Redeploy"**
4. En el modal, cambia el branch a `demo`
5. Haz clic en **"Redeploy"**

---

## 📋 Paso 8: Verificar Deployment

### 8.1. Ver Build Logs

1. Ve a **"Deployments"** en Vercel
2. Haz clic en el deployment más reciente
3. Revisa los **"Build Logs"**
4. Deberías ver:
   - ✅ `pnpm install` ejecutándose
   - ✅ `prisma generate` ejecutándose
   - ✅ `next build` ejecutándose
   - ✅ Build exitoso

### 8.2. Verificar Deployment

1. Una vez completado, verás una URL tipo: `https://saas-blueprint-xxxxx.vercel.app`
2. Haz clic en la URL para abrirla
3. Deberías ver tu aplicación funcionando

### 8.3. Health Check

Visita: `https://tu-url.vercel.app/api/health`

Deberías ver:
```json
{
  "status": "ok",
  "timestamp": "...",
  "environment": "production"
}
```

### 8.4. Probar Autenticación

1. Intenta hacer sign in
2. Verifica que la autenticación funcione
3. Verifica que puedas crear un tenant/workspace

---

## 📋 Paso 9: Configurar Dominio Personalizado (Opcional)

Si quieres un dominio personalizado para demo:

1. Ve a **Settings → Domains**
2. Haz clic en **"Add"**
3. Ingresa tu dominio (ej: `demo.tudominio.com`)
4. Sigue las instrucciones de DNS
5. Asigna el dominio a **Preview** deployments

---

## ✅ Checklist Final

- [ ] Proyecto creado en Vercel
- [ ] Git integration configurado (main = production, demo = preview)
- [ ] Variables de entorno configuradas para **Preview**
- [ ] Branch `demo` creado y pusheado a GitHub
- [ ] Base de datos demo creada y migrada
- [ ] Deployment desde `demo` branch exitoso
- [ ] Health check funciona
- [ ] Autenticación funciona
- [ ] Aplicación demo funcionando correctamente

---

## 🎯 Resumen de Configuración

**Lo que tienes ahora:**

- ✅ **Demo Environment**: 
  - Branch: `demo`
  - Tipo: Preview Deployment
  - Variables: Preview environment
  - Auto-deploy: ✅ Activado

- ⏸️ **Production Environment**:
  - Branch: `main`
  - Tipo: Production Deployment
  - Variables: No configuradas todavía
  - Auto-deploy: ⏸️ No activado (no harás deploy todavía)

**Cada vez que hagas push a `demo`:**
- Vercel automáticamente creará un nuevo Preview Deployment
- Usará las variables de entorno de "Preview"
- Desplegará tu aplicación demo

**Para producción (cuando estés listo):**
- Configura variables de entorno para "Production"
- Haz deploy manual desde `main` branch
- O activa auto-deploy para `main` cuando estés listo

---

## 🆘 Troubleshooting

### Build Falla

**Error:** "Prisma Client not found"
**Solución:** Verifica que `postinstall` script esté en `package.json`

**Error:** "Environment variables missing"
**Solución:** Verifica que todas las variables estén configuradas para **Preview**

### Deployment No Se Crea Automáticamente

**Problema:** Push a `demo` no crea deployment
**Solución:** 
1. Verifica que "Automatic deployments" esté activado en Settings → Git
2. Verifica que el branch `demo` exista en GitHub
3. Verifica que el webhook de Vercel esté configurado en GitHub

### Variables No Se Cargan

**Problema:** Variables undefined en runtime
**Solución:**
1. Verifica que variables estén configuradas para **Preview**
2. Redeploy después de agregar variables
3. Verifica nombres de variables (case-sensitive)

---

## 📚 Siguiente Paso

Una vez que demo esté funcionando:
- Revisa [DEPLOYMENT.md](./DEPLOYMENT.md) para configuración avanzada
- Cuando estés listo para producción, configura variables de "Production"

# Troubleshooting Deployment en Vercel

## ❌ Build Falla: "Missing required environment variables"

### Problema

El build falla con un error sobre variables de entorno faltantes durante el build.

### Causa

Las variables de entorno en Vercel están disponibles en **runtime**, no durante el **build phase**. Si el código intenta validar variables durante el build, fallará.

### Solución

✅ **Ya está corregido** - El código ahora valida variables solo en runtime, no durante el build.

Si aún ves este error:

1. **Verifica que tienes las últimas versiones** de:
   - `src/server/db.ts`
   - `src/lib/env.ts`

2. **Asegúrate de que `vercel.json` tenga**:
   ```json
   {
     "build": {
       "env": {
         "SKIP_ENV_VALIDATION": "true"
       }
     }
   }
   ```

3. **Las variables de entorno deben estar configuradas** en Vercel (Settings → Environment Variables), pero el build puede completarse sin ellas. El error aparecerá en **runtime** si faltan.

---

## ❌ Build Falla: "Prisma Client not found"

### Problema

```
Error: Cannot find module '@prisma/client'
```

### Solución

1. Verifica que `package.json` tenga:
   ```json
   {
     "scripts": {
       "postinstall": "prisma generate",
       "build": "prisma generate && next build"
     }
   }
   ```

2. Verifica que `prisma` esté en `devDependencies`

3. Si el problema persiste, agrega en `vercel.json`:
   ```json
   {
     "buildCommand": "pnpm install && pnpm prisma generate && pnpm build"
   }
   ```

---

## ❌ Build Falla: TypeScript Errors

### Problema

Errores de TypeScript durante el build.

### Solución

1. **Ejecuta localmente**:
   ```bash
   pnpm tsc --noEmit
   ```

2. **Corrige los errores** antes de hacer push

3. **Verifica** que `tsconfig.json` esté correcto

---

## ❌ Runtime Error: "Cannot connect to database"

### Problema

La aplicación se despliega pero falla al conectarse a la base de datos.

### Solución

1. **Verifica `DATABASE_URL`**:
   - Ve a Vercel → Settings → Environment Variables
   - Verifica que `DATABASE_URL` esté configurada para el ambiente correcto (Preview/Production)
   - Verifica que la URL sea correcta

2. **Verifica conexión de base de datos**:
   - Asegúrate de que tu base de datos permita conexiones desde Vercel
   - Si usas Neon/Supabase, verifica que la IP esté permitida
   - Verifica que el usuario/password sean correctos

3. **Verifica `DATABASE_DIRECT_URL`**:
   - Debe ser la misma que `DATABASE_URL` si no usas connection pooling
   - Si usas pooling, `DATABASE_DIRECT_URL` debe ser la conexión directa

---

## ❌ Runtime Error: "NEXTAUTH_SECRET is missing"

### Problema

Error de autenticación porque `NEXTAUTH_SECRET` no está configurado.

### Solución

1. **Genera un secret**:
   ```bash
   openssl rand -base64 32
   ```

2. **Agrégalo en Vercel**:
   - Settings → Environment Variables
   - Key: `NEXTAUTH_SECRET`
   - Value: El secret generado
   - Environment: Preview (para demo) o Production

3. **Redeploy** después de agregar la variable

---

## ❌ Deployment No Se Crea Automáticamente

### Problema

Haces push a `demo` branch pero no se crea un deployment.

### Solución

1. **Verifica Git Integration**:
   - Vercel → Settings → Git
   - Verifica que "Automatic deployments from Git" esté activado

2. **Verifica Webhook de GitHub**:
   - Ve a tu repositorio en GitHub
   - Settings → Webhooks
   - Verifica que el webhook de Vercel esté activo

3. **Verifica Branch**:
   - Asegúrate de que el branch `demo` exista en GitHub
   - Verifica que hayas hecho push: `git push origin demo`

4. **Trigger Manual**:
   - Ve a Vercel → Deployments
   - Haz clic en "Create Deployment"
   - Selecciona branch `demo`

---

## ❌ Variables de Entorno No Se Cargan

### Problema

Las variables de entorno están configuradas pero son `undefined` en runtime.

### Solución

1. **Verifica Environment**:
   - Variables para **Preview** deployments solo funcionan en branches que no sean `main`
   - Variables para **Production** solo funcionan en `main` branch
   - Asegúrate de que las variables estén configuradas para el ambiente correcto

2. **Redeploy Después de Agregar Variables**:
   - Las variables nuevas requieren un nuevo deployment
   - Ve a Deployments → Haz clic en "..." → "Redeploy"

3. **Verifica Nombres**:
   - Los nombres son case-sensitive
   - Verifica que no haya espacios extra
   - Verifica que coincidan exactamente con lo que espera el código

4. **Verifica Build vs Runtime**:
   - Las variables están disponibles en **runtime**, no en build
   - Si intentas acceder a ellas durante el build, serán `undefined`

---

## ❌ Error: "Module not found" o Import Errors

### Problema

Errores de módulos no encontrados durante el build.

### Solución

1. **Verifica dependencias**:
   ```bash
   pnpm install
   ```

2. **Verifica imports**:
   - Asegúrate de que los paths en `tsconfig.json` sean correctos
   - Verifica que uses `@/` para imports absolutos

3. **Limpia y reinstala**:
   ```bash
   rm -rf node_modules .next
   pnpm install
   pnpm build
   ```

---

## ❌ Build Tarda Mucho o Timeout

### Problema

El build tarda demasiado o hace timeout.

### Solución

1. **Optimiza dependencias**:
   - Revisa si hay dependencias innecesarias
   - Usa `pnpm` en lugar de `npm` (más rápido)

2. **Verifica tamaño del proyecto**:
   - Asegúrate de que `.vercelignore` esté excluyendo archivos innecesarios
   - Verifica que no estés incluyendo `node_modules` o `.next` en el repo

3. **Usa Build Cache**:
   - Vercel cachea builds automáticamente
   - El primer build será más lento, los siguientes serán más rápidos

---

## ❌ Health Check Falla

### Problema

`/api/health` retorna error o no responde.

### Solución

1. **Verifica que el endpoint exista**:
   - Debe estar en `src/app/api/health/route.ts`

2. **Verifica logs**:
   - Ve a Vercel → Deployments → Tu deployment → Functions
   - Revisa los logs de la función

3. **Verifica que la ruta esté correcta**:
   - Debe ser `/api/health` o `/health` (si está configurado en `vercel.json`)

---

## ✅ Checklist de Verificación

Antes de reportar un problema, verifica:

- [ ] Variables de entorno configuradas en Vercel
- [ ] Variables configuradas para el ambiente correcto (Preview/Production)
- [ ] Base de datos creada y accesible
- [ ] Migraciones ejecutadas en la base de datos
- [ ] Build funciona localmente: `pnpm build`
- [ ] No hay errores de TypeScript: `pnpm tsc --noEmit`
- [ ] No hay errores de lint: `pnpm lint`
- [ ] Código está pusheado a GitHub
- [ ] Branch correcto (`demo` para preview, `main` para production)

---

## 🆘 Obtener Más Información

### Ver Logs Completos

1. **Build Logs**:
   - Vercel → Deployments → Tu deployment → Build Logs

2. **Function Logs**:
   - Vercel → Deployments → Tu deployment → Functions → Logs

3. **Runtime Logs**:
   - Vercel → Tu proyecto → Logs

### Comandos Útiles

```bash
# Verificar build localmente
pnpm build

# Verificar tipos
pnpm tsc --noEmit

# Verificar lint
pnpm lint

# Probar conexión a base de datos
DATABASE_URL="..." pnpm prisma db pull
```

---

## 📚 Recursos Adicionales

- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Prisma Deployment](https://www.prisma.io/docs/guides/deployment)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)

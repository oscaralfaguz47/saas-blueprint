# Cómo Obtener el Error Completo del Build

Si el build falla en Vercel pero los logs se cortan, sigue estos pasos:

## 📋 Paso 1: Ver Logs Completos en Vercel

1. Ve a tu proyecto en Vercel Dashboard
2. Haz clic en **"Deployments"**
3. Haz clic en el deployment que falló (el que tiene el ❌ rojo)
4. Haz clic en **"Build Logs"** (no "Function Logs")
5. **Desplázate hacia abajo** hasta encontrar el error
6. El error generalmente aparece al final de los logs

## 📋 Paso 2: Buscar el Error

Los errores comunes aparecen así:

### Error de TypeScript
```
./src/...
Type error: ...
```

### Error de Import
```
Module not found: Can't resolve ...
```

### Error de Build
```
Error occurred prerendering page ...
```

### Error de Prisma
```
Prisma Client initialization error
```

## 📋 Paso 3: Copiar el Error Completo

1. **Selecciona todo el texto del error** (desde donde empieza hasta donde termina)
2. **Copia** (Ctrl+C / Cmd+C)
3. **Pégalo aquí** para que pueda ayudarte

## 🔍 Errores Comunes y Soluciones Rápidas

### "Cannot find module" o "Module not found"

**Causa**: Import incorrecto o dependencia faltante

**Solución**:
```bash
# Localmente
pnpm install
pnpm build
```

### "Type error" o errores de TypeScript

**Causa**: Errores de tipos

**Solución**:
```bash
# Localmente
pnpm tsc --noEmit
# Corrige los errores antes de hacer push
```

### "Prisma Client" errors

**Causa**: Prisma Client no generado

**Solución**: Ya está en `postinstall`, pero verifica que funcione localmente:
```bash
pnpm prisma generate
```

### Build se corta sin error visible

**Causa**: Timeout o error que no se muestra

**Solución**: 
1. Verifica que el build funcione localmente: `pnpm build`
2. Revisa los logs completos (no solo la parte visible)
3. Verifica el tamaño del proyecto (no debe ser muy grande)

## 📸 Alternativa: Screenshot

Si es más fácil, puedes tomar un screenshot de:
1. La parte final de los Build Logs donde aparece el error
2. O la sección de "Error" si Vercel la muestra

## 🆘 Si No Encuentras el Error

1. **Intenta el build localmente**:
   ```bash
   pnpm build
   ```
   Si falla localmente, verás el error completo

2. **Verifica que todo esté commiteado**:
   ```bash
   git status
   git add .
   git commit -m "Fix build"
   git push
   ```

3. **Revisa los cambios recientes**:
   - ¿Agregaste algún import nuevo?
   - ¿Cambiaste alguna configuración?
   - ¿Modificaste `package.json`?

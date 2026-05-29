# Stack y decisiones técnicas

## Dependencias principales

| Paquete | Versión | Rol |
|---|---|---|
| `@angular/core` | ^19.2 | Framework principal |
| `tailwindcss` | ^3.4.18 | Utilidades CSS |
| `autoprefixer` | ^10.4.22 | Vendor prefixes automáticos |
| `postcss` | ^8.5.6 | Procesador CSS (requerido por Angular) |

## Por qué Tailwind v3 (no v4)

Angular 19 detecta automáticamente `tailwind.config.js` y lo integra en su pipeline de build sin configuración adicional.

Tailwind v4 requiere `@tailwindcss/postcss` y que el entry point de estilos sea un `.css` puro — lo que impide usar Sass en el archivo global. V3 funciona nativamente con `styles.scss` y `@tailwind` directives.

**Regla:** no actualizar a Tailwind v4 hasta que Angular tenga soporte oficial o se haga una migración planificada.

## Por qué no hay `postcss.config.js`

Angular 19 con el builder `@angular-devkit/build-angular:application` (esbuild) detecta `tailwind.config.js` en la raíz y aplica Tailwind automáticamente. No se necesita un archivo PostCSS separado para Tailwind v3.

## Estilos globales: `styles.scss`

El único archivo de estilos globales es `src/styles.scss`. Contiene:
- Las tres directivas de Tailwind (`@tailwind base/components/utilities`)
- Variables CSS globales (fuentes, etc.)
- Clases de utilidad custom que Tailwind no puede generar (ej: `scrollbar-hide`)

**No agregar** estilos de componentes en `styles.scss`. Cada componente tiene su propio `.scss`.

## Sass en componentes

`angular.json` tiene `"inlineStyleLanguage": "scss"` — todos los componentes pueden usar Sass en sus archivos `.scss`. El archivo global es la única excepción donde se usa Tailwind v3 directamente.

## API client: `ng-openapi-gen`

El cliente HTTP se genera automáticamente desde el OpenAPI spec del backend:

```bash
npm run generate-api
```

Los archivos generados van a `src/app/api/`. No editar esos archivos manualmente — se regeneran.

## Configuración de ambientes

| Archivo | Cuándo aplica |
|---|---|
| `environment.ts` | Default (desarrollo) |
| `environment.staging.ts` | `npm run start:staging` / `npm run build:staging` |
| `environment.production.ts` | `npm run build:prod` |

# Estructura del proyecto

## Árbol de carpetas

```
src/app/
├── core/                        ← servicios singleton, guards, interceptors, modelos
│   └── services/
│       ├── toast.service.ts
│       └── ui-feedback.service.ts
│
├── features/                    ← una carpeta por dominio/página
│   └── landing/
│       ├── landing.component.ts
│       ├── landing.component.html
│       └── landing.component.scss
│
└── shared/                      ← componentes reutilizables sin lógica de negocio
    └── components/
        ├── action-dialog/
        ├── paginator/
        ├── toast/
        └── ui-feedback/
```

## Reglas por carpeta

### `core/`
- Servicios `providedIn: 'root'` que viven durante toda la app.
- Guards, interceptors HTTP, modelos TypeScript globales.
- **No** importar componentes acá.

### `features/`
- Una sub-carpeta por feature o sección de la app (landing, auth, dashboard, productos, etc.).
- Cada feature tiene sus propios componentes, rutas y lógica.
- Si una feature tiene muchas pantallas, agregar un `feature.routes.ts` y hacer lazy loading en `app.routes.ts`.

```ts
// app.routes.ts — lazy load de una feature
{ path: 'dashboard', loadChildren: () => import('./features/dashboard/dashboard.routes').then(m => m.DASHBOARD_ROUTES) }
```

- Los componentes dentro de una feature **no** se importan desde otra feature. Si algo es compartido, va a `shared/`.

### `shared/`
- Componentes puramente presentacionales o de utilidad: dialogs, paginators, toasts, spinners, etc.
- Sin dependencias de lógica de negocio específica.
- Siempre `standalone: true`.
- Exportar desde un barrel `shared/components/index.ts` cuando haya muchos.

## Convención de nombres

| Tipo | Nombre | Ejemplo |
|---|---|---|
| Componente | `kebab-case.component.ts` | `action-dialog.component.ts` |
| Servicio | `kebab-case.service.ts` | `toast.service.ts` |
| Guard | `kebab-case.guard.ts` | `auth.guard.ts` |
| Modelo | `kebab-case.model.ts` | `product.model.ts` |
| Rutas | `feature.routes.ts` | `dashboard.routes.ts` |

## Agregar una nueva feature

1. Crear carpeta `src/app/features/<nombre>/`
2. Crear el componente principal con `.ts`, `.html`, `.scss`
3. Si tiene sub-rutas, crear `<nombre>.routes.ts`
4. Registrar en `app.routes.ts`

```ts
// Ejemplo: feature "productos"
src/app/features/productos/
├── productos.routes.ts
├── productos-list/
│   ├── productos-list.component.ts
│   ├── productos-list.component.html
│   └── productos-list.component.scss
└── productos-detail/
    ├── productos-detail.component.ts
    └── productos-detail.component.html
```

# Chef Control — Frontend

Angular 19 · Tailwind CSS v4 · ng-openapi-gen

## Stack

- **Angular 19** — standalone components, signals
- **Tailwind CSS v4** — utility-first, configuración vía CSS
- **ng-openapi-gen** — genera servicios HTTP e interfaces TypeScript desde el spec del backend

## Setup

```bash
npm install
npm start    # http://localhost:4200
```

---

## Integración con el backend (ng-openapi-gen)

El backend expone el contrato OpenAPI en `http://localhost:8080/v3/api-docs.yaml`.
`ng-openapi-gen` lee ese archivo y genera todo el código de comunicación con la API — no escribís los llamados HTTP a mano.

### Primera vez / cuando el backend cambia

**1. Asegurate de que el backend esté corriendo**

**2. Bajar el spec actualizado**
```bash
curl http://localhost:8080/v3/api-docs.yaml -o api-spec.yaml
```

Commitear `api-spec.yaml` — así el equipo puede regenerar sin necesitar el backend levantado.

**3. Regenerar servicios**
```bash
npm run generate-api
```

Genera en `src/app/api/`:
```
api/
  models/    ← interfaces TypeScript (ProductResponse, LoginRequest, etc.)
  services/  ← servicios Angular con HttpClient listos para inyectar
  fn/        ← funciones internas (no usar directamente)
```

**4. TypeScript detecta breaking changes automáticamente**

Si el backend cambió un campo o endpoint, el compilador lo va a marcar como error — contrato fuertemente tipado.

### Uso en componentes

```typescript
// Inyectás el servicio generado
constructor(private productsService: ProductsService) {}

// Y llamás directo, sin escribir URLs ni tipados
this.productsService.listProducts({ page: 0, size: 20 })
  .subscribe(response => this.products = response.content);
```

---

## Estructura de carpetas

```
src/app/
  api/        ← generado por ng-openapi-gen (NO editar manualmente)
  core/       ← guards, interceptors, auth service
  features/   ← módulos por feature (productos, compras, ventas, etc.)
  shared/     ← componentes y pipes reutilizables
  layout/     ← sidebar, navbar, shell
```

## Variables de entorno

`src/environments/environment.ts`:
```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:8080'
};
```

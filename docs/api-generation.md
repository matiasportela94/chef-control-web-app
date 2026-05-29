# Generación de servicios desde el backend (ng-openapi-gen)

El backend expone un contrato OpenAPI en `/v3/api-docs.yaml`.
`ng-openapi-gen` lee ese contrato y genera automáticamente los servicios Angular
e interfaces TypeScript — no se escriben los llamados HTTP a mano.

## Cuándo regenerar

- Se agregó un endpoint nuevo al backend
- Cambió el request o response de un endpoint existente
- Se agregó o modificó un DTO

## Pasos

### 1. Levantar el backend

Asegurate de que el backend esté corriendo en `http://localhost:8080`.

### 2. Bajar el spec actualizado

```bash
curl http://localhost:8080/v3/api-docs.yaml -o api-spec.yaml
```

> Commitear `api-spec.yaml` — así cualquier dev puede regenerar sin necesitar el backend levantado.

### 3. Regenerar los servicios

```bash
npm run generate-api
```

### 4. Verificar

El compilador TypeScript va a marcar errores en los componentes si algún modelo o servicio cambió. Esos errores son el contrato roto — arreglarlos es parte del proceso.

---

## Qué se genera

En `src/app/api/` (no editar manualmente, se sobreescribe en cada generación):

```
api/
  models/       ← interfaces TypeScript (ProductResponse, LoginRequest, etc.)
  services/     ← servicios Angular con HttpClient listos para inyectar
  fn/           ← funciones internas por endpoint (no usar directamente)
  api.ts        ← barrel de exports
  api-configuration.ts  ← URL base y configuración global
```

## Cómo se usa en un componente

```typescript
import { ProductControllerService } from '../api/services/product-controller.service';
import { ProductResponse } from '../api/models/product-response';

@Component({ ... })
export class ProductListComponent {
  products: ProductResponse[] = [];

  constructor(private productService: ProductControllerService) {}

  ngOnInit() {
    this.productService.listProducts({ page: 0, size: 20 })
      .subscribe(response => this.products = response.content ?? []);
  }
}
```

## Configuración

El archivo `ng-openapi-gen.json` en la raíz del proyecto controla la generación:

```json
{
  "input": "api-spec.yaml",
  "output": "src/app/api",
  "removeStaleFiles": true
}
```

`removeStaleFiles: true` elimina archivos de endpoints que ya no existen en el backend.

## Notas

- **No editar** nada dentro de `src/app/api/` — se sobreescribe en cada `npm run generate-api`.
- La carpeta `src/app/api/` está en `.gitignore` — cada dev regenera localmente.
- El `api-spec.yaml` SÍ se commitea — es el contrato versionado entre frontend y backend.

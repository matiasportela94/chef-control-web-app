# Componentes compartidos

Ubicación: `src/app/shared/components/`

Todos son `standalone: true`. Importar directamente en el componente que los use.

---

## `ActionDialogComponent`

Modal de confirmación reutilizable. Soporta inputs de texto/textarea opcionales.

```ts
import { ActionDialogComponent } from '../shared/components/action-dialog/action-dialog.component';
```

```html
<app-action-dialog
  [visible]="showDialog"
  title="Eliminar producto"
  message="Esta acción no se puede deshacer."
  confirmLabel="Eliminar"
  tone="danger"
  icon="🗑️"
  (confirm)="onConfirm($event)"
  (cancel)="showDialog = false"
/>
```

| Input | Tipo | Default | Descripción |
|---|---|---|---|
| `visible` | `boolean` | `false` | Muestra el dialog |
| `title` | `string` | `'Confirmar acción'` | Título del header |
| `message` | `string` | `''` | Texto de descripción |
| `confirmLabel` | `string` | `'Confirmar'` | Texto botón primario |
| `cancelLabel` | `string` | `'Cancelar'` | Texto botón secundario |
| `tone` | `'primary' \| 'danger'` | `'primary'` | Color del botón de confirmación |
| `icon` | `string` | `'?'` | Emoji o carácter del ícono |
| `inputLabel` | `string` | `''` | Si se provee, muestra un campo de texto |
| `inputRequired` | `boolean` | `false` | Requiere que el input tenga valor para confirmar |
| `confirmDisabled` | `boolean` | `false` | Deshabilita el botón de confirmación |

| Output | Payload | Descripción |
|---|---|---|
| `confirm` | `string` | Valor del input (o `''` si no hay input) |
| `cancel` | `void` | El usuario canceló |

---

## `PaginatorComponent`

Paginación con elipsis automáticas para conjuntos grandes de páginas.

```ts
import { PaginatorComponent } from '../shared/components/paginator/paginator.component';
```

```html
<app-paginator
  [currentPage]="page"
  [totalItems]="total"
  [itemsPerPage]="10"
  (pageChange)="onPageChange($event)"
/>
```

| Input | Tipo | Descripción |
|---|---|---|
| `currentPage` | `number` | Página actual (base 1) |
| `totalItems` | `number` | Total de registros |
| `itemsPerPage` | `number` | Registros por página (default: `10`) |

| Output | Payload | Descripción |
|---|---|---|
| `pageChange` | `number` | Nueva página seleccionada |

---

## `ToastComponent` + `ToastService`

Sistema de notificaciones no bloqueantes. El componente ya está montado globalmente en `app.component.html` — solo usar el servicio.

```ts
import { ToastService } from '../core/services/toast.service';

@Component({ ... })
export class MiComponent {
  private toast = inject(ToastService);

  guardar() {
    this.toast.success('Guardado', 'El producto fue creado correctamente.');
    this.toast.error('Error', 'No se pudo conectar con el servidor.');
    this.toast.warning('Atención', 'El stock está por debajo del mínimo.');
    this.toast.info('Info', 'Los datos se actualizan cada 5 minutos.');
  }
}
```

Los toasts se auto-descartan a los 5 segundos (errores: 6 segundos).

---

## `UiFeedbackComponent` + `UiFeedbackService`

Overlay bloqueante para operaciones con estados loading → success/error. Útil para submits de formularios, operaciones destructivas, etc.

El componente ya está montado en `app.component.html`. Solo usar el servicio.

```ts
import { UiFeedbackService } from '../core/services/ui-feedback.service';

@Component({ ... })
export class MiComponent {
  private feedback = inject(UiFeedbackService);

  async guardar() {
    this.feedback.showLoading('Guardando...', 'Estamos procesando tu solicitud.');
    try {
      await this.api.save(data);
      this.feedback.showSuccess('¡Listo!', 'El registro fue guardado correctamente.');
    } catch {
      this.feedback.showError(
        'Error al guardar',
        'No pudimos completar la operación.',
        undefined,
        () => this.guardar(),   // retry callback (opcional)
        'Reintentar'
      );
    }
  }
}
```

| Método | Parámetros | Descripción |
|---|---|---|
| `showLoading(title, message)` | - | Muestra spinner bloqueante |
| `showSuccess(title, message, details?, onClose?)` | - | Muestra estado de éxito |
| `showError(title, message, details?, retry?, retryLabel?, onClose?)` | - | Muestra estado de error con retry opcional |
| `reset()` | - | Cierra el overlay |

---

## `PageErrorStateComponent`

Bloque de error inline (no overlay) para páginas que fallan al cargar datos.

```ts
import { PageErrorStateComponent } from '../shared/components/ui-feedback/page-error-state.component';
```

```html
<app-page-error-state
  *ngIf="error"
  title="No pudimos cargar los productos"
  message="Verificá tu conexión e intentá de nuevo."
  [showRetry]="true"
  (retry)="cargarDatos()"
/>
```

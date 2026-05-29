# Sistema de estilos

## Paleta de colores

Definida en `tailwind.config.js` bajo `theme.extend.colors`. Usar siempre estas variables — nunca colores hardcodeados en templates.

### Brand (azul primario)
| Token | Hex | Uso |
|---|---|---|
| `brand-400` | `#60a5fa` | Texto destacado sobre fondos oscuros, íconos |
| `brand-600` | `#2563eb` | CTAs primarios, botones, links activos |
| `brand-700` | `#1d4ed8` | Hover de botones primarios |

### Surface (grises/navy para fondos y texto)
| Token | Hex | Uso |
|---|---|---|
| `surface-50` | `#f8fafc` | Fondo de secciones claras |
| `surface-100` | `#f1f5f9` | Fondo de inputs, cards secundarias |
| `surface-200` | `#e2e8f0` | Bordes en modo claro |
| `surface-400` | `#94a3b8` | Texto secundario / placeholder |
| `surface-500` | `#64748b` | Texto terciario |
| `surface-700` | `#334155` | Bordes en modo oscuro |
| `surface-800` | `#1e293b` | Cards sobre fondos oscuros |
| `surface-900` | `#0f172a` | Fondo de secciones oscuras |
| `surface-950` | `#0d1526` | Fondo principal oscuro (hero, footer) |

### Estados
| Token | Hex | Uso |
|---|---|---|
| `success-400/500` | verde | Stock OK, confirmaciones |
| `warning-400/500` | amarillo/naranja | Bajo stock, alertas preventivas |
| `danger-400/500` | rojo | Vencidos, pérdidas, errores |

## Tipografía

Dos familias definidas en `tailwind.config.js` y cargadas desde Google Fonts en `index.html`:

| Variable CSS | Clase Tailwind | Fuente | Uso |
|---|---|---|---|
| `var(--font-sans)` | `font-sans` | DM Sans | Texto corriente, UI |
| `var(--font-display)` | `font-display` | Syne | Headings, números grandes, números de sección |

La fuente display se aplica con clase Tailwind o inline style:
```html
<!-- Opción A: clase Tailwind -->
<h1 class="font-display font-extrabold">Título</h1>

<!-- Opción B: inline (ya existente en el código) -->
<h1 style="font-family: var(--font-display)">Título</h1>
```

Preferir la clase Tailwind en código nuevo.

## Convenciones de uso

### Fondos de sección
```
Hero / Footer          → bg-surface-950
Sección oscura         → bg-surface-900
Sección media          → bg-surface-800 (cards dentro de oscuro)
Sección clara          → bg-surface-50
Cards en sección clara → bg-white
```

### Botones
```html
<!-- Primario -->
<button class="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors">
  Acción
</button>

<!-- Secundario / outline -->
<button class="border border-surface-700 hover:border-surface-500 text-surface-300 hover:text-white font-semibold px-6 py-2.5 rounded-xl transition-colors">
  Acción
</button>

<!-- Peligro -->
<button class="bg-danger-500 hover:bg-danger-600 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors">
  Eliminar
</button>
```

### Inputs
```html
<input
  class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 outline-none
         placeholder:text-surface-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 transition-colors"
/>
```

## Clases custom en `styles.scss`

```scss
/* Ocultar scrollbar (usado en paginator mobile) */
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
```

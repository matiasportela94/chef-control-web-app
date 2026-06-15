# Chef Control — Design System

> Version 1.0 · June 2026 · Light & Dark Mode

---

## 1. Brand

**Chef Control** is a restaurant operations platform. The visual identity balances professional data density with warmth — dark surfaces for focus, orange as the single energetic accent, and Poppins for clarity at every size.

---

## 2. Color Palette

### 2.1 Accent (shared across both modes)

| Token | Hex | Usage |
|---|---|---|
| `--accent` | `#F36525` | CTAs, active nav, badges, FAB, sparklines, live dot |
| `--accent-dark` | `#C04A0A` | Nav hover bg (light), card hover border (light) |
| `--accent-text` | `#FFFFFF` (light) / `#000000` (dark) | Text on top of `--accent` surfaces |

### 2.2 Light Mode

| Token | Hex | Usage |
|---|---|---|
| `--bg` | `#F5F2EE` | Page background |
| `--bg-card` | `#FFFFFF` | Cards, panels |
| `--bg-sidebar` | `#FFFFFF` | Sidebar (floating) |
| `--bg-input` | `#F5F3F0` | Inputs, chips, icon badges |
| `--topbar-bg` | `#FFFFFF` | Top navigation bar |
| `--border` | `#EDE8E2` | Default borders |
| `--text-1` | `#1A1210` | Primary text — titles, values |
| `--text-2` | `#3D3530` | Secondary text — labels, sublabels |
| `--text-3` | `#9A9390` | Muted text — hints, captions |
| `--text-nav` | `#6B6560` | Sidebar nav item default |
| `--nav-label` | `#F36525` | Sidebar section labels (GENERAL, INVENTARIO…) |
| `--nav-hover-bg` | `#C04A0A` | Nav item hover background |
| `--nav-hover-text` | `#FFFFFF` | Nav item hover text |
| `--nav-active-bg` | `#F36525` | Active nav pill background |
| `--nav-active-text` | `#FFFFFF` | Active nav pill text |
| `--pop-bg` | `#F36525` | Highlighted KPI card background |
| `--pop-text` | `#FFFFFF` | Text on highlighted card |
| `--pop-sub` | `rgba(255,255,255,0.55)` | Subdued text on highlighted card |
| `--red` | `#E74C3C` | Merma badge, error states |
| `--red-bg` | `#FFF0F0` | Red badge background |
| `--spark` | `#EDE8E4` | Sparkline bar base |
| `--green-pct-bg` | `#FEF0E8` | Percentage badge background |
| `--green-pct-text` | `#C04A0A` | Percentage badge text |
| `--card-hover-border` | `#C04A0A` | Card border on hover |
| `--card-hover-bg` | `#FFF5F0` | Card background on hover |

### 2.3 Dark Mode

| Token | Hex | Usage |
|---|---|---|
| `--bg` | `#111214` | Page background |
| `--bg-card` | `#212226` | Cards, sidebar, panels |
| `--bg-input` | `#16191E` | Inputs, chips, icon badges |
| `--topbar-bg` | `#111214` | Top navigation bar |
| `--border` | `#2A2D34` | Default borders |
| `--text-1` | `#FFFFFF` | Primary text |
| `--text-2` | `rgba(255,255,255,0.75)` | Secondary text |
| `--text-3` | `rgba(255,255,255,0.75)` | Muted text |
| `--text-nav` | `#FFFFFF` | Sidebar nav item default |
| `--nav-label` | `#F36525` | Sidebar section labels |
| `--nav-hover-bg` | `rgba(243,101,37,0.13)` | Nav item hover background |
| `--nav-hover-text` | `#F36525` | Nav item hover text |
| `--nav-active-bg` | `#F36525` | Active nav pill |
| `--nav-active-text` | `#000000` | Active nav pill text |
| `--pop-bg` | `#F36525` | Highlighted KPI card |
| `--pop-text` | `#000000` | Text on highlighted card |
| `--pop-sub` | `rgba(0,0,0,0.45)` | Subdued text on highlighted card |
| `--red` | `#E74C3C` | Merma badge, error states |
| `--red-bg` | `#2A0F0F` | Red badge background |
| `--spark` | `#2A2D34` | Sparkline bar base |
| `--green-pct-bg` | `#2A1200` | Percentage badge background |
| `--green-pct-text` | `#F36525` | Percentage badge text |
| `--card-hover-border` | `#F36525` | Card border on hover |
| `--card-hover-bg` | `#22262D` | Card background on hover |

---

## 3. Typography

**Single family: Poppins**
No other typeface is used. Differentiated entirely by size and weight.

| Role | Size | Weight | Usage |
|---|---|---|---|
| Page Title | 22px | 700 | Screen headings (`Panel operativo`) |
| Section Title | 16px | 600 | Subsection headings |
| KPI Value | 20–22px | 700 | Main metric numbers |
| KPI Value LG | 26–28px | 700 | Food Cost %, stock counts |
| Body / Nav | 12px | 500 | Sidebar nav items, body text |
| Label | 11px | 500 | KPI card labels, sublabels |
| Caption | 10px | 400 | Hints, subtexts, badge sub |
| Nav Section / Badge | 9px | 700 | Section labels (ALL CAPS + letter-spacing 1.2px) |

**Rules:**
- Sentence case always — never Title Case mid-sentence
- Nav section labels: uppercase + `letter-spacing: 1.2px`
- No bold mid-sentence — bold for headings and labels only
- Line height: `1.1` for KPI values, `1.6` for body/description text

---

## 4. Spacing

Base unit: **4px**. All spacing is a multiple of 4.

| Token | Value | Usage |
|---|---|---|
| `xs` | 4px | Icon internal gap |
| `sm` | 8px | Sidebar margin from edges, small gaps |
| `md` | 10px | Nav item padding vertical, grid gap |
| `lg` | 12px | Card grid gap, field gap |
| `xl` | 16px | Card padding, section padding |
| `2xl` | 20px | Main content padding |
| `3xl` | 24px | Section margin, horizontal padding |
| `4xl` | 32px | Design system page padding |
| `topbar` | 52–56px | Fixed topbar height |

---

## 5. Border Radius

| Value | Usage |
|---|---|
| `6px` | Small buttons, chips |
| `8px` | Salir button, close button |
| `9px` | Nav items, inputs, selects, ingredient rows |
| `10px` | Primary button, status toggle, cost box |
| `11px` | Icon badge, ingredient rows (drawer) |
| `14px` | Drawer, sidebar |
| `16px` | Sidebar (floating), alert card |
| `18px` | KPI cards, alerts panel |
| `20px` | Badge pills, hero card |
| `50%` | User avatar, live dot |

---

## 6. Layout Structure

```
┌─────────────────────────────────────────────────────┐
│                    TOPBAR (fixed, 56px)             │
├──────────┬──────────────────────────────────────────┤
│          │                                          │
│ SIDEBAR  │              MAIN CONTENT                │
│ floating │              (scrollable)                │
│ 210px    │                                          │
│ 10px gap │   KPI Grid (3 col) ──────────────────   │
│ all edges│   KPI Grid (3 col) ──────────────────   │
│ r:16px   │   Alerts Panel ──────────────────────   │
│          │                                          │
└──────────┴──────────────────────────────────────────┘
```

### Sidebar
- Width: `210px`
- Position: `fixed`, `top: 66px`, `left: 10px`, `bottom: 10px`
- Border radius: `16px` (all corners — floats away from edges)
- Border: `1px solid var(--sidebar-border)`
- Scrollable, hidden scrollbar

### Main
- `margin-left: 230px` (sidebar 210px + 10px gap + 10px breathing room)
- Padding: `20px 24px 80px`

### Topbar
- `position: fixed`, `top: 0`, full width
- Height: `56px`
- `z-index: 100`

### Overlay + Drawer
- Overlay: `position: fixed`, `inset: 0`, `rgba(0,0,0,0.6)`, `z-index: 200`
- Drawer: `position: fixed`, `right: 0`, `width: 330px`, `z-index: 300`
- Transition: `transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)`
- Drawer header bg: `#F36525` (light) / `#0D1008` (dark)

---

## 7. Breakpoints

| Breakpoint | Range | Layout |
|---|---|---|
| Desktop | > 1024px | Sidebar visible, 3-col KPI, drawer slides from right |
| Tablet | 768–1024px | Sidebar 180px, some topbar items hidden |
| Mobile | < 768px | Sidebar hidden, bottom nav, 2-col KPI, bottom sheets |
| Small mobile | < 420px | Tighter padding, slightly smaller KPI values |

### Mobile-specific
- Greeting + hero card shown at top
- KPI grid: `2 columns`
- Bottom navigation bar: `72px fixed`
- FAB (Entrada rápida): centered, `52px`, floats `14px` above nav
- Drawers become **bottom sheets** (slide from bottom, `border-radius: 24px 24px 0 0`)
- Transaction list shown below alerts

---

## 8. Components

### 8.1 KPI Cards

Three variants:

**Normal**
```
bg:         var(--bg-card)
border:     1.5px solid var(--border)
radius:     18px
padding:    16px
hover:      border → --card-hover-border
            bg → --card-hover-bg
            transform: translateY(-2px)
            icon badge → bg #F36525, color #FFF
```

**Pop (highlighted)**
```
bg:         #F36525
border:     none
text:       #FFFFFF (light) / #000000 (dark)
sub-text:   rgba(255,255,255,0.55) (light) / rgba(0,0,0,0.45) (dark)
icon badge: rgba(255,255,255,0.12) bg
pct badge:  rgba(255,255,255,0.18) bg
sparkbars:  rgba(255,255,255,0.2) base / rgba(255,255,255,0.7) hi
```

**Hover (normal cards)**
```
border-color: --card-hover-border
background:   --card-hover-bg
transform:    translateY(-2px)
box-shadow:   0 8px 28px rgba(122,40,0,.1) light
              0 6px 24px rgba(243,101,37,.07) dark
icon badge:   bg #F36525, color #FFFFFF
sparkbars hi: #F36525
```

**Anatomy (top to bottom):**
1. Icon badge (absolute, top-right, 34×34px, radius 11px)
2. Percentage badge pill (optional)
3. Label (11px/500)
4. Value + inline sub-label
5. Sparkline (7 bars, 26px height)
6. Caption sub-text

### 8.2 Navigation Items

```
Default:    color var(--text-nav), no bg
Hover:      bg var(--nav-hover-bg), color var(--nav-hover-text)
            + green dot (5×5px) absolute right
Active:     bg #F36525, color #FFFFFF (light)
            bg #F36525, color #000000 (dark)
            radius: 9px
```

Section labels: `9px / 700 / uppercase / letter-spacing 1.2px / color #F36525`

### 8.3 Buttons

| Variant | BG | Text | Border | Radius |
|---|---|---|---|---|
| Primary | `#F36525` | `#FFFFFF` | none | 10px |
| Secondary | none | `--text-2` | `1.5px solid --border` | 10px |
| Ghost | none | `#F36525` | `1.5px solid #F36525` | 10px |
| Danger | none | `#E74C3C` | `1.5px solid #E74C3C` | 10px |
| Icon | `--bg-card` | `--text-2` | `1.5px solid --border` | 10px |

Padding: `9px 18px` (default) · `6px 12px` (small) · `10px 20px` (large)

### 8.4 Badges & Pills

```
Accent:       bg #F36525,  text #FFFFFF,  radius 20px
Soft orange:  bg #FEF0E8,  text #C04A0A
Soft red:     bg #FFF0F0,  text #E74C3C   (merma only)
Neutral:      bg --bg-input, text --text-2
All: font-size 10px / font-weight 700 / padding 3px 8px
```

### 8.5 Inputs

```
bg:           --bg-input
border:       1.5px solid --border
border-focus: 1.5px solid #F36525
radius:       10px (standard) / 9px (compact)
padding:      9px 12px
font:         Poppins 12px / 400
color:        --text-1
```

### 8.6 Status Toggle

Two options side by side:
```
Default: border 1.5px solid --border, no bg, text --text-3
Active:  bg #F36525, color #FFFFFF, border #F36525
radius:  10px
```

### 8.7 Drawers / Bottom Sheets

**Desktop — Drawer**
```
width:       330px
position:    fixed right
transition:  translateX 0.28s cubic-bezier(.4,0,.2,1)
header bg:   #F36525 (light) / #0D1008 (dark)
header text: #FFFFFF
body bg:     --bg-card
```

**Mobile — Bottom Sheet**
```
position:    fixed bottom
radius:      24px 24px 0 0
transition:  translateY 0.3s cubic-bezier(.4,0,.2,1)
max-height:  90vh
handle:      40×4px, --border color, centered
header:      same as drawer
```

**Entrada Rápida shortcuts:**
- Background: `--bg-input`
- Border: `1.5px solid --border` → hover `#F36525`
- Icon color: `#F36525`
- Font: `12px / 500`

### 8.8 Alerts Panel

```
bg:      --bg-card
border:  1.5px solid --border
radius:  18px
padding: 14px 16px
empty state: icon 22px at 50% opacity, text --text-3
```

---

## 9. Iconography

Library: **Tabler Icons** (outline webfont)
`https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css`

| Size | Usage |
|---|---|
| 14px | Nav items |
| 16–17px | Card icon badges |
| 20px | Bottom nav (mobile) |
| 22px | Empty states |
| 24px | FAB |

**Color:** inherits from parent context. Never hardcode icon color unless overriding (e.g. accent on drawer header).

**Icon map:**

| Screen | Icon |
|---|---|
| Panel | `ti-layout-dashboard` |
| Alertas | `ti-bell` |
| Platos del menú | `ti-clipboard-list` |
| Ventas | `ti-chart-bar` |
| Proveedores | `ti-truck` |
| Compras | `ti-shopping-cart` |
| Insumos | `ti-package` |
| Categorías | `ti-tag` |
| Stock | `ti-box` |
| Merma | `ti-trash` |
| Conteos | `ti-clipboard-check` |
| Food Cost | `ti-coin` |
| Entrada rápida | `ti-bolt` |
| Actualizar | `ti-refresh` |
| Guardar | `ti-device-floppy` |
| Sin alertas | `ti-circle-check` |
| Tendencia | `ti-chart-line` |
| Bajo stock | `ti-alert-triangle` |

---

## 10. Interaction & Motion

| Interaction | Value |
|---|---|
| Card hover lift | `transform: translateY(-2px)` |
| Card hover shadow light | `0 8px 28px rgba(122,40,0,0.1)` |
| Card hover shadow dark | `0 6px 24px rgba(243,101,37,0.07)` |
| Drawer slide | `transform 0.28s cubic-bezier(0.4,0,0.2,1)` |
| Sheet slide | `transform 0.3s cubic-bezier(0.4,0,0.2,1)` |
| Overlay fade | `opacity 0.25s` |
| Theme toggle | `background 0.25s, color 0.25s` |
| Button hover | `opacity 0.82` (primary) |
| Nav item | `background 0.15s, color 0.15s` |
| Icon badge | `background 0.2s, color 0.2s` |
| Toggle pill | `transform 0.2s` |
| Live dot glow | `box-shadow: 0 0 6px #F36525` |
| FAB glow | `box-shadow: 0 4px 16px rgba(243,101,37,0.4)` |

---

## 11. Dark Mode Rules

1. Background `#111214` — the entire page, topbar, body
2. Cards and sidebar `#212226` — slightly lighter than bg, same value
3. Inputs `#16191E` — darker inset feel
4. All card text: `--text-1: #FFFFFF` (full white for primary), `--text-2/3: rgba(255,255,255,0.75)` for secondary
5. Pop card: `#F36525` bg + `#000000` text (inverted from light)
6. Nav section labels: `#F36525`
7. Nav hover: subtle orange tint `rgba(243,101,37,0.13)` + orange text
8. Active nav: `#F36525` pill + `#000` text
9. Borders: `#2A2D34`
10. No green anywhere — fully warm neutral palette

---

## 12. Files Delivered

| File | Description |
|---|---|
| `chef-control.html` | Dashboard panel — desktop |
| `chef-control-responsive.html` | Full responsive (desktop + tablet + mobile) |
| `chef-control-design-system.html` | Interactive design system with light/dark toggle |
| `chef-control-mobile.html` | Standalone mobile preview (phone frame) |
| `chef-control-tokens.json` | Design tokens for Figma Tokens plugin |
| `DESIGN.md` | This document |

---

## 13. To Import into Figma

1. **Tokens** → install *Figma Tokens* plugin → import `chef-control-tokens.json`
2. **Frames** → install *HTML to Figma* by Builder.io → open `chef-control.html` in Chrome → import
3. **Font** → install *Poppins* from Google Fonts in Figma before importing

---

*Chef Control Design System — maintained by the product team*

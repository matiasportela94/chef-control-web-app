import { Component, HostListener, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Api } from '../../api/api';
import { listWasteEvents } from '../../api/fn/waste-event-controller/list-waste-events';
import { createWasteEvent } from '../../api/fn/waste-event-controller/create-waste-event';
import { listProducts } from '../../api/fn/product-controller/list-products';
import { listUnits } from '../../api/fn/unit-controller/list-units';
import { WasteEventResponse } from '../../api/models/waste-event-response';
import { ProductResponse } from '../../api/models/product-response';
import { UnitResponse } from '../../api/models/unit-response';
import { PagedResponseWasteEventResponse } from '../../api/models/paged-response-waste-event-response';
import { PagedResponseProductResponse } from '../../api/models/paged-response-product-response';
import { parseBlob } from '../../core/utils/parse-blob';
import { formatARS, formatDate } from '../../core/utils/format';
import { extractApiError } from '../../core/utils/api-error';
import { PaginatorComponent } from '../../shared/components/paginator/paginator.component';
import { DrawerComponent } from '../../shared/components/drawer/drawer.component';
import { isFormFieldInvalid } from '../../core/utils/form';

@Component({
  selector: 'app-waste',
  standalone: true,
  imports: [ReactiveFormsModule, PaginatorComponent, DrawerComponent],
  templateUrl: './waste.component.html',
  styleUrl: './waste.component.scss'
})
export class WasteComponent implements OnInit {
  events   = signal<WasteEventResponse[]>([]);
  loading  = signal(true);
  error    = signal<string | null>(null);
  page     = signal(1);
  pageSize = 20;
  total    = signal(0);

  products     = signal<ProductResponse[]>([]);
  allUnits     = signal<UnitResponse[]>([]);
  filteredUnits = signal<UnitResponse[]>([]);

  drawerOpen = signal(false);
  saving     = signal(false);
  saveError  = signal<string | null>(null);

  form: FormGroup;

  readonly reasons = [
    { value: 'EXPIRED',        label: 'Vencido'          },
    { value: 'DAMAGED',        label: 'Dañado'            },
    { value: 'OVERPRODUCTION', label: 'Sobreproducción'   },
    { value: 'THEFT',          label: 'Robo'              },
    { value: 'OTHER',          label: 'Otro'              },
  ];

  constructor(private api: Api, private fb: FormBuilder) {
    this.form = this.fb.group({
      productId: ['', Validators.required],
      unitId:    ['', Validators.required],
      quantity:  [null as number | null, [Validators.required, Validators.min(0.001)]],
      reason:    ['EXPIRED'],
    });
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadEvents(), this.loadFormData()]);
  }

  async loadEvents(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const raw = await this.api.invoke(listWasteEvents, { page: this.page() - 1, size: this.pageSize }) as unknown;
      const res = await parseBlob<PagedResponseWasteEventResponse>(raw);
      this.events.set(res.content ?? []);
      this.total.set(res.totalElements ?? 0);
    } catch {
      this.error.set('No se pudieron cargar las mermas.');
    } finally {
      this.loading.set(false);
    }
  }

  async loadFormData(): Promise<void> {
    try {
      const [prodsRaw, unitsRaw] = await Promise.all([
        this.api.invoke(listProducts, { page: 0, size: 999 }) as unknown,
        this.api.invoke(listUnits) as unknown,
      ]);
      const prodsRes = await parseBlob<PagedResponseProductResponse>(prodsRaw);
      this.products.set((prodsRes.content ?? []).filter(p => p.isActive));
      this.allUnits.set(await parseBlob<UnitResponse[]>(unitsRaw));
    } catch { /* non-critical */ }
  }

  openCreate(): void {
    this.form.reset({ productId: '', unitId: '', quantity: null, reason: 'EXPIRED' });
    this.filteredUnits.set([]);
    this.saveError.set(null);
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.drawerOpen()) this.closeDrawer();
  }

  onProductChange(): void {
    const productId = this.form.get('productId')?.value;
    const product   = this.products().find(p => p.id === productId);
    if (!product) return;

    // Filter units to those matching the product's default unit type
    const defaultType = this.allUnits().find(u => u.id === product.defaultUnit?.id)?.type;
    const compatible  = defaultType
      ? this.allUnits().filter(u => u.type === defaultType)
      : this.allUnits();
    this.filteredUnits.set(compatible);

    // Pre-fill with the product's default unit
    if (product.defaultUnit?.id) {
      this.form.get('unitId')?.setValue(product.defaultUnit.id);
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.saveError.set(null);
    const v = this.form.getRawValue();
    const body = {
      productId: v.productId,
      unitId:    v.unitId,
      quantity:  +v.quantity,
      ...(v.reason ? { reason: v.reason } : {}),
    };
    try {
      await this.api.invoke(createWasteEvent, { body });
      this.drawerOpen.set(false);
      await this.loadEvents();
    } catch (e: any) {
      this.saveError.set(extractApiError(e, 'Error al registrar la merma'));
    } finally {
      this.saving.set(false);
    }
  }

  async goToPage(p: number): Promise<void> {
    this.page.set(p);
    await this.loadEvents();
  }

  isInvalid = (field: string) => isFormFieldInvalid(this.form, field);

  reasonLabel(r?: string): string {
    const map: Record<string, string> = {
      EXPIRED:        'Vencido',
      DAMAGED:        'Dañado',
      OVERPRODUCTION: 'Sobreproducción',
      THEFT:          'Robo',
      OTHER:          'Otro',
    };
    return r ? (map[r] ?? r) : '—';
  }

  reasonClass(r?: string): string {
    const map: Record<string, string> = {
      EXPIRED:        'badge-danger',
      DAMAGED:        'badge-warning',
      OVERPRODUCTION: 'badge-neutral',
      THEFT:          'badge-danger',
      OTHER:          'badge-neutral',
    };
    return r ? (map[r] ?? 'badge-neutral') : 'badge-neutral';
  }

  readonly formatARS = formatARS;
  readonly formatDate = formatDate;
}

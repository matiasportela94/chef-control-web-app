import { Component, HostListener, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Api } from '../../api/api';
import { listCategories } from '../../api/fn/product-category-controller/list-categories';
import { createCategory } from '../../api/fn/product-category-controller/create-category';
import { updateCategory } from '../../api/fn/product-category-controller/update-category';
import { deleteCategory } from '../../api/fn/product-category-controller/delete-category';
import { CategoryResponse } from '../../api/models/category-response';
import { parseBlob } from '../../core/utils/parse-blob';
import { extractApiError } from '../../core/utils/api-error';
import { ActionDialogComponent } from '../../shared/components/action-dialog/action-dialog.component';
import { DrawerComponent } from '../../shared/components/drawer/drawer.component';
import { SpinnerComponent } from '../../shared/components/spinner/spinner.component';
import { isFormFieldInvalid } from '../../core/utils/form';

@Component({
  selector: 'app-categories',
  standalone: true,
  imports: [ReactiveFormsModule, ActionDialogComponent, DrawerComponent, SpinnerComponent],
  templateUrl: './categories.component.html',
  styleUrl: './categories.component.scss'
})
export class CategoriesComponent implements OnInit {
  categories = signal<CategoryResponse[]>([]);
  loading    = signal(true);
  error      = signal<string | null>(null);

  drawerOpen = signal(false);
  editing    = signal<CategoryResponse | null>(null);
  saving     = signal(false);
  saveError  = signal<string | null>(null);

  deleting      = signal<CategoryResponse | null>(null);
  deleteLoading = signal(false);

  form: FormGroup;

  constructor(private api: Api, private fb: FormBuilder) {
    this.form = this.fb.group({
      name:        ['', Validators.required],
      description: [''],
      color:       ['#6366f1'],
      icon:        [''],
    });
  }

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    if (this.categories().length === 0) this.loading.set(true); // evita el flash de spinner (y el salto de scroll) en recargas tras crear/editar/borrar
    this.error.set(null);
    try {
      const raw = await this.api.invoke(listCategories) as unknown;
      this.categories.set(await parseBlob<CategoryResponse[]>(raw));
    } catch {
      this.error.set('No se pudieron cargar las categorías.');
    } finally {
      this.loading.set(false);
    }
  }

  openCreate(): void {
    this.editing.set(null);
    this.form.reset({ name: '', description: '', color: '#6366f1', icon: '' });
    this.saveError.set(null);
    this.drawerOpen.set(true);
  }

  openEdit(cat: CategoryResponse): void {
    this.editing.set(cat);
    this.form.reset({
      name:        cat.name        ?? '',
      description: cat.description ?? '',
      color:       cat.color       ?? '#6366f1',
      icon:        cat.icon        ?? '',
    });
    this.saveError.set(null);
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.drawerOpen()) this.closeDrawer();
    if (this.deleting()) this.deleting.set(null);
  }

  async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.saveError.set(null);
    const { name, description, color, icon } = this.form.getRawValue();
    const desc  = description?.trim() || undefined;
    const clr   = color?.trim()       || undefined;
    const icn   = icon?.trim()        || undefined;
    try {
      const ed = this.editing();
      if (ed?.id) {
        await this.api.invoke(updateCategory, {
          id: ed.id,
          body: { name, description: desc, color: clr, icon: icn },
        });
      } else {
        await this.api.invoke(createCategory, {
          body: { name, description: desc, color: clr, icon: icn },
        });
      }
      this.drawerOpen.set(false);
      await this.load();
    } catch (e: any) {
      this.saveError.set(extractApiError(e, 'Error al guardar la categoría'));
    } finally {
      this.saving.set(false);
    }
  }

  async confirmDelete(): Promise<void> {
    const cat = this.deleting();
    if (!cat?.id) return;
    this.deleteLoading.set(true);
    try {
      await this.api.invoke(deleteCategory, { id: cat.id });
      this.deleting.set(null);
      await this.load();
    } catch { /* stays in dialog */ }
    finally { this.deleteLoading.set(false); }
  }

  get iconPreview(): string {
    return (this.form.get('icon')?.value as string)?.trim() || '';
  }

  isInvalid = (field: string) => isFormFieldInvalid(this.form, field);
}

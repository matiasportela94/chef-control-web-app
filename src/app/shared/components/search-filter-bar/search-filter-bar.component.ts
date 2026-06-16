import { Component, ElementRef, HostListener, Input, Output, EventEmitter } from '@angular/core';

export interface FilterBarState {
  search: string;
  categoryId: string;
  onlyActive: boolean;
}

@Component({
  selector: 'app-search-filter-bar',
  standalone: true,
  styles: [`
    .dropdown-scroll { scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
    .dropdown-scroll::-webkit-scrollbar       { width: 6px; }
    .dropdown-scroll::-webkit-scrollbar-track { background: transparent; }
    .dropdown-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 9999px; }
    .sfb-item { transition: background .12s, color .12s; }
    .sfb-item:hover { background: var(--bg-input) !important; color: var(--text-1) !important; }
  `],
  template: `
    <div class="flex flex-wrap items-center gap-3">

      <!-- Search input -->
      <div class="relative flex-1 min-w-52">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
             style="color:var(--text-3)"
             fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input #searchInput type="text"
               (input)="onSearchInput(searchInput.value)"
               [placeholder]="placeholder"
               class="field-input"
               style="padding-left:36px;padding-right:36px;background:var(--bg-card);" />
        @if (search) {
          <button (click)="clearSearch(searchInput)"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-lg leading-none transition-colors"
                  style="color:var(--text-3)">
            ×
          </button>
        }
      </div>

      <!-- Category dropdown -->
      @if (categories.length > 0) {
        <div class="relative">

          <!-- Trigger -->
          <button type="button"
                  (click)="toggleDropdown($event)"
                  class="flex items-center gap-2.5 border rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all min-w-44 justify-between"
                  [style]="dropdownOpen
                    ? 'background:var(--bg-card);border-color:var(--accent);color:var(--text-1)'
                    : categoryId
                      ? 'background:rgba(243,101,37,0.08);border-color:rgba(243,101,37,0.3);color:var(--accent)'
                      : 'background:var(--bg-card);border-color:var(--border);color:var(--text-3)'">
            <span class="truncate max-w-36">{{ selectedCategoryLabel }}</span>
            <svg class="w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200"
                 [style.transform]="dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)'"
                 fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          <!-- Panel -->
          @if (dropdownOpen) {
            <div class="dropdown-scroll absolute top-full left-0 mt-1.5 min-w-full w-max max-w-72 rounded-xl shadow-2xl z-50 overflow-hidden py-1"
                 style="background:var(--bg-card);border:1.5px solid var(--border)">

              <button type="button" (click)="selectCategory('')"
                      class="sfb-item w-full flex items-center gap-3 px-3.5 py-2.5 text-sm text-left"
                      [style]="categoryId === '' ? 'color:var(--accent);background:rgba(243,101,37,0.08)' : 'color:var(--text-2)'">
                <span class="w-3.5 h-3.5 flex-shrink-0 flex items-center justify-center">
                  @if (categoryId === '') {
                    <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" class="w-3.5 h-3.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  }
                </span>
                Todas las categorías
              </button>

              <div class="h-px mx-2 my-1" style="background:var(--border)"></div>

              @for (cat of categories; track cat.id) {
                <button type="button" (click)="selectCategory(cat.id)"
                        class="sfb-item w-full flex items-center gap-3 px-3.5 py-2.5 text-sm text-left"
                        [style]="categoryId === cat.id ? 'color:var(--accent);background:rgba(243,101,37,0.08)' : 'color:var(--text-2)'">
                  <span class="w-3.5 h-3.5 flex-shrink-0 flex items-center justify-center">
                    @if (categoryId === cat.id) {
                      <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" class="w-3.5 h-3.5">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    }
                  </span>
                  {{ cat.name }}
                </button>
              }

            </div>
          }

        </div>
      }

      <!-- Active toggle -->
      @if (showActiveToggle) {
        <button type="button" (click)="toggleActiveFilter()"
                class="flex items-center gap-2 border rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all"
                [style]="onlyActive
                  ? 'background:rgba(243,101,37,0.08);border-color:rgba(243,101,37,0.3);color:var(--accent)'
                  : 'background:var(--bg-card);border-color:var(--border);color:var(--text-3)'">
          <span class="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0"
                [style]="onlyActive ? 'background:var(--accent)' : 'background:var(--text-3)'"></span>
          {{ onlyActive ? 'Solo activos' : 'Todos' }}
        </button>
      }

    </div>
  `,
})
export class SearchFilterBarComponent {
  @Input() placeholder = 'Buscar...';
  @Input() categories: { id: string; name: string }[] = [];
  @Input() showActiveToggle = true;

  @Output() filtersChange = new EventEmitter<FilterBarState>();

  search      = '';
  categoryId  = '';
  onlyActive  = true;
  dropdownOpen = false;

  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private el: ElementRef) {}

  get selectedCategoryLabel(): string {
    if (!this.categoryId) return 'Todas las categorías';
    return this.categories.find(c => c.id === this.categoryId)?.name ?? 'Todas las categorías';
  }

  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.dropdownOpen = !this.dropdownOpen;
  }

  selectCategory(id: string): void {
    this.categoryId = id;
    this.dropdownOpen = false;
    this.emit();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (!this.el.nativeElement.contains(event.target)) {
      this.dropdownOpen = false;
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.dropdownOpen = false;
  }

  onSearchInput(value: string): void {
    this.search = value;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.emit(), 280);
  }

  clearSearch(input: HTMLInputElement): void {
    input.value = '';
    this.search = '';
    if (this.timer) clearTimeout(this.timer);
    this.emit();
  }

  toggleActiveFilter(): void {
    this.onlyActive = !this.onlyActive;
    this.emit();
  }

  private emit(): void {
    this.filtersChange.emit({
      search:     this.search,
      categoryId: this.categoryId,
      onlyActive: this.onlyActive,
    });
  }
}

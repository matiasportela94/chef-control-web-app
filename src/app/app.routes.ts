import { Routes } from '@angular/router';
import { LandingComponent } from './features/landing/landing.component';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', component: LandingComponent },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent)
  },
  {
    path: '',
    loadComponent: () => import('./features/shell/shell.component').then(m => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
      },
      {
        path: 'products',
        loadComponent: () => import('./features/products/products.component').then(m => m.ProductsComponent)
      },
      {
        path: 'categories',
        loadComponent: () => import('./features/categories/categories.component').then(m => m.CategoriesComponent)
      },
      {
        path: 'purchases',
        loadComponent: () => import('./features/purchases/purchases.component').then(m => m.PurchasesComponent)
      },
      {
        path: 'suppliers',
        loadComponent: () => import('./features/suppliers/suppliers.component').then(m => m.SuppliersComponent)
      },
      {
        path: 'stock',
        loadComponent: () => import('./features/stock/stock.component').then(m => m.StockComponent)
      },
      {
        path: 'food-cost',
        loadComponent: () => import('./features/food-cost/food-cost.component').then(m => m.FoodCostComponent)
      },
      {
        path: 'menu',
        loadComponent: () => import('./features/menu/menu.component').then(m => m.MenuComponent)
      },
      {
        path: 'sales',
        loadComponent: () => import('./features/sales/sales.component').then(m => m.SalesComponent)
      },
      {
        path: 'waste',
        loadComponent: () => import('./features/waste/waste.component').then(m => m.WasteComponent)
      },
      {
        path: 'alerts',
        loadComponent: () => import('./features/alerts/alerts.component').then(m => m.AlertsComponent)
      },
      {
        path: 'users',
        loadComponent: () => import('./features/users/users.component').then(m => m.UsersComponent)
      },
      {
        path: 'stock-counts',
        loadComponent: () => import('./features/stock-counts/stock-counts.component').then(m => m.StockCountsComponent)
      },
    ]
  },
  { path: '**', redirectTo: '' }
];

import { AppModule, ModuleId, Plan, PlanId } from '../types';

export const ALL_MODULES: AppModule[] = [
  {
    id: 'citas',
    label: 'Citas y Agenda',
    icon: 'calendar',
    description: 'Gestion de citas, horarios y disponibilidad en tiempo real.',
    route: '/dashboard/citas',
    color: '#2563EB',
    bgColor: '#EFF6FF',
  },
  {
    id: 'clientes',
    label: 'Clientes',
    icon: 'users',
    description: 'Directorio de clientes, historial y notas de atencion.',
    route: '/dashboard/clientes',
    color: '#059669',
    bgColor: '#ECFDF5',
  },
  {
    id: 'pagos',
    label: 'Pagos y Facturacion',
    icon: 'credit-card',
    description: 'Cobros, facturas y conciliacion.',
    route: '/dashboard/pagos',
    color: '#D97706',
    bgColor: '#FFFBEB',
  },
  {
    id: 'notificaciones',
    label: 'Notificaciones',
    icon: 'bell',
    description: 'WhatsApp, email y recordatorios automaticos.',
    route: '/dashboard/notificaciones',
    color: '#7C3AED',
    bgColor: '#F5F3FF',
  },
  {
    id: 'pos',
    label: 'Punto de Venta (POS)',
    icon: 'shopping-cart',
    description: 'Venta rapida de servicios y productos con gestion de caja.',
    route: '/dashboard/pos',
    color: '#2563EB',
    bgColor: '#EFF6FF',
  },
  {
    id: 'reportes',
    label: 'Reportes',
    icon: 'chart',
    description: 'Analiticas, metricas y exportacion de datos.',
    route: '/dashboard/reportes',
    color: '#DC2626',
    bgColor: '#FEF2F2',
  },
  {
    id: 'configuracion',
    label: 'Configuracion',
    icon: 'settings',
    description: 'Perfil del negocio, servicios, horarios y usuarios.',
    route: '/dashboard/configuracion',
    color: '#64748B',
    bgColor: '#F8FAFC',
  },
  {
    id: 'servicios',
    label: 'Servicios y Precios',
    icon: 'scissors',
    description: 'Catalogo de servicios, categorias, duraciones y precios.',
    route: '/dashboard/servicios',
    color: '#0891B2',
    bgColor: '#ECFEFF',
  },
  {
    id: 'personal',
    label: 'Personal',
    icon: 'user',
    description: 'Gestion de empleados, horarios y servicios asignados.',
    route: '/dashboard/personal',
    color: '#7C3AED',
    bgColor: '#F5F3FF',
  },
  {
    id: 'inventario',
    label: 'Inventario',
    icon: 'box',
    description: 'Productos, stock y alertas de agotamiento.',
    route: '/dashboard/inventario',
    color: '#0891B2',
    bgColor: '#ECFEFF',
  },
  {
    id: 'fidelizacion',
    label: 'Fidelizacion',
    icon: 'star',
    description: 'Puntos, recompensas y promociones por lealtad.',
    route: '/dashboard/fidelizacion',
    color: '#D97706',
    bgColor: '#FFFBEB',
  },
  {
    id: 'comisiones',
    label: 'Comisiones',
    icon: 'money',
    description: 'Calculo de comisiones por empleado y servicio.',
    route: '/dashboard/comisiones',
    color: '#059669',
    bgColor: '#ECFDF5',
  },
  {
    id: 'sucursales',
    label: 'Multi-sucursal',
    icon: 'briefcase',
    description: 'Gestion global de sedes, comparativas y reportes consolidados.',
    route: '/dashboard/sucursales',
    color: '#6366f1',
    bgColor: '#eef2ff',
  },
];

const ALL_MODULE_IDS: ModuleId[] = ALL_MODULES.map(m => m.id as ModuleId);

export const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$19/mes',
    modules: [...ALL_MODULE_IDS],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$49/mes',
    modules: [...ALL_MODULE_IDS],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: '$99/mes',
    modules: [...ALL_MODULE_IDS],
  },
];

export function getPlanModules(planId: PlanId): ModuleId[] {
  return PLANS.find((plan) => plan.id === planId)?.modules ?? [];
}

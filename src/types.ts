export type PlanId = 'starter' | 'pro' | 'enterprise';

export type ModuleId =
  | 'citas'
  | 'clientes'
  | 'pagos'
  | 'notificaciones'
  | 'reportes'
  | 'configuracion'
  | 'servicios'
  | 'personal'
  | 'inventario'
  | 'fidelizacion'
  | 'comisiones';

export interface UserPublic {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  plan: PlanId;
  businessName: string;
  avatarInitials?: string;
}

export interface UserRecord extends UserPublic {
  password: string;
  emailVerificationToken?: string;
  termsAcceptedAt?: string;
  moduleOverrides: Partial<Record<ModuleId, boolean>>;
}

export interface Plan {
  id: PlanId;
  name: string;
  price: string;
  modules: ModuleId[];
}

export interface AppModule {
  id: ModuleId;
  label: string;
  icon: string;
  description: string;
  route: string;
  color: string;
  bgColor: string;
}

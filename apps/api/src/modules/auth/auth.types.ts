export type AdminAuthContext = {
  type: 'admin';
  roles: string[];
};

export type StoreAuthContext = {
  type: 'store';
  storeId: string;
  roles: string[];
};

export type CustomerAuthContext = {
  type: 'customer';
  customerId: string;
};

export type AuthContext = AdminAuthContext | StoreAuthContext | CustomerAuthContext;

export type AuthSession = {
  user: {
    id: string;
    tenantId: string;
    email: string | null;
    phone: string | null;
    fullName: string | null;
    preferredLocale: string;
    status: string;
  };
  session: {
    expiresAt: string;
  };
  contexts: Array<AdminAuthContext | StoreAuthContext>;
  permissions: string[];
};

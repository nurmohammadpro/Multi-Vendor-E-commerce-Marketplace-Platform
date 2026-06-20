export type AppContextType = 'admin' | 'store' | 'customer';

export type AuthContext =
  | { type: 'admin'; roles: string[] }
  | { type: 'store'; storeId: string; roles: string[] }
  | { type: 'customer'; customerId: string };

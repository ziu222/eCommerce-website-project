// Mirrors ADMIN_ROLES in asset/js/core/auth.js; the server is the source of truth for permission checks.
export const ADMIN_ROLES: Record<string, { label: string; permissions: string[] }> = {
  super_admin: { label: 'Super Admin', permissions: ['*'] },
  pm: {
    label: 'Product Manager',
    permissions: [
      'dashboard.view', 'dashboard.reports',
      'orders.view', 'orders.manage',
      'products.view', 'products.manage',
      'shops.view', 'shops.manage',
      'notifications.send', 'notifications.view',
    ],
  },
  ba: {
    label: 'Business Analyst',
    permissions: [
      'dashboard.view', 'dashboard.finance', 'dashboard.reports',
      'orders.view',
      'products.view',
      'shops.view',
      'notifications.view',
    ],
  },
  hr: {
    label: 'HR Manager',
    permissions: [
      'dashboard.view',
      'users.view', 'users.manage', 'users.admin',
      'notifications.send', 'notifications.view',
    ],
  },
  support: {
    label: 'CSKH',
    permissions: ['dashboard.view', 'support.view', 'support.reply'],
  },
  staff: {
    label: 'Staff',
    permissions: [
      'dashboard.view',
      'orders.view',
      'products.view', 'products.manage',
      'shops.view',
      'notifications.view',
    ],
  },
};

export function permissionsFor(adminRole?: string | null): string[] {
  return (adminRole && ADMIN_ROLES[adminRole]?.permissions) || [];
}

export function hasPermission(adminRole: string | null | undefined, permission: string): boolean {
  return permissionsFor(adminRole).some((p) => p === '*' || p === permission);
}

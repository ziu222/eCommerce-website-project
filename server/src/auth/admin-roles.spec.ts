import { ADMIN_ROLES, hasPermission, permissionsFor } from './admin-roles.js';

describe('admin role table', () => {
  it('lets super_admin do anything through the wildcard', () => {
    expect(hasPermission('super_admin', 'anything.at.all')).toBe(true);
    expect(permissionsFor('super_admin')).toEqual(['*']);
  });

  it('mirrors the storefront role matrix', () => {
    expect(hasPermission('ba', 'orders.view')).toBe(true);
    expect(hasPermission('ba', 'orders.manage')).toBe(false);
    expect(hasPermission('pm', 'orders.manage')).toBe(true);
    expect(hasPermission('hr', 'users.admin')).toBe(true);
    expect(hasPermission('staff', 'products.manage')).toBe(true);
    expect(hasPermission('staff', 'users.manage')).toBe(false);
  });

  it('gives customer support only the support inbox and the dashboard', () => {
    expect(hasPermission('support', 'support.view')).toBe(true);
    expect(hasPermission('support', 'support.reply')).toBe(true);
    expect(hasPermission('support', 'orders.manage')).toBe(false);
    expect(hasPermission('support', 'users.view')).toBe(false);
    expect(hasPermission('ba', 'support.reply')).toBe(false);
  });

  it('denies unknown roles and missing roles', () => {
    expect(hasPermission('ghost', 'orders.view')).toBe(false);
    expect(hasPermission(undefined, 'orders.view')).toBe(false);
    expect(permissionsFor(undefined)).toEqual([]);
  });

  it('defines exactly the six roles the UI knows', () => {
    expect(Object.keys(ADMIN_ROLES).sort()).toEqual(['ba', 'hr', 'pm', 'staff', 'super_admin', 'support']);
  });
});

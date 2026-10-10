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

  it('denies unknown roles and missing roles', () => {
    expect(hasPermission('ghost', 'orders.view')).toBe(false);
    expect(hasPermission(undefined, 'orders.view')).toBe(false);
    expect(permissionsFor(undefined)).toEqual([]);
  });

  it('defines exactly the five roles the UI knows', () => {
    expect(Object.keys(ADMIN_ROLES).sort()).toEqual(['ba', 'hr', 'pm', 'staff', 'super_admin']);
  });
});

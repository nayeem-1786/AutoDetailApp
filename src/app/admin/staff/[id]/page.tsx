'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { employeeUpdateSchema, type EmployeeUpdateInput } from '@/lib/utils/validation';
import { ROLE_LABELS } from '@/lib/utils/constants';
import type { Employee, Permission, UserRole } from '@/lib/supabase/types';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { FormField } from '@/components/ui/form-field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Spinner } from '@/components/ui/spinner';
import { ArrowLeft } from 'lucide-react';

// Permission categories and keys for the permission override UI
const PERMISSION_CATEGORIES: Record<string, { label: string; keys: string[] }> = {
  pos: {
    label: 'POS Operations',
    keys: [
      'pos.open_register',
      'pos.close_register',
      'pos.apply_discount',
      'pos.void_transaction',
      'pos.process_refund',
      'pos.apply_coupon',
    ],
  },
  customer: {
    label: 'Customer Management',
    keys: [
      'customer.view',
      'customer.create',
      'customer.edit',
      'customer.delete',
      'customer.view_financials',
    ],
  },
  staff: {
    label: 'Staff Management',
    keys: [
      'staff.view',
      'staff.create',
      'staff.edit',
      'staff.deactivate',
      'staff.permissions',
    ],
  },
  catalog: {
    label: 'Catalog Management',
    keys: [
      'catalog.products.manage',
      'catalog.services.manage',
      'catalog.categories.manage',
    ],
  },
  inventory: {
    label: 'Inventory',
    keys: [
      'inventory.view',
      'inventory.adjust',
      'inventory.purchase_orders',
    ],
  },
  reports: {
    label: 'Reports & Analytics',
    keys: [
      'reports.view',
      'reports.export',
    ],
  },
  settings: {
    label: 'Settings',
    keys: [
      'settings.business',
      'settings.features',
      'settings.tax',
    ],
  },
};

const PERMISSION_LABELS: Record<string, string> = {
  'pos.open_register': 'Open Register',
  'pos.close_register': 'Close Register',
  'pos.apply_discount': 'Apply Discounts',
  'pos.void_transaction': 'Void Transactions',
  'pos.process_refund': 'Process Refunds',
  'pos.apply_coupon': 'Apply Coupons',
  'customer.view': 'View Customers',
  'customer.create': 'Create Customers',
  'customer.edit': 'Edit Customers',
  'customer.delete': 'Delete Customers',
  'customer.view_financials': 'View Financial Data',
  'staff.view': 'View Staff',
  'staff.create': 'Create Staff',
  'staff.edit': 'Edit Staff',
  'staff.deactivate': 'Deactivate Staff',
  'staff.permissions': 'Manage Permissions',
  'catalog.products.manage': 'Manage Products',
  'catalog.services.manage': 'Manage Services',
  'catalog.categories.manage': 'Manage Categories',
  'inventory.view': 'View Inventory',
  'inventory.adjust': 'Adjust Stock',
  'inventory.purchase_orders': 'Purchase Orders',
  'reports.view': 'View Reports',
  'reports.export': 'Export Reports',
  'settings.business': 'Business Settings',
  'settings.features': 'Feature Flags',
  'settings.tax': 'Tax Settings',
};

type OverrideState = 'default' | 'grant' | 'deny';

export default function StaffDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const supabase = createClient();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('profile');
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  // Permissions state
  const [rolePermissions, setRolePermissions] = useState<Permission[]>([]);
  const [employeePermissions, setEmployeePermissions] = useState<Permission[]>([]);
  const [overrides, setOverrides] = useState<Record<string, OverrideState>>({});
  const [savingPermissions, setSavingPermissions] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<EmployeeUpdateInput>({
    resolver: formResolver(employeeUpdateSchema),
  });

  const bookable = watch('bookable_for_appointments');

  const loadEmployee = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      toast.error('Staff member not found');
      router.push('/admin/staff');
      return;
    }

    setEmployee(data);
    reset({
      first_name: data.first_name,
      last_name: data.last_name,
      email: data.email,
      phone: data.phone || '',
      role: data.role,
      pin_code: data.pin_code || '',
      hourly_rate: data.hourly_rate,
      bookable_for_appointments: data.bookable_for_appointments,
    });

    // Load permissions
    const [rolePermsRes, empPermsRes] = await Promise.all([
      supabase
        .from('permissions')
        .select('*')
        .eq('role', data.role)
        .is('employee_id', null),
      supabase
        .from('permissions')
        .select('*')
        .eq('employee_id', id),
    ]);

    if (rolePermsRes.data) setRolePermissions(rolePermsRes.data);
    if (empPermsRes.data) {
      setEmployeePermissions(empPermsRes.data);
      // Build overrides map from employee-specific permissions
      const ovMap: Record<string, OverrideState> = {};
      empPermsRes.data.forEach((p: Permission) => {
        ovMap[p.permission_key] = p.granted ? 'grant' : 'deny';
      });
      setOverrides(ovMap);
    }

    setLoading(false);
  }, [id, supabase, router, reset]);

  useEffect(() => {
    loadEmployee();
  }, [loadEmployee]);

  function getRoleDefault(permKey: string): boolean {
    const rolePerm = rolePermissions.find((p) => p.permission_key === permKey);
    return rolePerm?.granted ?? false;
  }

  function getEffectiveValue(permKey: string): boolean {
    const override = overrides[permKey];
    if (override === 'grant') return true;
    if (override === 'deny') return false;
    return getRoleDefault(permKey);
  }

  function cycleOverride(permKey: string) {
    setOverrides((prev) => {
      const current = prev[permKey] || 'default';
      let next: OverrideState;
      if (current === 'default') next = 'grant';
      else if (current === 'grant') next = 'deny';
      else next = 'default';
      const updated = { ...prev };
      if (next === 'default') {
        delete updated[permKey];
      } else {
        updated[permKey] = next;
      }
      return updated;
    });
  }

  async function onSaveProfile(data: EmployeeUpdateInput) {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('employees')
        .update({
          first_name: data.first_name,
          last_name: data.last_name,
          email: data.email,
          phone: data.phone || null,
          role: data.role as UserRole,
          pin_code: data.pin_code || null,
          hourly_rate: data.hourly_rate ?? null,
          bookable_for_appointments: data.bookable_for_appointments,
        })
        .eq('id', id);

      if (error) throw error;

      toast.success('Profile updated successfully');
      await loadEmployee();
    } catch (err) {
      console.error('Update employee error:', err);
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate() {
    if (!employee) return;
    setDeactivating(true);
    try {
      const newStatus = employee.status === 'active' ? 'inactive' : 'active';
      const { error } = await supabase
        .from('employees')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;

      toast.success(`Staff member ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
      setShowDeactivate(false);
      await loadEmployee();
    } catch (err) {
      console.error('Deactivate error:', err);
      toast.error('Failed to update status');
    } finally {
      setDeactivating(false);
    }
  }

  async function handleSavePermissions() {
    setSavingPermissions(true);
    try {
      // Delete all existing employee overrides
      const { error: deleteError } = await supabase
        .from('permissions')
        .delete()
        .eq('employee_id', id);

      if (deleteError) throw deleteError;

      // Insert new overrides
      const overrideEntries = Object.entries(overrides);
      if (overrideEntries.length > 0) {
        const rows = overrideEntries.map(([key, state]) => ({
          permission_key: key,
          employee_id: id,
          role: null,
          granted: state === 'grant',
        }));

        const { error: insertError } = await supabase
          .from('permissions')
          .insert(rows);

        if (insertError) throw insertError;
      }

      toast.success('Permissions updated successfully');
      await loadEmployee();
    } catch (err) {
      console.error('Save permissions error:', err);
      toast.error('Failed to save permissions');
    } finally {
      setSavingPermissions(false);
    }
  }

  if (loading || !employee) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${employee.first_name} ${employee.last_name}`}
        description={ROLE_LABELS[employee.role]}
        action={
          <Button variant="outline" onClick={() => router.push('/admin/staff')}>
            <ArrowLeft className="h-4 w-4" />
            Back to Staff
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <form onSubmit={handleSubmit(onSaveProfile)} className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Employee Details</CardTitle>
                  <Badge
                    variant={employee.status === 'active' ? 'success' : employee.status === 'inactive' ? 'secondary' : 'destructive'}
                  >
                    {employee.status.charAt(0).toUpperCase() + employee.status.slice(1)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 md:grid-cols-2">
                  <FormField label="First Name" error={errors.first_name?.message} required htmlFor="first_name">
                    <Input id="first_name" {...register('first_name')} />
                  </FormField>

                  <FormField label="Last Name" error={errors.last_name?.message} required htmlFor="last_name">
                    <Input id="last_name" {...register('last_name')} />
                  </FormField>

                  <FormField label="Email" error={errors.email?.message} required htmlFor="email">
                    <Input id="email" type="email" {...register('email')} />
                  </FormField>

                  <FormField label="Mobile" error={errors.phone?.message} htmlFor="phone">
                    <Input id="phone" {...register('phone')} placeholder="(310) 555-1234" />
                  </FormField>

                  <FormField label="Role" error={errors.role?.message} required htmlFor="role">
                    <Select id="role" {...register('role')}>
                      {Object.entries(ROLE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </Select>
                  </FormField>

                  <FormField label="POS PIN Code" error={errors.pin_code?.message} htmlFor="pin_code" description="Optional 4-digit PIN for POS register login">
                    <Input
                      id="pin_code"
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      {...register('pin_code')}
                      placeholder="1234"
                    />
                  </FormField>

                  <FormField label="Hourly Rate" error={errors.hourly_rate?.message} htmlFor="hourly_rate">
                    <Input
                      id="hourly_rate"
                      type="number"
                      step="0.01"
                      min="0"
                      {...register('hourly_rate')}
                    />
                  </FormField>

                  <FormField label="Bookable for Appointments">
                    <div className="flex items-center gap-3 pt-1">
                      <Switch
                        checked={bookable ?? true}
                        onCheckedChange={(checked) => setValue('bookable_for_appointments', checked, { shouldDirty: true })}
                      />
                      <span className="text-sm text-gray-600">
                        {bookable ? 'Available for booking' : 'Not bookable'}
                      </span>
                    </div>
                  </FormField>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant={employee.status === 'active' ? 'destructive' : 'outline'}
                onClick={() => setShowDeactivate(true)}
              >
                {employee.status === 'active' ? 'Deactivate' : 'Reactivate'}
              </Button>
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => router.push('/admin/staff')}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving || !isDirty}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </form>
        </TabsContent>

        {/* Permissions Tab */}
        <TabsContent value="permissions">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Permission Overrides</CardTitle>
                <p className="text-sm text-gray-500">
                  Override the default permissions for the <Badge variant="info">{ROLE_LABELS[employee.role]}</Badge> role.
                  Click a permission to cycle through: Default, Grant, Deny.
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-8">
                  {Object.entries(PERMISSION_CATEGORIES).map(([catKey, category]) => (
                    <div key={catKey}>
                      <h3 className="mb-3 text-sm font-semibold text-gray-900">{category.label}</h3>
                      <div className="space-y-2">
                        {category.keys.map((permKey) => {
                          const overrideState = overrides[permKey] || 'default';
                          const roleDefault = getRoleDefault(permKey);
                          const effective = getEffectiveValue(permKey);

                          return (
                            <div
                              key={permKey}
                              className="flex items-center justify-between rounded-md border border-gray-200 px-4 py-2.5"
                            >
                              <div className="flex items-center gap-3">
                                <div
                                  className={`h-2.5 w-2.5 rounded-full ${
                                    effective ? 'bg-green-500' : 'bg-red-400'
                                  }`}
                                />
                                <span className="text-sm text-gray-700">
                                  {PERMISSION_LABELS[permKey] || permKey}
                                </span>
                                <span className="text-xs text-gray-400">
                                  (role default: {roleDefault ? 'granted' : 'denied'})
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => cycleOverride(permKey)}
                                className="rounded-md px-3 py-1 text-xs font-medium transition-colors"
                                style={{
                                  backgroundColor:
                                    overrideState === 'default'
                                      ? '#f3f4f6'
                                      : overrideState === 'grant'
                                      ? '#dcfce7'
                                      : '#fee2e2',
                                  color:
                                    overrideState === 'default'
                                      ? '#6b7280'
                                      : overrideState === 'grant'
                                      ? '#166534'
                                      : '#991b1b',
                                }}
                              >
                                {overrideState === 'default'
                                  ? 'Default'
                                  : overrideState === 'grant'
                                  ? 'Granted'
                                  : 'Denied'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button onClick={handleSavePermissions} disabled={savingPermissions}>
                {savingPermissions ? 'Saving...' : 'Save Permissions'}
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={showDeactivate}
        onOpenChange={setShowDeactivate}
        title={employee.status === 'active' ? 'Deactivate Staff Member' : 'Reactivate Staff Member'}
        description={
          employee.status === 'active'
            ? `Are you sure you want to deactivate ${employee.first_name} ${employee.last_name}? They will lose access to the system but their account will not be deleted.`
            : `Reactivate ${employee.first_name} ${employee.last_name}? They will regain access to the system.`
        }
        confirmLabel={employee.status === 'active' ? 'Deactivate' : 'Reactivate'}
        variant={employee.status === 'active' ? 'destructive' : 'default'}
        loading={deactivating}
        onConfirm={handleDeactivate}
      />
    </div>
  );
}

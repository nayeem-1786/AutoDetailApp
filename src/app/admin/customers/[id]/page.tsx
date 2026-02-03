'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import {
  customerUpdateSchema,
  vehicleSchema,
  type CustomerUpdateInput,
  type VehicleInput,
} from '@/lib/utils/validation';
import {
  VEHICLE_TYPE_LABELS,
  VEHICLE_SIZE_LABELS,
  VEHICLE_TYPE_SIZE_CLASSES,
  TRANSACTION_STATUS_LABELS,
} from '@/lib/utils/constants';
import type {
  Customer,
  Vehicle,
  LoyaltyLedger,
  Transaction,
  VehicleType,
  VehicleSizeClass,
  LoyaltyAction,
} from '@/lib/supabase/types';
import { formatCurrency, formatPhone, formatDate, formatDateTime, formatPoints, normalizePhone } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { FormField } from '@/components/ui/form-field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Spinner } from '@/components/ui/spinner';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { ArrowLeft, Plus, Pencil, Trash2, AlertTriangle, Car, Award, Clock, Receipt } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

export default function CustomerProfilePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const supabase = createClient();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [ledger, setLedger] = useState<LoyaltyLedger[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('info');

  // Vehicle dialog state
  const [vehicleDialogOpen, setVehicleDialogOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [deleteVehicleId, setDeleteVehicleId] = useState<string | null>(null);
  const [deletingVehicle, setDeletingVehicle] = useState(false);

  // Loyalty adjust dialog state
  const [loyaltyDialogOpen, setLoyaltyDialogOpen] = useState(false);
  const [loyaltyAdjust, setLoyaltyAdjust] = useState({ points_change: 0, description: '', action: 'adjusted' as LoyaltyAction });
  const [adjustingLoyalty, setAdjustingLoyalty] = useState(false);

  // Customer edit form
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<CustomerUpdateInput>({
    resolver: formResolver(customerUpdateSchema),
  });

  const smsConsent = watch('sms_consent');
  const emailConsent = watch('email_consent');

  // Vehicle form
  const vehicleForm = useForm<VehicleInput>({
    resolver: formResolver(vehicleSchema),
    defaultValues: {
      customer_id: id,
      vehicle_type: 'standard',
      size_class: 'sedan',
      year: undefined,
      make: '',
      model: '',
      color: '',
      vin: '',
      license_plate: '',
      notes: '',
    },
  });

  const watchVehicleType = vehicleForm.watch('vehicle_type');
  const availableSizeClasses = VEHICLE_TYPE_SIZE_CLASSES[watchVehicleType] || [];

  // Clear size_class when switching to a specialty type
  useEffect(() => {
    if (availableSizeClasses.length === 0) {
      vehicleForm.setValue('size_class', null);
    } else if (!vehicleForm.getValues('size_class')) {
      vehicleForm.setValue('size_class', availableSizeClasses[0] as VehicleSizeClass);
    }
  }, [watchVehicleType, availableSizeClasses, vehicleForm]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [custRes, vehRes, ledgerRes, txRes] = await Promise.all([
      supabase.from('customers').select('*').eq('id', id).single(),
      supabase.from('vehicles').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
      supabase.from('loyalty_ledger').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
      supabase.from('transactions').select('*, employee:employees(id, first_name, last_name)').eq('customer_id', id).order('transaction_date', { ascending: false }),
    ]);

    if (custRes.error || !custRes.data) {
      toast.error('Customer not found');
      router.push('/admin/customers');
      return;
    }

    setCustomer(custRes.data);
    reset({
      first_name: custRes.data.first_name,
      last_name: custRes.data.last_name,
      phone: custRes.data.phone || '',
      email: custRes.data.email || '',
      birthday: custRes.data.birthday || '',
      address_line_1: custRes.data.address_line_1 || '',
      address_line_2: custRes.data.address_line_2 || '',
      city: custRes.data.city || '',
      state: custRes.data.state || '',
      zip: custRes.data.zip || '',
      notes: custRes.data.notes || '',
      tags: custRes.data.tags || [],
      sms_consent: custRes.data.sms_consent,
      email_consent: custRes.data.email_consent,
    });

    if (vehRes.data) setVehicles(vehRes.data);
    if (ledgerRes.data) setLedger(ledgerRes.data);
    if (txRes.data) setTransactions(txRes.data);
    setLoading(false);
  }, [id, supabase, router, reset]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // --- Info Tab: Save customer ---
  async function onSaveInfo(data: CustomerUpdateInput) {
    if (!customer) return;
    setSaving(true);
    try {
      let phone = data.phone || null;
      if (phone) {
        const normalized = normalizePhone(phone);
        phone = normalized;
      }

      const { error } = await supabase
        .from('customers')
        .update({
          first_name: data.first_name,
          last_name: data.last_name,
          phone,
          email: data.email || null,
          birthday: data.birthday || null,
          address_line_1: data.address_line_1 || null,
          address_line_2: data.address_line_2 || null,
          city: data.city || null,
          state: data.state || null,
          zip: data.zip || null,
          notes: data.notes || null,
          tags: data.tags || [],
          sms_consent: data.sms_consent,
          email_consent: data.email_consent,
        })
        .eq('id', id);

      if (error) throw error;

      // Log consent changes
      if (data.sms_consent !== customer.sms_consent) {
        await supabase.from('marketing_consent_log').insert({
          customer_id: id,
          channel: 'sms',
          action: data.sms_consent ? 'opt_in' : 'opt_out',
          source: 'manual',
        });
      }
      if (data.email_consent !== customer.email_consent) {
        await supabase.from('marketing_consent_log').insert({
          customer_id: id,
          channel: 'email',
          action: data.email_consent ? 'opt_in' : 'opt_out',
          source: 'manual',
        });
      }

      toast.success('Customer updated successfully');
      await loadData();
    } catch (err) {
      console.error('Update customer error:', err);
      toast.error('Failed to update customer');
    } finally {
      setSaving(false);
    }
  }

  // --- Vehicles Tab ---
  function openAddVehicle() {
    setEditingVehicle(null);
    vehicleForm.reset({
      customer_id: id,
      vehicle_type: 'standard',
      size_class: 'sedan',
      year: undefined,
      make: '',
      model: '',
      color: '',
      vin: '',
      license_plate: '',
      notes: '',
    });
    setVehicleDialogOpen(true);
  }

  function openEditVehicle(vehicle: Vehicle) {
    setEditingVehicle(vehicle);
    vehicleForm.reset({
      customer_id: id,
      vehicle_type: vehicle.vehicle_type,
      size_class: vehicle.size_class,
      year: vehicle.year ?? undefined,
      make: vehicle.make || '',
      model: vehicle.model || '',
      color: vehicle.color || '',
      vin: vehicle.vin || '',
      license_plate: vehicle.license_plate || '',
      notes: vehicle.notes || '',
    });
    setVehicleDialogOpen(true);
  }

  async function onSaveVehicle(data: VehicleInput) {
    setSavingVehicle(true);
    try {
      const payload = {
        customer_id: id,
        vehicle_type: data.vehicle_type,
        size_class: availableSizeClasses.length > 0 ? data.size_class : null,
        year: data.year || null,
        make: data.make || null,
        model: data.model || null,
        color: data.color || null,
        vin: data.vin || null,
        license_plate: data.license_plate || null,
        notes: data.notes || null,
        is_incomplete: !data.make || !data.model,
      };

      if (editingVehicle) {
        const { error } = await supabase
          .from('vehicles')
          .update(payload)
          .eq('id', editingVehicle.id);
        if (error) throw error;
        toast.success('Vehicle updated');
      } else {
        const { error } = await supabase
          .from('vehicles')
          .insert(payload);
        if (error) throw error;
        toast.success('Vehicle added');
      }

      setVehicleDialogOpen(false);
      await loadData();
    } catch (err) {
      console.error('Save vehicle error:', err);
      toast.error('Failed to save vehicle');
    } finally {
      setSavingVehicle(false);
    }
  }

  async function handleDeleteVehicle() {
    if (!deleteVehicleId) return;
    setDeletingVehicle(true);
    try {
      const { error } = await supabase
        .from('vehicles')
        .delete()
        .eq('id', deleteVehicleId);
      if (error) throw error;
      toast.success('Vehicle removed');
      setDeleteVehicleId(null);
      await loadData();
    } catch (err) {
      console.error('Delete vehicle error:', err);
      toast.error('Failed to delete vehicle');
    } finally {
      setDeletingVehicle(false);
    }
  }

  // --- Loyalty Tab ---
  async function handleLoyaltyAdjust() {
    if (!customer) return;
    setAdjustingLoyalty(true);
    try {
      const newBalance = customer.loyalty_points_balance + loyaltyAdjust.points_change;

      // Insert ledger entry
      const { error: ledgerError } = await supabase
        .from('loyalty_ledger')
        .insert({
          customer_id: id,
          action: loyaltyAdjust.action,
          points_change: loyaltyAdjust.points_change,
          points_balance: newBalance,
          description: loyaltyAdjust.description || 'Manual adjustment',
        });

      if (ledgerError) throw ledgerError;

      // Update customer balance
      const { error: custError } = await supabase
        .from('customers')
        .update({ loyalty_points_balance: newBalance })
        .eq('id', id);

      if (custError) throw custError;

      toast.success('Loyalty points adjusted');
      setLoyaltyDialogOpen(false);
      setLoyaltyAdjust({ points_change: 0, description: '', action: 'adjusted' });
      await loadData();
    } catch (err) {
      console.error('Loyalty adjust error:', err);
      toast.error('Failed to adjust points');
    } finally {
      setAdjustingLoyalty(false);
    }
  }

  // Ledger table columns
  const ledgerColumns: ColumnDef<LoyaltyLedger, unknown>[] = [
    {
      id: 'date',
      header: 'Date',
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{formatDate(row.original.created_at)}</span>
      ),
    },
    {
      accessorKey: 'action',
      header: 'Action',
      cell: ({ row }) => {
        const action = row.original.action;
        const variants: Record<string, 'success' | 'destructive' | 'warning' | 'info' | 'default'> = {
          earned: 'success',
          redeemed: 'info',
          adjusted: 'warning',
          expired: 'destructive',
          welcome_bonus: 'success',
        };
        return (
          <Badge variant={variants[action] || 'default'}>
            {action.charAt(0).toUpperCase() + action.slice(1).replace('_', ' ')}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'points_change',
      header: 'Points',
      cell: ({ row }) => {
        const change = row.original.points_change;
        return (
          <span className={`text-sm font-medium ${change > 0 ? 'text-green-600' : 'text-red-600'}`}>
            {change > 0 ? '+' : ''}{formatPoints(change)}
          </span>
        );
      },
    },
    {
      accessorKey: 'points_balance',
      header: 'Balance',
      cell: ({ row }) => (
        <span className="text-sm text-gray-900">{formatPoints(row.original.points_balance)}</span>
      ),
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{row.original.description || '--'}</span>
      ),
    },
  ];

  // Transaction history columns
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transactionColumns: ColumnDef<any, unknown>[] = [
    {
      id: 'date',
      header: 'Date',
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{formatDateTime(row.original.transaction_date)}</span>
      ),
    },
    {
      id: 'receipt',
      header: 'Receipt #',
      cell: ({ row }) => (
        <span className="text-sm font-mono text-gray-900">{row.original.receipt_number ?? '—'}</span>
      ),
    },
    {
      id: 'employee',
      header: 'Employee',
      cell: ({ row }) => {
        const emp = row.original.employee;
        return (
          <span className="text-sm text-gray-600">
            {emp ? `${emp.first_name} ${emp.last_name}` : '—'}
          </span>
        );
      },
    },
    {
      id: 'method',
      header: 'Method',
      cell: ({ row }) => {
        const method = row.original.payment_method;
        return (
          <span className="text-sm text-gray-600">
            {method ? method.charAt(0).toUpperCase() + method.slice(1) : '—'}
          </span>
        );
      },
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.original.status;
        const variants: Record<string, 'success' | 'destructive' | 'warning' | 'info' | 'default'> = {
          completed: 'success',
          open: 'info',
          voided: 'destructive',
          refunded: 'destructive',
          partial_refund: 'warning',
        };
        return (
          <Badge variant={variants[status] || 'default'}>
            {TRANSACTION_STATUS_LABELS[status] || status}
          </Badge>
        );
      },
    },
    {
      id: 'total',
      header: () => <div className="text-right">Total</div>,
      cell: ({ row }) => (
        <div className="text-right text-sm font-medium text-gray-900">
          {formatCurrency(row.original.total_amount)}
        </div>
      ),
    },
  ];

  if (loading || !customer) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${customer.first_name} ${customer.last_name}`}
        description={
          [
            customer.phone ? formatPhone(customer.phone) : null,
            customer.email,
          ]
            .filter(Boolean)
            .join(' | ') || 'No contact info'
        }
        action={
          <Button variant="outline" onClick={() => router.push('/admin/customers')}>
            <ArrowLeft className="h-4 w-4" />
            Back to Customers
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="info">Info</TabsTrigger>
          <TabsTrigger value="vehicles">Vehicles ({vehicles.length})</TabsTrigger>
          <TabsTrigger value="loyalty">Loyalty</TabsTrigger>
          <TabsTrigger value="history">History ({transactions.length})</TabsTrigger>
        </TabsList>

        {/* ===== INFO TAB ===== */}
        <TabsContent value="info">
          <form onSubmit={handleSubmit(onSaveInfo)} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Contact Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 md:grid-cols-2">
                  <FormField label="First Name" error={errors.first_name?.message} required htmlFor="first_name">
                    <Input id="first_name" {...register('first_name')} />
                  </FormField>

                  <FormField label="Last Name" error={errors.last_name?.message} required htmlFor="last_name">
                    <Input id="last_name" {...register('last_name')} />
                  </FormField>

                  <FormField label="Phone" error={errors.phone?.message} htmlFor="phone">
                    <Input id="phone" {...register('phone')} placeholder="+1XXXXXXXXXX" />
                  </FormField>

                  <FormField label="Email" error={errors.email?.message} htmlFor="email">
                    <Input id="email" type="email" {...register('email')} />
                  </FormField>

                  <FormField label="Birthday" error={errors.birthday?.message} htmlFor="birthday">
                    <Input id="birthday" type="date" {...register('birthday')} />
                  </FormField>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Address</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <FormField label="Address Line 1" htmlFor="address_line_1">
                      <Input id="address_line_1" {...register('address_line_1')} />
                    </FormField>
                  </div>
                  <div className="md:col-span-2">
                    <FormField label="Address Line 2" htmlFor="address_line_2">
                      <Input id="address_line_2" {...register('address_line_2')} />
                    </FormField>
                  </div>
                  <FormField label="City" htmlFor="city">
                    <Input id="city" {...register('city')} />
                  </FormField>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField label="State" htmlFor="state">
                      <Input id="state" {...register('state')} maxLength={2} />
                    </FormField>
                    <FormField label="ZIP" htmlFor="zip">
                      <Input id="zip" {...register('zip')} />
                    </FormField>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Notes & Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6">
                  <FormField label="Notes" htmlFor="notes">
                    <Textarea id="notes" {...register('notes')} rows={3} />
                  </FormField>

                  <FormField
                    label="Tags"
                    htmlFor="tags"
                    description="Enter tags separated by commas"
                  >
                    <Input
                      id="tags"
                      defaultValue={customer.tags?.join(', ') || ''}
                      onChange={(e) => {
                        const tags = e.target.value
                          .split(',')
                          .map((t) => t.trim())
                          .filter(Boolean);
                        setValue('tags', tags, { shouldDirty: true });
                      }}
                    />
                    {customer.tags && customer.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(watch('tags') || customer.tags).map((tag) => (
                          <Badge key={tag} variant="secondary">{tag}</Badge>
                        ))}
                      </div>
                    )}
                  </FormField>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Marketing Consent</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-md border border-gray-200 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">SMS Marketing</p>
                      <p className="text-xs text-gray-500">Allow promotional text messages</p>
                    </div>
                    <Switch
                      checked={smsConsent ?? false}
                      onCheckedChange={(checked) => setValue('sms_consent', checked, { shouldDirty: true })}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-gray-200 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Email Marketing</p>
                      <p className="text-xs text-gray-500">Allow promotional emails</p>
                    </div>
                    <Switch
                      checked={emailConsent ?? false}
                      onCheckedChange={(checked) => setValue('email_consent', checked, { shouldDirty: true })}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => router.push('/admin/customers')}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !isDirty}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </TabsContent>

        {/* ===== VEHICLES TAB ===== */}
        <TabsContent value="vehicles">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={openAddVehicle}>
                <Plus className="h-4 w-4" />
                Add Vehicle
              </Button>
            </div>

            {vehicles.length === 0 ? (
              <EmptyState
                icon={Car}
                title="No vehicles"
                description="Add this customer's vehicles to track service history."
                action={
                  <Button onClick={openAddVehicle}>
                    <Plus className="h-4 w-4" />
                    Add Vehicle
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {vehicles.map((v) => (
                  <Card key={v.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-gray-900">
                              {[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Unknown Vehicle'}
                            </h3>
                            {v.is_incomplete && (
                              <Badge variant="warning">
                                <AlertTriangle className="mr-1 h-3 w-3" />
                                Incomplete
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <Badge variant="default">
                              {VEHICLE_TYPE_LABELS[v.vehicle_type]}
                            </Badge>
                            {v.size_class && (
                              <Badge variant="secondary">
                                {VEHICLE_SIZE_LABELS[v.size_class]}
                              </Badge>
                            )}
                          </div>
                          {v.color && <p className="text-sm text-gray-500">Color: {v.color}</p>}
                          {v.license_plate && <p className="text-sm text-gray-500">Plate: {v.license_plate}</p>}
                          {v.vin && <p className="font-mono text-xs text-gray-400">VIN: {v.vin}</p>}
                          {v.notes && <p className="text-xs text-gray-500 italic">{v.notes}</p>}
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditVehicle(v)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteVehicleId(v.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Vehicle Dialog */}
          <Dialog open={vehicleDialogOpen} onOpenChange={setVehicleDialogOpen}>
            <DialogClose onClose={() => setVehicleDialogOpen(false)} />
            <DialogHeader>
              <DialogTitle>{editingVehicle ? 'Edit Vehicle' : 'Add Vehicle'}</DialogTitle>
            </DialogHeader>
            <DialogContent>
              <form
                id="vehicle-form"
                onSubmit={vehicleForm.handleSubmit(onSaveVehicle)}
                className="space-y-4"
              >
                <FormField
                  label="Vehicle Type"
                  error={vehicleForm.formState.errors.vehicle_type?.message}
                  required
                  htmlFor="vehicle_type"
                >
                  <Select id="vehicle_type" {...vehicleForm.register('vehicle_type')}>
                    {Object.entries(VEHICLE_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </Select>
                </FormField>

                {availableSizeClasses.length > 0 && (
                  <FormField
                    label="Size Class"
                    error={vehicleForm.formState.errors.size_class?.message}
                    required
                    htmlFor="size_class"
                  >
                    <Select id="size_class" {...vehicleForm.register('size_class')}>
                      {availableSizeClasses.map((sc) => (
                        <option key={sc} value={sc}>{VEHICLE_SIZE_LABELS[sc]}</option>
                      ))}
                    </Select>
                  </FormField>
                )}

                <div className="grid grid-cols-3 gap-3">
                  <FormField label="Year" error={vehicleForm.formState.errors.year?.message} htmlFor="veh_year">
                    <Input
                      id="veh_year"
                      type="number"
                      min="1900"
                      max="2100"
                      {...vehicleForm.register('year')}
                      placeholder="2024"
                    />
                  </FormField>

                  <FormField label="Make" error={vehicleForm.formState.errors.make?.message} htmlFor="veh_make">
                    <Input id="veh_make" {...vehicleForm.register('make')} placeholder="Toyota" />
                  </FormField>

                  <FormField label="Model" error={vehicleForm.formState.errors.model?.message} htmlFor="veh_model">
                    <Input id="veh_model" {...vehicleForm.register('model')} placeholder="Camry" />
                  </FormField>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Color" htmlFor="veh_color">
                    <Input id="veh_color" {...vehicleForm.register('color')} placeholder="Black" />
                  </FormField>

                  <FormField label="License Plate" htmlFor="license_plate">
                    <Input id="license_plate" {...vehicleForm.register('license_plate')} placeholder="ABC1234" />
                  </FormField>
                </div>

                <FormField label="VIN" htmlFor="vin">
                  <Input id="vin" {...vehicleForm.register('vin')} placeholder="17-character VIN" />
                </FormField>

                <FormField label="Notes" htmlFor="veh_notes">
                  <Textarea id="veh_notes" {...vehicleForm.register('notes')} rows={2} placeholder="Any notes about this vehicle..." />
                </FormField>
              </form>
            </DialogContent>
            <DialogFooter>
              <Button variant="outline" onClick={() => setVehicleDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" form="vehicle-form" disabled={savingVehicle}>
                {savingVehicle ? 'Saving...' : editingVehicle ? 'Update Vehicle' : 'Add Vehicle'}
              </Button>
            </DialogFooter>
          </Dialog>

          {/* Delete Vehicle Confirm */}
          <ConfirmDialog
            open={!!deleteVehicleId}
            onOpenChange={(open) => { if (!open) setDeleteVehicleId(null); }}
            title="Delete Vehicle"
            description="Are you sure you want to remove this vehicle? This action cannot be undone."
            confirmLabel="Delete"
            variant="destructive"
            loading={deletingVehicle}
            onConfirm={handleDeleteVehicle}
          />
        </TabsContent>

        {/* ===== LOYALTY TAB ===== */}
        <TabsContent value="loyalty">
          <div className="space-y-6">
            {/* Balance Card */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Current Balance</p>
                    <p className="text-4xl font-bold text-gray-900">
                      {formatPoints(customer.loyalty_points_balance)}
                    </p>
                    <p className="mt-1 text-sm text-gray-500">
                      Worth {formatCurrency(customer.loyalty_points_balance * 0.05)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Award className="h-10 w-10 text-amber-500" />
                  </div>
                </div>
                <div className="mt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setLoyaltyAdjust({ points_change: 0, description: '', action: 'adjusted' });
                      setLoyaltyDialogOpen(true);
                    }}
                  >
                    Manual Adjust
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Ledger Table */}
            <Card>
              <CardHeader>
                <CardTitle>Points History</CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable
                  columns={ledgerColumns}
                  data={ledger}
                  emptyTitle="No loyalty activity"
                  emptyDescription="Points earned and redeemed will appear here."
                  pageSize={10}
                />
              </CardContent>
            </Card>
          </div>

          {/* Loyalty Adjust Dialog */}
          <Dialog open={loyaltyDialogOpen} onOpenChange={setLoyaltyDialogOpen}>
            <DialogClose onClose={() => setLoyaltyDialogOpen(false)} />
            <DialogHeader>
              <DialogTitle>Adjust Loyalty Points</DialogTitle>
            </DialogHeader>
            <DialogContent>
              <div className="space-y-4">
                <FormField label="Action Type" htmlFor="loyalty_action">
                  <Select
                    id="loyalty_action"
                    value={loyaltyAdjust.action}
                    onChange={(e) => setLoyaltyAdjust((prev) => ({ ...prev, action: e.target.value as LoyaltyAction }))}
                  >
                    <option value="adjusted">Adjustment</option>
                    <option value="earned">Earned</option>
                    <option value="redeemed">Redeemed</option>
                    <option value="expired">Expired</option>
                    <option value="welcome_bonus">Welcome Bonus</option>
                  </Select>
                </FormField>

                <FormField label="Points Change" description="Use negative numbers to deduct points" htmlFor="points_change">
                  <Input
                    id="points_change"
                    type="number"
                    value={loyaltyAdjust.points_change}
                    onChange={(e) => setLoyaltyAdjust((prev) => ({ ...prev, points_change: parseInt(e.target.value) || 0 }))}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    New balance will be: {formatPoints(customer.loyalty_points_balance + loyaltyAdjust.points_change)}
                  </p>
                </FormField>

                <FormField label="Description" htmlFor="loyalty_description">
                  <Input
                    id="loyalty_description"
                    value={loyaltyAdjust.description}
                    onChange={(e) => setLoyaltyAdjust((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Reason for adjustment..."
                  />
                </FormField>
              </div>
            </DialogContent>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLoyaltyDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleLoyaltyAdjust}
                disabled={adjustingLoyalty || loyaltyAdjust.points_change === 0}
              >
                {adjustingLoyalty ? 'Adjusting...' : 'Apply Adjustment'}
              </Button>
            </DialogFooter>
          </Dialog>
        </TabsContent>

        {/* ===== HISTORY TAB ===== */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Transaction History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={transactionColumns}
                data={transactions}
                emptyTitle="No transactions"
                emptyDescription="Completed transactions will appear here."
                pageSize={10}
              />
            </CardContent>
          </Card>

          {/* Quick stats */}
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-gray-500">Total Visits</p>
                <p className="text-2xl font-bold text-gray-900">{customer.visit_count}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-gray-500">Lifetime Spend</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(customer.lifetime_spend)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-gray-500">First Visit</p>
                <p className="text-2xl font-bold text-gray-900">
                  {customer.first_visit_date ? formatDate(customer.first_visit_date) : 'N/A'}
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

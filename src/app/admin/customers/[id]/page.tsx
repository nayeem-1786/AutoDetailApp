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
import { formatCurrency, formatPhone, formatPhoneInput, formatDate, formatDateTime, formatPoints, normalizePhone } from '@/lib/utils/format';
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
import { ArrowLeft, Plus, Pencil, Trash2, AlertTriangle, Car, Award, Clock, Receipt, User, Printer, Copy, Mail, MessageSquare, Loader2, Check, CalendarDays, DollarSign, ShoppingCart } from 'lucide-react';
import { CustomerTypeBadge } from '@/app/pos/components/customer-type-badge';
import { generateReceiptLines, generateReceiptHtml } from '@/app/pos/lib/receipt-template';
import type { ReceiptTransaction } from '@/app/pos/lib/receipt-template';
import type { MergedReceiptConfig } from '@/lib/data/receipt-config';
import { printReceipt } from '@/app/pos/lib/star-printer';
import { useAuth } from '@/lib/auth/auth-provider';
import type { ColumnDef } from '@tanstack/react-table';

export default function CustomerProfilePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const supabase = createClient();
  const { employee: adminEmployee } = useAuth();

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

  // Password reset state
  const [sendingReset, setSendingReset] = useState(false);

  // Receipt dialog state
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [receiptTransaction, setReceiptTransaction] = useState<any>(null);
  const [receiptHtml, setReceiptHtml] = useState('');
  const [receiptConfig, setReceiptConfig] = useState<MergedReceiptConfig | undefined>(undefined);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [receiptPrinting, setReceiptPrinting] = useState(false);
  const [receiptPrinted, setReceiptPrinted] = useState(false);
  const [receiptEmailing, setReceiptEmailing] = useState(false);
  const [receiptEmailed, setReceiptEmailed] = useState(false);
  const [receiptSmsing, setReceiptSmsing] = useState(false);
  const [receiptSmsed, setReceiptSmsed] = useState(false);
  const [showReceiptEmailInput, setShowReceiptEmailInput] = useState(false);
  const [receiptEmailInput, setReceiptEmailInput] = useState('');
  const [showReceiptSmsInput, setShowReceiptSmsInput] = useState(false);
  const [receiptSmsInput, setReceiptSmsInput] = useState('');

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
  const watchPhone = watch('phone');
  const watchEmail = watch('email');

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
          description: `${loyaltyAdjust.description || 'Manual adjustment'} (by ${adminEmployee?.first_name ?? 'Admin'} ${adminEmployee?.last_name ?? ''})`.trim(),
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

  // --- Receipt Dialog ---
  async function openReceiptDialog(transactionId: string) {
    setLoadingReceipt(true);
    setReceiptDialogOpen(true);
    setReceiptPrinted(false);
    setReceiptEmailed(false);
    setReceiptSmsed(false);
    setShowReceiptEmailInput(false);
    setShowReceiptSmsInput(false);
    try {
      const res = await fetch(`/api/pos/transactions/${transactionId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load transaction');
      const tx = json.data;
      const rcfg: MergedReceiptConfig | undefined = json.receipt_config ?? undefined;
      setReceiptTransaction(tx);
      setReceiptConfig(rcfg);
      setReceiptEmailInput(tx.customer?.email || customer?.email || '');
      setReceiptSmsInput(tx.customer?.phone ? formatPhone(tx.customer.phone) : customer?.phone ? formatPhone(customer.phone) : '');
      const html = generateReceiptHtml({
        receipt_number: tx.receipt_number,
        transaction_date: tx.transaction_date,
        subtotal: tx.subtotal,
        tax_amount: tx.tax_amount,
        discount_amount: tx.discount_amount,
        coupon_code: tx.coupon_code,
        loyalty_discount: tx.loyalty_discount,
        loyalty_points_redeemed: tx.loyalty_points_redeemed,
        tip_amount: tx.tip_amount,
        total_amount: tx.total_amount,
        customer: tx.customer,
        employee: tx.employee,
        vehicle: tx.vehicle,
        items: tx.items ?? [],
        payments: tx.payments ?? [],
      }, rcfg);
      setReceiptHtml(html);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load receipt');
      setReceiptDialogOpen(false);
    } finally {
      setLoadingReceipt(false);
    }
  }

  async function handleReceiptPrint() {
    if (!receiptTransaction) return;
    setReceiptPrinting(true);
    try {
      const res = await fetch('/api/pos/receipts/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: receiptTransaction.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Print failed');
      const printConfig: MergedReceiptConfig | undefined = json.data.receipt_config ?? receiptConfig;
      const lines = generateReceiptLines(json.data.transaction, printConfig);
      await printReceipt(json.data.printer_ip, lines);
      setReceiptPrinted(true);
      toast.success('Receipt printed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Print failed');
    } finally {
      setReceiptPrinting(false);
    }
  }

  function handleReceiptCopierPrint() {
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      toast.error('Pop-up blocked — allow pop-ups and try again');
      return;
    }
    printWindow.document.write(receiptHtml);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  async function handleReceiptEmail(email: string) {
    if (!email || !receiptTransaction) return;
    setReceiptEmailing(true);
    try {
      const res = await fetch('/api/pos/receipts/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: receiptTransaction.id, email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Email failed');
      setReceiptEmailed(true);
      setShowReceiptEmailInput(false);
      toast.success(`Receipt emailed to ${email}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setReceiptEmailing(false);
    }
  }

  async function handleReceiptSms(phone: string) {
    if (!phone || !receiptTransaction) return;
    setReceiptSmsing(true);
    try {
      const res = await fetch('/api/pos/receipts/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: receiptTransaction.id, phone }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'SMS failed');
      setReceiptSmsed(true);
      setShowReceiptSmsInput(false);
      toast.success('Receipt sent via SMS');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send SMS');
    } finally {
      setReceiptSmsing(false);
    }
  }

  // --- Password Reset ---
  async function handleSendPasswordReset() {
    if (!customer) return;
    setSendingReset(true);
    try {
      const res = await fetch(`/api/admin/customers/${customer.id}/reset-password`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to send reset email');
      toast.success('Password reset email sent');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send password reset');
    } finally {
      setSendingReset(false);
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
      cell: ({ row }) => {
        const receiptNum = row.original.receipt_number;
        if (!receiptNum) return <span className="text-sm text-gray-400">—</span>;
        return (
          <button
            type="button"
            onClick={() => openReceiptDialog(row.original.id)}
            className="text-sm font-mono text-blue-600 hover:text-blue-800 hover:underline"
          >
            {receiptNum}
          </button>
        );
      },
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
        title={
          <span className="flex items-center gap-2">
            {customer.first_name} {customer.last_name}
            <CustomerTypeBadge
              customerId={customer.id}
              customerType={customer.customer_type}
              size="md"
              onTypeChanged={(newType) => {
                setCustomer((prev) => prev ? { ...prev, customer_type: newType } : prev);
              }}
            />
          </span>
        }
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
            {/* Customer Type + Customer Journey Card */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                  {/* Customer Type section */}
                  <div className="flex-shrink-0">
                    <CardTitle className="mb-3">Customer Type</CardTitle>
                    <div className="flex gap-2">
                      {([null, 'enthusiast', 'professional'] as const).map((type) => {
                        const isActive = customer.customer_type === type;
                        const label = type === null ? 'Unknown' : type === 'enthusiast' ? 'Enthusiast' : 'Professional';
                        const activeClass =
                          type === null
                            ? 'border-gray-400 bg-gray-50 text-gray-700'
                            : type === 'enthusiast'
                              ? 'border-blue-400 bg-blue-50 text-blue-700'
                              : 'border-purple-400 bg-purple-50 text-purple-700';
                        return (
                          <button
                            key={type ?? 'none'}
                            type="button"
                            onClick={async () => {
                              try {
                                const res = await fetch(`/api/pos/customers/${customer.id}/type`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ customer_type: type }),
                                });
                                const json = await res.json();
                                if (!res.ok) throw new Error(json.error || 'Failed to update');
                                setCustomer((prev) => prev ? { ...prev, customer_type: json.data?.customer_type ?? type } : prev);
                                toast.success(type ? `Marked as ${label}` : 'Customer type cleared');
                              } catch {
                                toast.error('Failed to update customer type');
                              }
                            }}
                            className={`rounded-lg border-2 px-4 py-2 text-sm font-medium transition-all ${
                              isActive
                                ? activeClass
                                : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Vertical divider */}
                  <div className="hidden sm:flex sm:items-center sm:px-10 self-stretch">
                    <div className="h-3/4 w-px bg-gray-200" />
                  </div>

                  {/* Customer Journey section */}
                  <div className="flex-shrink-0">
                    <CardTitle className="mb-3">Customer Journey</CardTitle>
                    <div className="flex gap-2">
                      <div className="flex flex-col items-center rounded-lg border-2 border-gray-200 bg-gray-50 px-4 py-2">
                        <span className="text-xs text-gray-500">Customer Since</span>
                        <span className="text-sm font-medium text-gray-700">
                          {customer.first_visit_date
                            ? formatDate(customer.first_visit_date)
                            : customer.created_at
                              ? formatDate(customer.created_at)
                              : 'N/A'}
                        </span>
                      </div>
                      <div className="flex flex-col items-center rounded-lg border-2 border-gray-200 bg-gray-50 px-4 py-2">
                        <span className="text-xs text-gray-500">Visits</span>
                        <span className="text-sm font-medium text-gray-700">{transactions.length}</span>
                      </div>
                      <div className="flex flex-col items-center rounded-lg border-2 border-gray-200 bg-gray-50 px-4 py-2">
                        <span className="text-xs text-gray-500">Lifetime Spend</span>
                        <span className="text-sm font-medium text-gray-700">{formatCurrency(customer.lifetime_spend)}</span>
                      </div>
                      <div className="flex flex-col items-center rounded-lg border-2 border-gray-200 bg-gray-50 px-4 py-2">
                        <span className="text-xs text-gray-500">Last Visit</span>
                        <span className="text-sm font-medium text-gray-700">
                          {customer.last_visit_date ? formatDate(customer.last_visit_date) : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Vertical divider */}
                  <div className="hidden sm:flex sm:items-center sm:px-10 self-stretch">
                    <div className="h-3/4 w-px bg-gray-200" />
                  </div>

                  {/* Online Access section */}
                  <div className="flex-shrink-0">
                    <CardTitle className="mb-3">Online Access</CardTitle>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">Portal Access:</span>
                        {customer.auth_user_id ? (
                          <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                            <span className="h-2 w-2 rounded-full bg-green-500" />
                            Active
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-sm font-medium text-gray-500">
                            <span className="h-2 w-2 rounded-full bg-gray-400" />
                            None
                          </span>
                        )}
                      </div>
                      {customer.auth_user_id && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleSendPasswordReset}
                          disabled={sendingReset || !customer.email}
                          title={!customer.email ? 'No email address on file' : undefined}
                        >
                          {sendingReset ? (
                            <>
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              Sending...
                            </>
                          ) : (
                            'Send Password Reset'
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Contact & Address</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-x-4 gap-y-3 grid-cols-4">
                  {/* Row 1: Name, Mobile, Email */}
                  <FormField label="First Name" error={errors.first_name?.message} required htmlFor="first_name">
                    <Input id="first_name" {...register('first_name')} />
                  </FormField>
                  <FormField label="Last Name" error={errors.last_name?.message} required htmlFor="last_name">
                    <Input id="last_name" {...register('last_name')} />
                  </FormField>
                  <FormField label="Mobile" error={errors.phone?.message} htmlFor="phone">
                    <Input
                      id="phone"
                      placeholder="(310) 555-1234"
                      {...register('phone', {
                        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                          const formatted = formatPhoneInput(e.target.value);
                          setValue('phone', formatted, { shouldDirty: true });
                        },
                      })}
                    />
                  </FormField>
                  <FormField label="Email" error={errors.email?.message} htmlFor="email">
                    <Input id="email" type="email" {...register('email')} />
                  </FormField>
                  {/* Row 2: Address, Address 2, Birthday */}
                  <FormField label="Address" htmlFor="address_line_1">
                    <Input id="address_line_1" {...register('address_line_1')} placeholder="Street address" />
                  </FormField>
                  <FormField label="Address 2" htmlFor="address_line_2">
                    <Input id="address_line_2" {...register('address_line_2')} placeholder="Apt, suite" />
                  </FormField>
                  <div />
                  <FormField label="Birthday" error={errors.birthday?.message} htmlFor="birthday">
                    <Input id="birthday" type="date" {...register('birthday')} />
                  </FormField>
                  {/* Row 3: City = Address width, State + ZIP = Address 2 width */}
                  <FormField label="City" htmlFor="city">
                    <Input id="city" {...register('city')} />
                  </FormField>
                  <div className="grid grid-cols-2 gap-x-2">
                    <FormField label="State" htmlFor="state">
                      <Input id="state" {...register('state')} maxLength={2} placeholder="CA" />
                    </FormField>
                    <FormField label="ZIP" htmlFor="zip">
                      <Input id="zip" {...register('zip')} placeholder="90717" />
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
                  <div>
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
                    {smsConsent && !watchPhone && (
                      <div className="mt-1.5 flex items-center gap-1.5 px-1 text-xs text-amber-600">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        SMS consent is on but no mobile number is on file. Add a mobile number or turn this off.
                      </div>
                    )}
                  </div>
                  <div>
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
                    {emailConsent && !watchEmail && (
                      <div className="mt-1.5 flex items-center gap-1.5 px-1 text-xs text-amber-600">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        Email consent is on but no email address is on file. Add an email or turn this off.
                      </div>
                    )}
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
                    value={loyaltyAdjust.points_change || ''}
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
          {/* Stat cards */}
          <div className="mb-4 grid gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <CalendarDays className="h-4 w-4" />
                  Customer Since
                </div>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {customer.first_visit_date
                    ? formatDate(customer.first_visit_date)
                    : customer.created_at
                      ? formatDate(customer.created_at)
                      : 'N/A'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <ShoppingCart className="h-4 w-4" />
                  Total Transactions
                </div>
                <p className="mt-1 text-2xl font-bold text-gray-900">{transactions.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <DollarSign className="h-4 w-4" />
                  Lifetime Spend
                </div>
                <p className="mt-1 text-2xl font-bold text-gray-900">{formatCurrency(customer.lifetime_spend)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Clock className="h-4 w-4" />
                  Last Purchase
                </div>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {customer.last_visit_date ? formatDate(customer.last_visit_date) : 'N/A'}
                </p>
              </CardContent>
            </Card>
          </div>

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

          {/* Receipt Detail Dialog */}
          <Dialog open={receiptDialogOpen} onOpenChange={setReceiptDialogOpen}>
            <DialogClose onClose={() => setReceiptDialogOpen(false)} />
            <DialogHeader>
              <DialogTitle>
                Receipt {receiptTransaction?.receipt_number ? `#${receiptTransaction.receipt_number}` : ''}
              </DialogTitle>
            </DialogHeader>
            <DialogContent className="max-h-[60vh] overflow-y-auto">
              {loadingReceipt ? (
                <div className="flex items-center justify-center py-8">
                  <Spinner size="lg" />
                </div>
              ) : (
                <div
                  className="rounded border border-gray-200 bg-gray-50 p-2"
                  dangerouslySetInnerHTML={{ __html: receiptHtml }}
                />
              )}
            </DialogContent>
            {!loadingReceipt && receiptTransaction && (
              <DialogFooter className="flex-col items-stretch gap-3">
                <div className="grid grid-cols-4 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReceiptCopierPrint}
                  >
                    <Printer className="mr-1.5 h-4 w-4" />
                    Print
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const email = receiptTransaction.customer?.email || customer?.email;
                      if (email) {
                        handleReceiptEmail(email);
                      } else {
                        setShowReceiptEmailInput(true);
                      }
                    }}
                    disabled={receiptEmailing || receiptEmailed}
                  >
                    {receiptEmailing ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : receiptEmailed ? (
                      <Check className="mr-1.5 h-4 w-4 text-green-500" />
                    ) : (
                      <Mail className="mr-1.5 h-4 w-4" />
                    )}
                    Email
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const phone = receiptTransaction.customer?.phone || customer?.phone;
                      if (phone) {
                        handleReceiptSms(phone);
                      } else {
                        setShowReceiptSmsInput(true);
                      }
                    }}
                    disabled={receiptSmsing || receiptSmsed}
                  >
                    {receiptSmsing ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : receiptSmsed ? (
                      <Check className="mr-1.5 h-4 w-4 text-green-500" />
                    ) : (
                      <MessageSquare className="mr-1.5 h-4 w-4" />
                    )}
                    SMS
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReceiptPrint}
                    disabled={receiptPrinting || receiptPrinted}
                  >
                    {receiptPrinting ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : receiptPrinted ? (
                      <Check className="mr-1.5 h-4 w-4 text-green-500" />
                    ) : (
                      <Receipt className="mr-1.5 h-4 w-4" />
                    )}
                    Receipt
                  </Button>
                </div>

                {/* Email input */}
                {showReceiptEmailInput && (
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      value={receiptEmailInput}
                      onChange={(e) => setReceiptEmailInput(e.target.value)}
                      placeholder="customer@email.com"
                      className="h-8 text-xs"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleReceiptEmail(receiptEmailInput);
                      }}
                    />
                    <Button
                      size="sm"
                      className="h-8"
                      onClick={() => handleReceiptEmail(receiptEmailInput)}
                      disabled={!receiptEmailInput || receiptEmailing}
                    >
                      Send
                    </Button>
                  </div>
                )}

                {/* SMS input */}
                {showReceiptSmsInput && (
                  <div className="flex gap-2">
                    <Input
                      type="tel"
                      value={receiptSmsInput}
                      onChange={(e) => setReceiptSmsInput(e.target.value)}
                      placeholder="(310) 555-0123"
                      className="h-8 text-xs"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleReceiptSms(receiptSmsInput);
                      }}
                    />
                    <Button
                      size="sm"
                      className="h-8"
                      onClick={() => handleReceiptSms(receiptSmsInput)}
                      disabled={!receiptSmsInput || receiptSmsing}
                    >
                      Send
                    </Button>
                  </div>
                )}
              </DialogFooter>
            )}
          </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}

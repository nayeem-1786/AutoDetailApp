'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { usePermission } from '@/lib/hooks/use-permission';
import {
  customerUpdateSchema,
  vehicleSchema,
  type CustomerUpdateInput,
  type VehicleInput,
} from '@/lib/utils/validation';
import {
  VEHICLE_SIZE_LABELS,
  TRANSACTION_STATUS_LABELS,
  QUOTE_STATUS_LABELS,
} from '@/lib/utils/constants';
import {
  VEHICLE_CATEGORIES,
  VEHICLE_CATEGORY_LABELS,
  SPECIALTY_TIERS,
  TIER_DROPDOWN_LABELS,
  MODEL_PLACEHOLDERS,
  isSpecialtyCategory,
  getSpecialtyTierLabel,
  type VehicleCategory,
} from '@/lib/utils/vehicle-categories';
import type {
  Customer,
  Vehicle,
  LoyaltyLedger,
  Transaction,
  LoyaltyAction,
  Quote,
  QuoteStatus,
  CustomerType,
} from '@/lib/supabase/types';
import { formatCurrency, formatPhone, formatPhoneInput, formatDate, formatDateTime, formatPoints } from '@/lib/utils/format';
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
import { ArrowLeft, Plus, Pencil, Trash2, AlertTriangle, Car, Award, Clock, Receipt, User, Loader2, Check, CalendarDays, DollarSign, ShoppingCart, FileText, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { CustomerTypeBadge } from '@/app/pos/components/customer-type-badge';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { VehicleMakeCombobox, getVehicleYearOptions, titleCaseField } from '@/components/ui/vehicle-make-combobox';
import { Pagination } from '@/components/ui/pagination';
import { useAuth } from '@/lib/auth/auth-provider';
import { ReceiptDialog } from '@/components/admin/receipt-dialog';
import type { ColumnDef } from '@tanstack/react-table';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
  'DC',
];

export default function CustomerProfilePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const supabase = createClient();
  const { employee: adminEmployee } = useAuth();
  const { granted: canDeleteCustomer } = usePermission('customers.delete');
  const { granted: canEditCustomer } = usePermission('customers.edit');
  const { granted: canAdjustLoyalty } = usePermission('customers.adjust_loyalty');
  const { granted: canExportCustomers } = usePermission('customers.export');

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [ledger, setLedger] = useState<LoyaltyLedger[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('info');

  // Vehicle dialog state
  const [vehicleDialogOpen, setVehicleDialogOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [deleteVehicleId, setDeleteVehicleId] = useState<string | null>(null);
  const [deletingVehicle, setDeletingVehicle] = useState(false);
  const [vehicleCategory, setVehicleCategory] = useState<VehicleCategory>('automobile');
  const [yearOtherMode, setYearOtherMode] = useState(false);

  // Loyalty adjust dialog state
  const [loyaltyDialogOpen, setLoyaltyDialogOpen] = useState(false);
  const [loyaltyAdjust, setLoyaltyAdjust] = useState({ points_change: 0, description: '', action: 'adjusted' as LoyaltyAction });
  const [adjustingLoyalty, setAdjustingLoyalty] = useState(false);

  // Password reset state
  const [sendingReset, setSendingReset] = useState(false);

  // Portal access state
  const [deactivatingPortal, setDeactivatingPortal] = useState(false);
  const [reactivatingPortal, setReactivatingPortal] = useState(false);
  const [confirmDeactivateOpen, setConfirmDeactivateOpen] = useState(false);

  // Delete customer state
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0); // 0=closed, 1=first confirm, 2=final confirm
  const [deletingCustomer, setDeletingCustomer] = useState(false);

  // Receipt dialog state
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [receiptTransactionId, setReceiptTransactionId] = useState<string | null>(null);

  // Customer type (separate from form, like create page)
  const [customerType, setCustomerType] = useState<CustomerType | null>(null);
  const [typeError, setTypeError] = useState(false);

  // Birthday fields (month/day/year dropdowns, not date input)
  const [birthMonth, setBirthMonth] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [birthdayError, setBirthdayError] = useState('');

  // Duplicate check state
  const [phoneDup, setPhoneDup] = useState<{ name: string } | null>(null);
  const [emailDup, setEmailDup] = useState<{ name: string } | null>(null);
  const [emailFormatError, setEmailFormatError] = useState('');
  const phoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-toggle refs
  const prevPhoneHadValue = useRef(false);
  const prevEmailHadValue = useRef(false);

  // Phone required validation
  const [phoneRequired, setPhoneRequired] = useState(false);

  // Customer edit form
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<CustomerUpdateInput>({
    resolver: formResolver(customerUpdateSchema),
  });

  const smsConsent = watch('sms_consent');
  const emailConsent = watch('email_consent');
  const watchPhone = watch('phone');
  const watchEmail = watch('email');

  // Sync customerType from customer state (e.g. when summary card changes it)
  useEffect(() => {
    if (customer) setCustomerType(customer.customer_type);
  }, [customer]);

  // Auto-toggle SMS consent on empty↔filled transitions
  useEffect(() => {
    const hasValue = (watchPhone || '').replace(/\D/g, '').length > 0;
    if (hasValue && !prevPhoneHadValue.current) {
      setValue('sms_consent', true, { shouldDirty: true });
    } else if (!hasValue && prevPhoneHadValue.current) {
      setValue('sms_consent', false, { shouldDirty: true });
    }
    prevPhoneHadValue.current = hasValue;
  }, [watchPhone, setValue]);

  // Auto-toggle Email consent on empty↔filled transitions
  useEffect(() => {
    const hasValue = (watchEmail || '').trim().length > 0;
    if (hasValue && !prevEmailHadValue.current) {
      setValue('email_consent', true, { shouldDirty: true });
    } else if (!hasValue && prevEmailHadValue.current) {
      setValue('email_consent', false, { shouldDirty: true });
    }
    prevEmailHadValue.current = hasValue;
  }, [watchEmail, setValue]);

  // Debounced phone duplicate check (excludes self)
  useEffect(() => {
    if (phoneTimerRef.current) clearTimeout(phoneTimerRef.current);

    const digits = (watchPhone || '').replace(/\D/g, '');
    if (digits.length < 10) {
      setPhoneDup(null);
      return;
    }

    phoneTimerRef.current = setTimeout(async () => {
      try {
        const res = await adminFetch(`/api/admin/customers/check-duplicate?phone=${encodeURIComponent(watchPhone || '')}&excludeId=${id}`);
        const json = await res.json();
        if (json.exists && json.field === 'phone') {
          setPhoneDup({ name: `${json.match.first_name} ${json.match.last_name}` });
        } else {
          setPhoneDup(null);
        }
      } catch {
        setPhoneDup(null);
      }
    }, 500);

    return () => {
      if (phoneTimerRef.current) clearTimeout(phoneTimerRef.current);
    };
  }, [watchPhone, id]);

  // Debounced email duplicate check + format validation (excludes self)
  useEffect(() => {
    if (emailTimerRef.current) clearTimeout(emailTimerRef.current);

    const trimmed = (watchEmail || '').trim();
    if (!trimmed) {
      setEmailDup(null);
      setEmailFormatError('');
      return;
    }

    const atIdx = trimmed.indexOf('@');
    if (atIdx === -1 || trimmed.indexOf('.', atIdx) === -1) {
      setEmailFormatError('Please enter a valid email address');
      setEmailDup(null);
      return;
    }
    setEmailFormatError('');

    emailTimerRef.current = setTimeout(async () => {
      try {
        const res = await adminFetch(`/api/admin/customers/check-duplicate?email=${encodeURIComponent(trimmed)}&excludeId=${id}`);
        const json = await res.json();
        if (json.exists && json.field === 'email') {
          setEmailDup({ name: `${json.match.first_name} ${json.match.last_name}` });
        } else {
          setEmailDup(null);
        }
      } catch {
        setEmailDup(null);
      }
    }, 500);

    return () => {
      if (emailTimerRef.current) clearTimeout(emailTimerRef.current);
    };
  }, [watchEmail, id]);

  // Birthday validation
  useEffect(() => {
    if ((birthMonth && !birthDay) || (!birthMonth && birthDay)) {
      setBirthdayError('Both month and day are required');
    } else if (birthYear) {
      const yr = parseInt(birthYear);
      const currentYear = new Date().getFullYear();
      if (isNaN(yr) || yr < 1920 || yr > currentYear) {
        setBirthdayError(`Year must be between 1920 and ${currentYear}`);
      } else {
        setBirthdayError('');
      }
    } else {
      setBirthdayError('');
    }
  }, [birthMonth, birthDay, birthYear]);

  // Computed error state
  const phoneDigits = (watchPhone || '').replace(/\D/g, '');
  const isPhoneEmpty = phoneDigits.length === 0;
  const hasDuplicateError = !!phoneDup || !!emailDup;
  const hasEmailFormatError = !!emailFormatError;
  const hasBirthdayError = !!birthdayError;
  const hasAnyError = hasDuplicateError || hasEmailFormatError || hasBirthdayError || typeError;

  // Vehicle form
  const vehicleForm = useForm<VehicleInput>({
    resolver: formResolver(vehicleSchema),
    defaultValues: {
      customer_id: id,
      vehicle_category: 'automobile',
      vehicle_type: 'standard',
      size_class: 'sedan',
      specialty_tier: null,
      year: undefined,
      make: '',
      model: '',
      color: '',
    },
  });

  const isVehicleSpecialty = isSpecialtyCategory(vehicleCategory);
  const vehicleTierLabel = TIER_DROPDOWN_LABELS[vehicleCategory];
  const vehicleSpecialtyOptions = isVehicleSpecialty ? SPECIALTY_TIERS[vehicleCategory] : [];
  const AUTOMOBILE_SIZE_CLASSES = ['sedan', 'truck_suv_2row', 'suv_3row_van'] as const;

  function handleVehicleCategoryChange(newCategory: VehicleCategory) {
    setVehicleCategory(newCategory);
    const specialty = isSpecialtyCategory(newCategory);
    vehicleForm.setValue('vehicle_category', newCategory);
    vehicleForm.setValue('vehicle_type', specialty ? newCategory : 'standard');
    vehicleForm.setValue('make', '');
    vehicleForm.setValue('size_class', null);
    vehicleForm.setValue('specialty_tier', null);
  }

  const handleVehicleMakeChange = useCallback((val: string) => {
    vehicleForm.setValue('make', val, { shouldDirty: true });
  }, [vehicleForm]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [custRes, vehRes, ledgerRes, txRes, quotesRes] = await Promise.all([
      supabase.from('customers').select('*').eq('id', id).single(),
      supabase.from('vehicles').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
      supabase.from('loyalty_ledger').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
      supabase.from('transactions').select('*, employee:employees(id, first_name, last_name)').eq('customer_id', id).order('transaction_date', { ascending: false }),
      supabase.from('quotes').select('*').eq('customer_id', id).is('deleted_at', null).order('created_at', { ascending: false }),
    ]);

    if (custRes.error || !custRes.data) {
      toast.error('Customer not found');
      router.push('/admin/customers');
      return;
    }

    setCustomer(custRes.data);

    // Initialize auto-toggle refs BEFORE reset triggers effects
    prevPhoneHadValue.current = !!custRes.data.phone;
    prevEmailHadValue.current = !!custRes.data.email;

    reset({
      first_name: custRes.data.first_name,
      last_name: custRes.data.last_name,
      phone: custRes.data.phone ? formatPhone(custRes.data.phone) : '',
      email: custRes.data.email || '',
      birthday: custRes.data.birthday || '',
      address_line_1: custRes.data.address_line_1 || '',
      address_line_2: custRes.data.address_line_2 || '',
      city: custRes.data.city || '',
      state: custRes.data.state || 'CA',
      zip: custRes.data.zip || '',
      notes: custRes.data.notes || '',
      tags: custRes.data.tags || [],
      sms_consent: custRes.data.sms_consent,
      email_consent: custRes.data.email_consent,
    });

    // Initialize customer type
    setCustomerType(custRes.data.customer_type);

    // Initialize birthday fields from stored date
    if (custRes.data.birthday) {
      const bd = new Date(custRes.data.birthday + 'T00:00:00');
      const m = bd.getMonth();
      const d = bd.getDate();
      const y = bd.getFullYear();
      setBirthMonth(MONTHS[m]);
      setBirthDay(String(d));
      if (y !== 1900) setBirthYear(String(y));
      else setBirthYear('');
    } else {
      setBirthMonth('');
      setBirthDay('');
      setBirthYear('');
    }

    if (vehRes.data) setVehicles(vehRes.data);
    if (ledgerRes.data) setLedger(ledgerRes.data);
    if (txRes.data) setTransactions(txRes.data);
    if (quotesRes.data) setQuotes(quotesRes.data);
    setLoading(false);
  }, [id, supabase, router, reset]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    const formatted = formatPhoneInput(raw);
    setValue('phone', formatted, { shouldDirty: true });
    if (formatted.replace(/\D/g, '').length > 0) {
      setPhoneRequired(false);
    }
  }

  function buildBirthdayDate(): string | null {
    if (!birthMonth && !birthDay) return null;
    if (!birthMonth || !birthDay) return null;

    const monthNum = String(MONTHS.indexOf(birthMonth) + 1).padStart(2, '0');
    const dayNum = String(birthDay).padStart(2, '0');
    const yr = birthYear ? String(parseInt(birthYear)) : '1900';
    return `${yr}-${monthNum}-${dayNum}`;
  }

  // --- Info Tab: Save customer ---
  async function onSaveInfo(data: CustomerUpdateInput) {
    if (!customer) return;

    // Phone required check
    const digits = (data.phone || '').replace(/\D/g, '');
    if (digits.length === 0) {
      setPhoneRequired(true);
      toast.error('Mobile number is required');
      return;
    }
    setPhoneRequired(false);

    // Customer type required check
    if (!customerType) {
      setTypeError(true);
      toast.error('Please select a customer type');
      return;
    }

    if (hasAnyError) return;

    setSaving(true);
    try {
      const birthday = buildBirthdayDate();

      const res = await adminFetch(`/api/admin/customers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: data.first_name,
          last_name: data.last_name,
          phone: data.phone || null,
          email: data.email || null,
          birthday,
          address_line_1: data.address_line_1 || null,
          address_line_2: data.address_line_2 || null,
          city: data.city || null,
          state: data.state || null,
          zip: data.zip || null,
          notes: data.notes || null,
          tags: data.tags || [],
          sms_consent: data.sms_consent,
          email_consent: data.email_consent,
          customer_type: customerType,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error || 'Failed to update customer');
        setSaving(false);
        return;
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
  function deriveVehicleCategory(v: Vehicle): VehicleCategory {
    if (v.vehicle_category && v.vehicle_category !== 'automobile') return v.vehicle_category;
    if (v.vehicle_type === 'standard') return 'automobile';
    if (['motorcycle', 'rv', 'boat', 'aircraft'].includes(v.vehicle_type)) return v.vehicle_type as VehicleCategory;
    return 'automobile';
  }

  function openAddVehicle() {
    setEditingVehicle(null);
    setVehicleCategory('automobile');
    setYearOtherMode(false);
    vehicleForm.reset({
      customer_id: id,
      vehicle_category: 'automobile',
      vehicle_type: 'standard',
      size_class: 'sedan',
      specialty_tier: null,
      year: undefined,
      make: '',
      model: '',
      color: '',
    });
    setVehicleDialogOpen(true);
  }

  function openEditVehicle(vehicle: Vehicle) {
    setEditingVehicle(vehicle);
    // Auto-detect "Other" mode if year is outside the dropdown range
    const yearOptions = getVehicleYearOptions();
    setYearOtherMode(!!vehicle.year && !yearOptions.includes(vehicle.year));
    const cat = deriveVehicleCategory(vehicle);
    setVehicleCategory(cat);
    vehicleForm.reset({
      customer_id: id,
      vehicle_category: cat,
      vehicle_type: vehicle.vehicle_type,
      size_class: vehicle.size_class,
      specialty_tier: vehicle.specialty_tier ?? null,
      year: vehicle.year ?? undefined,
      make: vehicle.make || '',
      model: vehicle.model || '',
      color: vehicle.color || '',
    });
    setVehicleDialogOpen(true);
  }

  async function onSaveVehicle(data: VehicleInput) {
    setSavingVehicle(true);
    try {
      const specialty = isSpecialtyCategory(vehicleCategory);
      const payload = {
        customer_id: id,
        vehicle_category: vehicleCategory,
        vehicle_type: specialty ? vehicleCategory : 'standard',
        size_class: !specialty ? data.size_class : null,
        specialty_tier: specialty ? (data.specialty_tier || null) : null,
        year: data.year || null,
        make: data.make || null,
        model: titleCaseField(data.model || ''),
        color: titleCaseField(data.color || ''),
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

  // --- Deactivate Portal Access ---
  async function handleDeactivatePortal() {
    if (!customer) return;
    setDeactivatingPortal(true);
    try {
      const res = await fetch(`/api/admin/customers/${customer.id}/portal-access`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to deactivate portal access');
      toast.success('Portal access deactivated');
      // Store backup and clear active
      setCustomer({
        ...customer,
        deactivated_auth_user_id: customer.auth_user_id,
        auth_user_id: null,
      });
      setConfirmDeactivateOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to deactivate portal access');
    } finally {
      setDeactivatingPortal(false);
    }
  }

  // --- Reactivate Portal Access ---
  async function handleReactivatePortal() {
    if (!customer) return;
    setReactivatingPortal(true);
    try {
      const res = await fetch(`/api/admin/customers/${customer.id}/portal-access`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to reactivate portal access');
      toast.success('Portal access reactivated');
      // Restore from backup
      setCustomer({
        ...customer,
        auth_user_id: json.auth_user_id || customer.deactivated_auth_user_id,
        deactivated_auth_user_id: null,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reactivate portal access');
    } finally {
      setReactivatingPortal(false);
    }
  }

  // --- Delete Customer ---
  async function handleDeleteCustomer() {
    if (!customer) return;
    setDeletingCustomer(true);
    try {
      const res = await fetch(`/api/admin/customers/${customer.id}`, {
        method: 'DELETE',
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Failed to delete customer');
      }

      toast.success('Customer deleted successfully');
      router.push('/admin/customers');
    } catch (err) {
      console.error('Delete customer error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to delete customer');
      setDeleteStep(0);
    } finally {
      setDeletingCustomer(false);
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
            onClick={() => {
              setReceiptTransactionId(row.original.id);
              setReceiptDialogOpen(true);
            }}
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
          <TabsTrigger value="quotes">Quotes ({quotes.length})</TabsTrigger>
          <TabsTrigger value="service-history">Service History</TabsTrigger>
        </TabsList>

        {/* ===== INFO TAB ===== */}
        <TabsContent value="info">
          <form onSubmit={handleSubmit(onSaveInfo)} className="space-y-6">
            {/* Customer Type + Customer Journey Card */}
            <Card>
              <CardContent className="pt-6">
                <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
                  {/* Customer Type section */}
                  <div className="lg:col-span-4">
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

                  {/* Customer Journey section */}
                  <div className="lg:col-span-6 min-w-0">
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

                  {/* Online Access section */}
                  <div className="lg:col-span-2 min-w-0">
                    <CardTitle
                      className="mb-3 cursor-help"
                      title="Portal access allows customers to sign in to view appointments, transaction history, and manage their profile. Access is created when a customer signs up via the portal with email/password or phone OTP."
                    >
                      Online Access
                    </CardTitle>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        {/* Active option */}
                        <button
                          type="button"
                          onClick={() => {
                            if (!customer.auth_user_id) {
                              handleReactivatePortal();
                            }
                          }}
                          title={
                            customer.auth_user_id
                              ? 'Portal access is active - customer can sign in'
                              : 'Click to link customer to their portal account'
                          }
                          className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
                            customer.auth_user_id
                              ? 'text-green-600'
                              : 'text-gray-300 hover:text-green-600 [&:hover>span]:bg-green-500'
                          }`}
                        >
                          <span
                            className={`h-2 w-2 rounded-full transition-colors ${
                              customer.auth_user_id ? 'bg-green-500' : 'bg-gray-300'
                            }`}
                          />
                          {reactivatingPortal ? 'Activating...' : 'Active'}
                        </button>
                        {/* Deactivated option */}
                        <button
                          type="button"
                          onClick={() => {
                            if (customer.auth_user_id) {
                              setConfirmDeactivateOpen(true);
                            }
                          }}
                          title={
                            customer.auth_user_id
                              ? 'Click to deactivate portal access'
                              : 'Portal access is deactivated'
                          }
                          className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
                            !customer.auth_user_id
                              ? 'text-red-600'
                              : 'text-gray-300 hover:text-red-600 [&:hover>span]:bg-red-500'
                          }`}
                        >
                          <span
                            className={`h-2 w-2 rounded-full transition-colors ${
                              !customer.auth_user_id ? 'bg-red-500' : 'bg-gray-300'
                            }`}
                          />
                          Deactivated
                        </button>
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

                  {/* Deactivate Portal Confirmation */}
                  <ConfirmDialog
                    open={confirmDeactivateOpen}
                    onOpenChange={setConfirmDeactivateOpen}
                    title="Deactivate Portal Access?"
                    description="This customer will no longer be able to sign in to their portal account. Their account history and data will be preserved."
                    confirmLabel="Deactivate"
                    variant="destructive"
                    onConfirm={handleDeactivatePortal}
                    loading={deactivatingPortal}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Card 1: Contact Information — 4-column grid, 2 rows */}
            <Card>
              <CardHeader>
                <CardTitle>Contact Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {/* Row 1: First Name | Last Name | Mobile | Email */}
                  <FormField label="First Name" error={errors.first_name?.message} required htmlFor="first_name">
                    <Input id="first_name" {...register('first_name')} placeholder="Jane" />
                  </FormField>

                  <FormField label="Last Name" error={errors.last_name?.message} required htmlFor="last_name">
                    <Input id="last_name" {...register('last_name')} placeholder="Smith" />
                  </FormField>

                  <FormField label="Mobile" error={errors.phone?.message || (phoneRequired ? 'Mobile number is required' : undefined)} required htmlFor="phone">
                    <Input
                      id="phone"
                      {...register('phone')}
                      onChange={handlePhoneChange}
                      placeholder="(310) 555-1234"
                      className={phoneDup || phoneRequired ? 'border-red-500' : ''}
                    />
                    {phoneDup && (
                      <p className="mt-1 text-xs text-red-600">
                        Phone already belongs to {phoneDup.name}
                      </p>
                    )}
                  </FormField>

                  <FormField label="Email" error={errors.email?.message} htmlFor="email">
                    <Input
                      id="email"
                      type="email"
                      {...register('email')}
                      placeholder="jane@example.com"
                      className={emailDup || emailFormatError ? 'border-red-500' : ''}
                    />
                    {emailFormatError && (
                      <p className="mt-1 text-xs text-red-600">{emailFormatError}</p>
                    )}
                    {emailDup && (
                      <p className="mt-1 text-xs text-red-600">
                        Email already belongs to {emailDup.name}
                      </p>
                    )}
                  </FormField>

                  {/* Row 2: Address Line 1 | Address Line 2 | City | State + Zip */}
                  <FormField label="Address Line 1" error={errors.address_line_1?.message} htmlFor="address_line_1">
                    <Input id="address_line_1" {...register('address_line_1')} placeholder="123 Main St" />
                  </FormField>

                  <FormField label="Address Line 2" error={errors.address_line_2?.message} htmlFor="address_line_2">
                    <Input id="address_line_2" {...register('address_line_2')} placeholder="Apt 4B" />
                  </FormField>

                  <FormField label="City" error={errors.city?.message} htmlFor="city">
                    <Input id="city" {...register('city')} placeholder="Lomita" />
                  </FormField>

                  <div className="space-y-1.5">
                    <div className="grid grid-cols-2 gap-2">
                      <FormField label="State" error={errors.state?.message} htmlFor="state">
                        <Select id="state" {...register('state')}>
                          {US_STATES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </Select>
                      </FormField>
                      <FormField label="Zip Code" error={errors.zip?.message} htmlFor="zip">
                        <Input id="zip" {...register('zip')} placeholder="90717" />
                      </FormField>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Card 2: Marketing Info — 12-column grid */}
            <Card>
              <CardHeader>
                <CardTitle>Marketing Info</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
                  {/* Birthday */}
                  <div className="space-y-1.5 lg:col-span-4">
                    <label className="text-sm font-medium text-ui-text">Birthday</label>
                    <div className="grid grid-cols-[3fr_4.5rem_3fr] gap-1.5 max-w-[75%]">
                      <Select
                        value={birthMonth}
                        onChange={(e) => setBirthMonth(e.target.value)}
                        className={birthdayError ? 'border-red-500' : ''}
                      >
                        <option value="">Month</option>
                        {MONTHS.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </Select>
                      <Select
                        value={birthDay}
                        onChange={(e) => setBirthDay(e.target.value)}
                        className={birthdayError ? 'border-red-500' : ''}
                      >
                        <option value="">Day</option>
                        {DAYS.map((d) => (
                          <option key={d} value={String(d)}>{d}</option>
                        ))}
                      </Select>
                      <Input
                        value={birthYear}
                        onChange={(e) => setBirthYear(e.target.value)}
                        placeholder="Year"
                        maxLength={4}
                        className={birthdayError && birthYear ? 'border-red-500' : ''}
                      />
                    </div>
                    {birthdayError && (
                      <p className="text-xs text-red-600">{birthdayError}</p>
                    )}
                  </div>

                  {/* SMS Marketing Toggle — cols 7-9 */}
                  <div className="space-y-1.5 lg:col-span-3">
                    <label className="text-sm font-medium text-ui-text">SMS Marketing</label>
                    <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700">
                      <p className="text-sm text-gray-700 dark:text-gray-300">Allow SMS</p>
                      <Switch
                        checked={smsConsent ?? false}
                        onCheckedChange={(checked) => setValue('sms_consent', checked, { shouldDirty: true })}
                      />
                    </div>
                  </div>

                  {/* Email Marketing Toggle — cols 10-12 */}
                  <div className="space-y-1.5 lg:col-span-3">
                    <label className="text-sm font-medium text-ui-text">Email Marketing</label>
                    <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700">
                      <p className="text-sm text-gray-700 dark:text-gray-300">Allow Email</p>
                      <Switch
                        checked={emailConsent ?? false}
                        onCheckedChange={(checked) => setValue('email_consent', checked, { shouldDirty: true })}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Card 3: Notes & Tags */}
            <Card>
              <CardHeader>
                <CardTitle>Notes & Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4">
                  <FormField label="Notes" error={errors.notes?.message} htmlFor="notes">
                    <Textarea id="notes" {...register('notes')} placeholder="Any notes about this customer..." rows={5} />
                  </FormField>

                  <FormField
                    label="Tags"
                    htmlFor="tags"
                    description="Enter tags separated by commas (e.g. VIP, fleet, referral)"
                  >
                    <Input
                      id="tags"
                      defaultValue={customer.tags?.join(', ') || ''}
                      placeholder="VIP, fleet, referral"
                      onChange={(e) => {
                        const tagStr = e.target.value;
                        const tags = tagStr
                          .split(',')
                          .map((t) => t.trim())
                          .filter(Boolean);
                        setValue('tags', tags, { shouldDirty: true });
                      }}
                    />
                  </FormField>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              {canDeleteCustomer && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => setDeleteStep(1)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Customer
                </Button>
              )}
              {!canDeleteCustomer && <div />}
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => router.push('/admin/customers')}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving || hasAnyError || isPhoneEmpty}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
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
                              {VEHICLE_CATEGORY_LABELS[v.vehicle_category || 'automobile']}
                            </Badge>
                            {v.vehicle_category === 'automobile' || !v.vehicle_category ? (
                              v.size_class && (
                                <Badge variant="secondary">
                                  {VEHICLE_SIZE_LABELS[v.size_class]}
                                </Badge>
                              )
                            ) : (
                              v.specialty_tier && (
                                <Badge variant="secondary">
                                  {getSpecialtyTierLabel(v.vehicle_category, v.specialty_tier)}
                                </Badge>
                              )
                            )}
                          </div>
                          {v.color && <p className="text-sm text-gray-500">Color: {v.color}</p>}
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
                {/* Category Selector */}
                <FormField label="Category" htmlFor="veh_category">
                  <Select
                    id="veh_category"
                    value={vehicleCategory}
                    onChange={(e) => handleVehicleCategoryChange(e.target.value as VehicleCategory)}
                  >
                    {VEHICLE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {VEHICLE_CATEGORY_LABELS[cat]}
                      </option>
                    ))}
                  </Select>
                </FormField>

                <div className="grid grid-cols-3 gap-3">
                  <FormField label="Year" error={vehicleForm.formState.errors.year?.message} htmlFor="veh_year">
                    {yearOtherMode ? (
                      <>
                        <Input
                          id="veh_year"
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          placeholder="Enter year (e.g., 1965)"
                          {...vehicleForm.register('year')}
                        />
                        <button
                          type="button"
                          onClick={() => { setYearOtherMode(false); vehicleForm.setValue('year', undefined); }}
                          className="mt-1 text-xs text-blue-600 hover:text-blue-800"
                        >
                          Back to list
                        </button>
                      </>
                    ) : (
                      <Select
                        id="veh_year"
                        {...vehicleForm.register('year', {
                          onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
                            if (e.target.value === 'other') {
                              setYearOtherMode(true);
                              vehicleForm.setValue('year', undefined);
                            }
                          },
                        })}
                      >
                        <option value="">Year...</option>
                        {getVehicleYearOptions().map((y) => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                        <option value="other">Other</option>
                      </Select>
                    )}
                  </FormField>

                  <FormField label="Make" error={vehicleForm.formState.errors.make?.message} htmlFor="veh_make">
                    <VehicleMakeCombobox
                      id="veh_make"
                      value={vehicleForm.watch('make') || ''}
                      onChange={handleVehicleMakeChange}
                      category={vehicleCategory}
                    />
                  </FormField>

                  <FormField label="Model" error={vehicleForm.formState.errors.model?.message} htmlFor="veh_model">
                    <Input id="veh_model" {...vehicleForm.register('model')} placeholder={MODEL_PLACEHOLDERS[vehicleCategory]} />
                  </FormField>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Color" htmlFor="veh_color">
                    <Input id="veh_color" {...vehicleForm.register('color')} placeholder="e.g., Silver" />
                  </FormField>

                  <FormField label={vehicleTierLabel} htmlFor="veh_tier">
                    {isVehicleSpecialty ? (
                      <Select id="veh_tier" {...vehicleForm.register('specialty_tier')}>
                        <option value="">Select {vehicleTierLabel.toLowerCase()}...</option>
                        {vehicleSpecialtyOptions.map((opt) => (
                          <option key={opt.key} value={opt.key}>{opt.label}</option>
                        ))}
                      </Select>
                    ) : (
                      <Select id="veh_tier" {...vehicleForm.register('size_class')}>
                        {AUTOMOBILE_SIZE_CLASSES.map((sc) => (
                          <option key={sc} value={sc}>{VEHICLE_SIZE_LABELS[sc]}</option>
                        ))}
                      </Select>
                    )}
                  </FormField>
                </div>
              </form>
            </DialogContent>
            <DialogFooter>
              <Button variant="outline" onClick={() => setVehicleDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" form="vehicle-form" disabled={savingVehicle}>
                {savingVehicle ? 'Saving...' : editingVehicle ? 'Save Changes' : `Add ${VEHICLE_CATEGORY_LABELS[vehicleCategory]}`}
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
                {canAdjustLoyalty && (
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
                )}
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
          <ReceiptDialog
            open={receiptDialogOpen}
            onOpenChange={(open) => {
              setReceiptDialogOpen(open);
              if (!open) setReceiptTransactionId(null);
            }}
            transactionId={receiptTransactionId}
            customerEmail={customer?.email ?? undefined}
            customerPhone={customer?.phone ?? undefined}
          />
        </TabsContent>

        {/* ===== QUOTES TAB ===== */}
        <TabsContent value="quotes">
          {/* Quote Stats */}
          {(() => {
            const totalQuotes = quotes.length;
            // Accepted = customer accepted the quote (includes both 'accepted' and 'converted' statuses)
            const acceptedQuotes = quotes.filter(q => q.status === 'accepted' || q.status === 'converted').length;
            // Booked = quote was converted into an actual appointment
            const bookedQuotes = quotes.filter(q => q.status === 'converted').length;
            // Booking rate = how many quotes actually became appointments
            const bookingRate = totalQuotes > 0 ? Math.round((bookedQuotes / totalQuotes) * 100) : 0;
            // Booked revenue = sum of only converted quotes (actual revenue)
            const bookedRevenue = quotes.filter(q => q.status === 'converted').reduce((sum, q) => sum + (q.total_amount || 0), 0);

            return (
              <div className="space-y-6">
                {/* Stats Cards */}
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-md bg-blue-100 p-2">
                          <FileText className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-gray-900">{totalQuotes}</p>
                          <p className="text-xs text-gray-500">Total Quotes</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-md bg-green-100 p-2">
                          <Check className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-gray-900">{acceptedQuotes}</p>
                          <p className="text-xs text-gray-500">Accepted</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-md bg-purple-100 p-2">
                          <CalendarDays className="h-5 w-5 text-purple-600" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-gray-900">{bookedQuotes}</p>
                          <p className="text-xs text-gray-500">Booked</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-md bg-amber-100 p-2">
                          <TrendingUp className="h-5 w-5 text-amber-600" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-gray-900">{bookingRate}%</p>
                          <p className="text-xs text-gray-500">Booking Rate</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-md bg-emerald-100 p-2">
                          <DollarSign className="h-5 w-5 text-emerald-600" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-gray-900">{formatCurrency(bookedRevenue)}</p>
                          <p className="text-xs text-gray-500">Booked Revenue</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Quotes Table */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Quote History</CardTitle>
                      <Link href={`/pos/quotes?mode=builder&customer=${id}`}>
                        <Button size="sm">
                          <Plus className="h-4 w-4" />
                          New Quote
                        </Button>
                      </Link>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {quotes.length === 0 ? (
                      <EmptyState
                        icon={FileText}
                        title="No quotes yet"
                        description="Create a quote to send an estimate to this customer."
                      />
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-200">
                              <th className="pb-3 text-left font-medium text-gray-500">Quote #</th>
                              <th className="pb-3 text-left font-medium text-gray-500">Date</th>
                              <th className="pb-3 text-right font-medium text-gray-500">Amount</th>
                              <th className="pb-3 text-center font-medium text-gray-500">Status</th>
                              <th className="pb-3 text-left font-medium text-gray-500">Last Contacted</th>
                            </tr>
                          </thead>
                          <tbody>
                            {quotes.map((q) => {
                              const statusVariant: Record<QuoteStatus, 'default' | 'info' | 'warning' | 'success' | 'destructive' | 'secondary'> = {
                                draft: 'default',
                                sent: 'info',
                                viewed: 'warning',
                                accepted: 'success',
                                expired: 'destructive',
                                converted: 'secondary',
                              };
                              return (
                                <tr key={q.id} className="border-b border-gray-100">
                                  <td className="py-3">
                                    <Link
                                      href={`/admin/quotes/${q.id}`}
                                      className="text-blue-600 hover:text-blue-800 hover:underline"
                                    >
                                      {q.quote_number}
                                    </Link>
                                  </td>
                                  <td className="py-3 text-gray-600">
                                    {formatDate(q.created_at)}
                                  </td>
                                  <td className="py-3 text-right font-medium text-gray-900">
                                    {formatCurrency(q.total_amount)}
                                  </td>
                                  <td className="py-3 text-center">
                                    <Badge variant={statusVariant[q.status]}>
                                      {QUOTE_STATUS_LABELS[q.status] ?? q.status}
                                    </Badge>
                                  </td>
                                  <td className="py-3 text-gray-500">
                                    {q.sent_at ? formatDateTime(q.sent_at) : '—'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Value Summary */}
                {totalQuotes > 0 && (
                  <div className="rounded-md bg-gray-50 p-4 text-sm text-gray-600">
                    <p>
                      {acceptedQuotes} of {totalQuotes} quotes accepted
                      {bookedRevenue > 0 && (
                        <> · Booked revenue: <span className="font-semibold text-green-600">{formatCurrency(bookedRevenue)}</span></>
                      )}
                    </p>
                  </div>
                )}
              </div>
            );
          })()}
        </TabsContent>

        {/* ===== SERVICE HISTORY TAB ===== */}
        <TabsContent value="service-history">
          <CustomerServiceHistoryTab customerId={id} vehicles={vehicles} />
        </TabsContent>
      </Tabs>

      {/* Delete Customer - First Confirmation */}
      <ConfirmDialog
        open={deleteStep === 1}
        onOpenChange={(open) => { if (!open) setDeleteStep(0); }}
        title="Delete Customer"
        description={
          <div className="space-y-3">
            <p>Are you sure you want to delete <strong>{customer?.first_name} {customer?.last_name}</strong>?</p>
            <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              <p className="font-medium">This will permanently delete:</p>
              <ul className="mt-1 list-disc pl-5">
                <li>Customer profile and contact information</li>
                <li>All {vehicles.length} vehicle record(s)</li>
                <li>Loyalty points balance ({formatPoints(customer?.loyalty_points_balance || 0)} pts)</li>
                <li>Portal access (if any)</li>
              </ul>
              <p className="mt-2">Transaction history will be preserved but unlinked from this customer.</p>
            </div>
          </div>
        }
        confirmLabel="Yes, Continue"
        variant="destructive"
        onConfirm={() => setDeleteStep(2)}
      />

      {/* Delete Customer - Final Confirmation */}
      <ConfirmDialog
        open={deleteStep === 2}
        onOpenChange={(open) => { if (!open) setDeleteStep(0); }}
        title="Final Confirmation"
        description={
          <div className="space-y-3">
            <p className="text-red-600 font-medium">This action cannot be undone.</p>
            <p>Type the customer&apos;s first name to confirm deletion:</p>
            <p className="text-center font-mono text-lg font-bold text-gray-900">{customer?.first_name}</p>
          </div>
        }
        confirmLabel={deletingCustomer ? 'Deleting...' : 'Permanently Delete'}
        variant="destructive"
        loading={deletingCustomer}
        requireConfirmText={customer?.first_name || ''}
        onConfirm={handleDeleteCustomer}
      />
    </div>
  );
}

// ─── Customer Service History Tab ─────────────────────────────────────────────

interface ServiceHistoryJob {
  id: string;
  status: string;
  services: { id: string; name: string; price: number }[];
  timer_seconds: number;
  created_at: string;
  vehicle: { id: string; year: number | null; make: string | null; model: string | null; color: string | null } | null;
  assigned_staff: { id: string; first_name: string; last_name: string } | null;
  photo_count: number;
  addon_count: number;
}

const SERVICE_HISTORY_STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const SH_STATUS_CLASSES: Record<string, string> = {
  scheduled: 'bg-gray-100 text-gray-700',
  intake: 'bg-blue-50 text-blue-700',
  in_progress: 'bg-yellow-50 text-yellow-700',
  pending_approval: 'bg-orange-50 text-orange-700',
  completed: 'bg-green-50 text-green-700',
  closed: 'bg-slate-100 text-slate-600',
  cancelled: 'bg-red-50 text-red-600',
};

const SH_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  intake: 'Intake',
  in_progress: 'In Progress',
  pending_approval: 'Pending',
  completed: 'Completed',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

function formatSHDuration(seconds: number): string {
  if (!seconds) return '-';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatSHDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/Los_Angeles',
  });
}

function formatSHServiceNames(services: { name: string }[]): string {
  if (!services || services.length === 0) return '-';
  if (services.length <= 2) return services.map((s) => s.name).join(', ');
  return `${services[0].name}, ${services[1].name} +${services.length - 2}`;
}

function formatSHVehicle(
  v: { year: number | null; make: string | null; model: string | null; color: string | null } | null
): string {
  if (!v) return '-';
  const parts = [v.year, v.make, v.model].filter(Boolean);
  return parts.join(' ') || '-';
}

function CustomerServiceHistoryTab({ customerId, vehicles }: { customerId: string; vehicles: Vehicle[] }) {
  const router = useRouter();
  const [jobs, setJobs] = useState<ServiceHistoryJob[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState('');
  const limit = 20;

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      params.set('customer_id', customerId);
      params.set('sort_by', 'created_at');
      params.set('sort_dir', 'desc');
      if (statusFilter) params.set('status', statusFilter);
      if (vehicleFilter) params.set('vehicle_id', vehicleFilter);

      const res = await adminFetch(`/api/admin/jobs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
        setTotal(data.total || 0);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [customerId, page, statusFilter, vehicleFilter]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="w-40"
        >
          {SERVICE_HISTORY_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>

        {vehicles.length >= 2 && (
          <Select
            value={vehicleFilter}
            onChange={(e) => {
              setVehicleFilter(e.target.value);
              setPage(1);
            }}
            className="w-52"
          >
            <option value="">All Vehicles</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.year} {v.make} {v.model}
              </option>
            ))}
          </Select>
        )}

        <span className="text-sm text-gray-500">
          {loading ? 'Loading...' : `${total} job${total !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Services</th>
              <th className="px-4 py-3 text-center">Add-ons</th>
              <th className="px-4 py-3 text-center">Photos</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3">Staff</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <Spinner className="mx-auto" />
                </td>
              </tr>
            ) : jobs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                  No service records found
                </td>
              </tr>
            ) : (
              jobs.map((job) => (
                <tr
                  key={job.id}
                  className="cursor-pointer transition-colors hover:bg-gray-50"
                  onClick={() => router.push(`/admin/jobs/${job.id}`)}
                >
                  <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                    {formatSHDate(job.created_at)}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatSHVehicle(job.vehicle)}
                    {job.vehicle?.color && (
                      <span className="ml-1 text-xs text-gray-400">({job.vehicle.color})</span>
                    )}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-gray-600">
                    {formatSHServiceNames(job.services)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {job.addon_count > 0 ? (
                      <span className="text-sm text-gray-600">+{job.addon_count} add-on{job.addon_count !== 1 ? 's' : ''}</span>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {job.photo_count > 0 ? (
                      <span className="inline-flex items-center gap-1 text-gray-600">
                        {job.photo_count} photo{job.photo_count !== 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                    {formatSHDuration(job.timer_seconds)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                    {job.assigned_staff
                      ? job.assigned_staff.first_name
                      : <span className="text-gray-300">-</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${SH_STATUS_CLASSES[job.status] || 'bg-gray-100 text-gray-700'}`}
                    >
                      {SH_STATUS_LABELS[job.status] || job.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-end">
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { customerCreateSchema, type CustomerCreateInput } from '@/lib/utils/validation';
import { normalizePhone, formatPhoneInput } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import type { CustomerType } from '@/lib/supabase/types';

const TYPE_OPTIONS: { value: CustomerType; label: string; activeClass: string }[] = [
  { value: 'enthusiast', label: 'Enthusiast', activeClass: 'border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  { value: 'professional', label: 'Professional', activeClass: 'border-purple-400 bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
];

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

export default function NewCustomerPage() {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);

  // Customer type
  const [customerType, setCustomerType] = useState<CustomerType | null>(null);
  const [typeError, setTypeError] = useState(false);

  // Birthday fields
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

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CustomerCreateInput>({
    resolver: formResolver(customerCreateSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      phone: '',
      email: '',
      birthday: '',
      address_line_1: '',
      address_line_2: '',
      city: '',
      state: 'CA',
      zip: '',
      notes: '',
      tags: [],
      sms_consent: false,
      email_consent: false,
    },
  });

  const smsConsent = watch('sms_consent');
  const emailConsent = watch('email_consent');
  const watchPhone = watch('phone');
  const watchEmail = watch('email');

  // Auto-toggle SMS/Email consent on empty↔filled transitions
  const prevPhoneHadValue = useRef(false);
  const prevEmailHadValue = useRef(false);

  useEffect(() => {
    const hasValue = (watchPhone || '').replace(/\D/g, '').length > 0;
    if (hasValue && !prevPhoneHadValue.current) {
      setValue('sms_consent', true);
    } else if (!hasValue && prevPhoneHadValue.current) {
      setValue('sms_consent', false);
    }
    prevPhoneHadValue.current = hasValue;
  }, [watchPhone, setValue]);

  useEffect(() => {
    const hasValue = (watchEmail || '').trim().length > 0;
    if (hasValue && !prevEmailHadValue.current) {
      setValue('email_consent', true);
    } else if (!hasValue && prevEmailHadValue.current) {
      setValue('email_consent', false);
    }
    prevEmailHadValue.current = hasValue;
  }, [watchEmail, setValue]);

  // Debounced phone duplicate check
  useEffect(() => {
    if (phoneTimerRef.current) clearTimeout(phoneTimerRef.current);

    const digits = (watchPhone || '').replace(/\D/g, '');
    if (digits.length < 10) {
      setPhoneDup(null);
      return;
    }

    phoneTimerRef.current = setTimeout(async () => {
      try {
        const res = await adminFetch(`/api/admin/customers/check-duplicate?phone=${encodeURIComponent(watchPhone || '')}`);
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
  }, [watchPhone]);

  // Debounced email duplicate check + format validation
  useEffect(() => {
    if (emailTimerRef.current) clearTimeout(emailTimerRef.current);

    const trimmed = (watchEmail || '').trim();
    if (!trimmed) {
      setEmailDup(null);
      setEmailFormatError('');
      return;
    }

    // Email format validation: must contain @ and at least one . after @
    const atIdx = trimmed.indexOf('@');
    if (atIdx === -1 || trimmed.indexOf('.', atIdx) === -1) {
      setEmailFormatError('Please enter a valid email address');
      setEmailDup(null);
      return;
    }
    setEmailFormatError('');

    emailTimerRef.current = setTimeout(async () => {
      try {
        const res = await adminFetch(`/api/admin/customers/check-duplicate?email=${encodeURIComponent(trimmed)}`);
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
  }, [watchEmail]);

  // Birthday validation: if month or day is provided, both must be provided
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

  // Phone required validation
  const [phoneRequired, setPhoneRequired] = useState(false);
  const phoneDigits = (watchPhone || '').replace(/\D/g, '');
  const isPhoneEmpty = phoneDigits.length === 0;

  const hasDuplicateError = !!phoneDup || !!emailDup;
  const hasEmailFormatError = !!emailFormatError;
  const hasBirthdayError = !!birthdayError;
  const hasAnyError = hasDuplicateError || hasEmailFormatError || hasBirthdayError || typeError;

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
    if (!birthMonth || !birthDay) return null; // validation catches this

    const monthNum = String(MONTHS.indexOf(birthMonth) + 1).padStart(2, '0');
    const dayNum = String(birthDay).padStart(2, '0');

    // Birthday stored as DATE column. Year 1900 is sentinel when year is omitted.
    const yr = birthYear ? String(parseInt(birthYear)) : '1900';
    return `${yr}-${monthNum}-${dayNum}`;
  }

  async function onSubmit(data: CustomerCreateInput) {
    // Phone required check
    const digits = (data.phone || '').replace(/\D/g, '');
    if (digits.length === 0) {
      setPhoneRequired(true);
      toast.error('Mobile number is required');
      return;
    }
    setPhoneRequired(false);

    if (!customerType) {
      setTypeError(true);
      toast.error('Please select a customer type');
      return;
    }

    if (hasAnyError) return;

    setSaving(true);
    try {
      // Normalize the phone if present
      let phone = data.phone || null;
      if (phone) {
        const normalized = normalizePhone(phone);
        phone = normalized;
      }

      // Check phone uniqueness (server-side double check)
      if (phone) {
        const { data: existingByPhone } = await supabase
          .from('customers')
          .select('id, first_name, last_name')
          .eq('phone', phone)
          .maybeSingle();

        if (existingByPhone) {
          toast.error(
            `A customer with this phone already exists: ${existingByPhone.first_name} ${existingByPhone.last_name}`
          );
          setSaving(false);
          return;
        }
      }

      // Check email uniqueness (server-side double check)
      const email = data.email?.toLowerCase().trim() || null;
      if (email) {
        const { data: existingByEmail } = await supabase
          .from('customers')
          .select('id, first_name, last_name')
          .ilike('email', email)
          .maybeSingle();

        if (existingByEmail) {
          toast.error(
            `A customer with this email already exists: ${existingByEmail.first_name} ${existingByEmail.last_name}`
          );
          setSaving(false);
          return;
        }
      }

      // Parse tags from comma-separated string if it's a string
      const tags = data.tags || [];

      // Build birthday date from month/day/year fields
      const birthday = buildBirthdayDate();

      const { data: customer, error } = await supabase
        .from('customers')
        .insert({
          first_name: data.first_name,
          last_name: data.last_name,
          phone,
          email: data.email || null,
          birthday,
          address_line_1: data.address_line_1 || null,
          address_line_2: data.address_line_2 || null,
          city: data.city || null,
          state: data.state || null,
          zip: data.zip || null,
          notes: data.notes || null,
          tags,
          sms_consent: data.sms_consent,
          email_consent: data.email_consent,
          customer_type: customerType,
        })
        .select('id')
        .single();

      if (error) throw error;

      // Log marketing consent if given
      if (data.sms_consent) {
        await supabase.from('marketing_consent_log').insert({
          customer_id: customer.id,
          channel: 'sms',
          action: 'opt_in',
          source: 'manual',
        });
        // Also log to TCPA audit table
        if (phone) {
          await supabase.from('sms_consent_log').insert({
            customer_id: customer.id,
            phone,
            action: 'opt_in',
            keyword: 'opt_in',
            source: 'admin_manual',
            previous_value: null,
            new_value: true,
          });
        }
      }
      if (data.email_consent) {
        await supabase.from('marketing_consent_log').insert({
          customer_id: customer.id,
          channel: 'email',
          action: 'opt_in',
          source: 'manual',
        });
      }

      toast.success('Customer created successfully');
      router.push(`/admin/customers/${customer.id}`);
    } catch (err) {
      console.error('Create customer error:', err);
      toast.error('Failed to create customer');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Add Customer"
        action={
          <Button variant="outline" onClick={() => router.push('/admin/customers')}>
            <ArrowLeft className="h-4 w-4" />
            Back to Customers
          </Button>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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

        {/* Card 2: Marketing Info — 8-column grid */}
        <Card>
          <CardHeader>
            <CardTitle>Marketing Info</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
              {/* Customer Type — cols 1-2 */}
              <div className="min-w-0 space-y-1.5 lg:col-span-2">
                <label className="text-sm font-medium text-ui-text">
                  Customer Type <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-1.5">
                  {TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setCustomerType(opt.value);
                        setTypeError(false);
                      }}
                      className={`rounded-lg border-2 px-2 py-1.5 text-sm font-medium transition-all ${
                        customerType === opt.value
                          ? opt.activeClass
                          : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:border-gray-500'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {typeError && (
                  <p className="text-xs text-red-600">Please select a customer type</p>
                )}
              </div>

              {/* Birthday — cols 3-6 */}
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
                    checked={smsConsent}
                    onCheckedChange={(checked) => setValue('sms_consent', checked)}
                  />
                </div>
              </div>

              {/* Email Marketing Toggle — cols 10-12 */}
              <div className="space-y-1.5 lg:col-span-3">
                <label className="text-sm font-medium text-ui-text">Email Marketing</label>
                <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700">
                  <p className="text-sm text-gray-700 dark:text-gray-300">Allow Email</p>
                  <Switch
                    checked={emailConsent}
                    onCheckedChange={(checked) => setValue('email_consent', checked)}
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
                  placeholder="VIP, fleet, referral"
                  onChange={(e) => {
                    const tagStr = e.target.value;
                    const tags = tagStr
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean);
                    setValue('tags', tags);
                  }}
                />
              </FormField>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/admin/customers')}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving || hasAnyError || isPhoneEmpty}>
            {saving ? 'Creating...' : 'Create Customer'}
          </Button>
        </div>
      </form>
    </div>
  );
}

'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { customerCreateSchema, type CustomerCreateInput } from '@/lib/utils/validation';
import { normalizePhone, formatPhone, formatPhoneInput } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { FormField } from '@/components/ui/form-field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import type { CustomerType } from '@/lib/supabase/types';

const TYPE_OPTIONS: { value: CustomerType; label: string; activeClass: string }[] = [
  { value: 'enthusiast', label: 'Enthusiast', activeClass: 'border-blue-400 bg-blue-50 text-blue-700' },
  { value: 'professional', label: 'Professional', activeClass: 'border-purple-400 bg-purple-50 text-purple-700' },
];

export default function NewCustomerPage() {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [phonePreview, setPhonePreview] = useState<{ normalized: string | null; formatted: string } | null>(null);

  // Customer type
  const [customerType, setCustomerType] = useState<CustomerType | null>(null);
  const [typeError, setTypeError] = useState(false);

  // Duplicate check state
  const [phoneDup, setPhoneDup] = useState<{ name: string } | null>(null);
  const [emailDup, setEmailDup] = useState<{ name: string } | null>(null);
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
      state: '',
      zip: '',
      notes: '',
      tags: [],
      sms_consent: true,
      email_consent: true,
    },
  });

  const smsConsent = watch('sms_consent');
  const emailConsent = watch('email_consent');
  const watchPhone = watch('phone');
  const watchEmail = watch('email');

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

  // Debounced email duplicate check
  useEffect(() => {
    if (emailTimerRef.current) clearTimeout(emailTimerRef.current);

    const trimmed = (watchEmail || '').trim();
    if (!trimmed || !trimmed.includes('@')) {
      setEmailDup(null);
      return;
    }

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

  const hasDuplicateError = !!phoneDup || !!emailDup;

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    // Format the input value and update form
    const formatted = formatPhoneInput(raw);
    setValue('phone', formatted, { shouldDirty: true });

    if (formatted.length >= 3) {
      const normalized = normalizePhone(formatted);
      if (normalized) {
        setPhonePreview({
          normalized,
          formatted: formatPhone(normalized),
        });
      } else {
        setPhonePreview({ normalized: null, formatted: '' });
      }
    } else {
      setPhonePreview(null);
    }
  }

  async function onSubmit(data: CustomerCreateInput) {
    if (!customerType) {
      setTypeError(true);
      toast.error('Please select a customer type');
      return;
    }

    if (hasDuplicateError) return;

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

      const { data: customer, error } = await supabase
        .from('customers')
        .insert({
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
        {/* Contact Info */}
        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              <FormField label="First Name" error={errors.first_name?.message} required htmlFor="first_name">
                <Input id="first_name" {...register('first_name')} placeholder="Jane" />
              </FormField>

              <FormField label="Last Name" error={errors.last_name?.message} required htmlFor="last_name">
                <Input id="last_name" {...register('last_name')} placeholder="Smith" />
              </FormField>

              <FormField label="Mobile" error={errors.phone?.message} htmlFor="phone">
                <Input
                  id="phone"
                  {...register('phone')}
                  onChange={handlePhoneChange}
                  placeholder="(310) 555-1234"
                />
                {phonePreview && (
                  <div className="mt-1 text-xs">
                    {phonePreview.normalized ? (
                      <span className="text-green-600">
                        {phonePreview.formatted} ({phonePreview.normalized})
                      </span>
                    ) : (
                      <span className="text-amber-600">Enter a valid US mobile number</span>
                    )}
                  </div>
                )}
                {phoneDup && (
                  <p className="mt-1 text-xs text-red-600">
                    Phone already belongs to {phoneDup.name}
                  </p>
                )}
              </FormField>

              <FormField label="Email" error={errors.email?.message} htmlFor="email">
                <Input id="email" type="email" {...register('email')} placeholder="jane@example.com" />
                {emailDup && (
                  <p className="mt-1 text-xs text-red-600">
                    Email already belongs to {emailDup.name}
                  </p>
                )}
              </FormField>

              {/* Customer Type */}
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Customer Type <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  {TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setCustomerType(opt.value);
                        setTypeError(false);
                      }}
                      className={`rounded-lg border-2 px-5 py-2 text-sm font-medium transition-all ${
                        customerType === opt.value
                          ? opt.activeClass
                          : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {typeError && (
                  <p className="mt-1 text-xs text-red-600">Please select a customer type</p>
                )}
              </div>

              <FormField label="Birthday" error={errors.birthday?.message} htmlFor="birthday">
                <Input id="birthday" type="date" {...register('birthday')} />
              </FormField>
            </div>
          </CardContent>
        </Card>

        {/* Address */}
        <Card>
          <CardHeader>
            <CardTitle>Address</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="md:col-span-2">
                <FormField label="Address Line 1" error={errors.address_line_1?.message} htmlFor="address_line_1">
                  <Input id="address_line_1" {...register('address_line_1')} placeholder="123 Main St" />
                </FormField>
              </div>

              <div className="md:col-span-2">
                <FormField label="Address Line 2" error={errors.address_line_2?.message} htmlFor="address_line_2">
                  <Input id="address_line_2" {...register('address_line_2')} placeholder="Apt 4B" />
                </FormField>
              </div>

              <FormField label="City" error={errors.city?.message} htmlFor="city">
                <Input id="city" {...register('city')} placeholder="Lomita" />
              </FormField>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="State" error={errors.state?.message} htmlFor="state">
                  <Input id="state" {...register('state')} placeholder="CA" maxLength={2} />
                </FormField>

                <FormField label="ZIP" error={errors.zip?.message} htmlFor="zip">
                  <Input id="zip" {...register('zip')} placeholder="90717" />
                </FormField>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notes & Tags */}
        <Card>
          <CardHeader>
            <CardTitle>Notes & Tags</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6">
              <FormField label="Notes" error={errors.notes?.message} htmlFor="notes">
                <Textarea id="notes" {...register('notes')} placeholder="Any notes about this customer..." rows={3} />
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

        {/* Marketing Consent */}
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
                    checked={smsConsent}
                    onCheckedChange={(checked) => setValue('sms_consent', checked)}
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
                    checked={emailConsent}
                    onCheckedChange={(checked) => setValue('email_consent', checked)}
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
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/admin/customers')}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving || hasDuplicateError}>
            {saving ? 'Creating...' : 'Create Customer'}
          </Button>
        </div>
      </form>
    </div>
  );
}

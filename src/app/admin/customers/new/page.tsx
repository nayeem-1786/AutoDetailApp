'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
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

export default function NewCustomerPage() {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [phonePreview, setPhonePreview] = useState<{ normalized: string | null; formatted: string } | null>(null);

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
    setSaving(true);
    try {
      // Normalize the phone if present
      let phone = data.phone || null;
      if (phone) {
        const normalized = normalizePhone(phone);
        phone = normalized;
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
              </FormField>

              <FormField label="Email" error={errors.email?.message} htmlFor="email">
                <Input id="email" type="email" {...register('email')} placeholder="jane@example.com" />
              </FormField>

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
          <Button type="submit" disabled={saving}>
            {saving ? 'Creating...' : 'Create Customer'}
          </Button>
        </div>
      </form>
    </div>
  );
}

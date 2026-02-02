'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { customerProfileSchema, type CustomerProfileInput } from '@/lib/utils/validation';
import { formatPhoneInput, formatPhone } from '@/lib/utils/format';
import { useCustomerAuth } from '@/lib/auth/customer-auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

export default function AccountProfilePage() {
  const { customer } = useCustomerAuth();
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CustomerProfileInput>({
    resolver: formResolver(customerProfileSchema),
    values: customer
      ? {
          first_name: customer.first_name,
          last_name: customer.last_name,
          phone: customer.phone ? formatPhone(customer.phone) : '',
          sms_consent: customer.sms_consent,
          email_consent: customer.email_consent,
        }
      : undefined,
  });

  const smsConsent = watch('sms_consent');
  const emailConsent = watch('email_consent');

  if (!customer) return null;

  const onSubmit = async (data: CustomerProfileInput) => {
    setSaving(true);

    const res = await fetch('/api/customer/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const result = await res.json();

    if (!res.ok) {
      toast.error(result.error || 'Failed to save profile');
      setSaving(false);
      return;
    }

    toast.success('Profile updated');
    setSaving(false);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
      <p className="mt-1 text-sm text-gray-600">Update your personal information.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 max-w-lg space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="First Name" required error={errors.first_name?.message} htmlFor="first_name">
            <Input id="first_name" {...register('first_name')} />
          </FormField>

          <FormField label="Last Name" required error={errors.last_name?.message} htmlFor="last_name">
            <Input id="last_name" {...register('last_name')} />
          </FormField>
        </div>

        <FormField label="Email" htmlFor="email">
          <Input id="email" value={customer.email ?? ''} disabled className="bg-gray-50" />
          <p className="mt-1 text-xs text-gray-400">
            Contact support to change your email address.
          </p>
        </FormField>

        <FormField
          label="Phone"
          required
          error={errors.phone?.message}
          description="(XXX) XXX-XXXX"
          htmlFor="phone"
        >
          <Input
            id="phone"
            placeholder="(310) 555-1234"
            {...register('phone', {
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                const formatted = formatPhoneInput(e.target.value);
                setValue('phone', formatted, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
              },
            })}
          />
        </FormField>

        {/* Communication Preferences */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">
            Communication Preferences
          </h3>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">SMS Notifications</p>
              <p className="text-xs text-gray-500">
                Receive appointment reminders via text
              </p>
            </div>
            <Switch
              checked={smsConsent ?? false}
              onCheckedChange={(val) =>
                setValue('sms_consent', val, { shouldDirty: true })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">
                Email Notifications
              </p>
              <p className="text-xs text-gray-500">
                Receive promotions and updates via email
              </p>
            </div>
            <Switch
              checked={emailConsent ?? false}
              onCheckedChange={(val) =>
                setValue('email_consent', val, { shouldDirty: true })
              }
            />
          </div>
        </div>

        <Button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </form>
    </div>
  );
}

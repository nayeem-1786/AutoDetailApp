'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { customerProfileSchema, type CustomerProfileInput } from '@/lib/utils/validation';
import { formatPhoneInput, formatPhone } from '@/lib/utils/format';
import { useCustomerAuth } from '@/lib/auth/customer-auth-provider';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Switch } from '@/components/ui/switch';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { Info, Lock } from 'lucide-react';

export default function AccountProfilePage() {
  const router = useRouter();
  const { customer } = useCustomerAuth();
  const [saving, setSaving] = useState(false);

  // Confirmation dialog states
  const [confirmSmsOff, setConfirmSmsOff] = useState(false);
  const [confirmEmailOff, setConfirmEmailOff] = useState(false);
  const [confirmPromotionsOff, setConfirmPromotionsOff] = useState(false);
  const [confirmLoyaltyOff, setConfirmLoyaltyOff] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<CustomerProfileInput>({
    resolver: formResolver(customerProfileSchema),
    values: customer
      ? {
          first_name: customer.first_name,
          last_name: customer.last_name,
          phone: customer.phone ? formatPhone(customer.phone) : '',
          sms_consent: customer.sms_consent,
          email_consent: customer.email_consent,
          notify_promotions: customer.notify_promotions ?? true,
          notify_loyalty: customer.notify_loyalty ?? true,
        }
      : undefined,
  });

  const smsConsent = watch('sms_consent');
  const emailConsent = watch('email_consent');
  const notifyPromotions = watch('notify_promotions');
  const notifyLoyalty = watch('notify_loyalty');

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

  // Toggle handlers with confirmation
  const handleSmsToggle = (checked: boolean) => {
    if (!checked && smsConsent) {
      setConfirmSmsOff(true);
    } else {
      setValue('sms_consent', checked, { shouldDirty: true });
    }
  };

  const handleEmailToggle = (checked: boolean) => {
    if (!checked && emailConsent) {
      setConfirmEmailOff(true);
    } else {
      setValue('email_consent', checked, { shouldDirty: true });
    }
  };

  const handlePromotionsToggle = (checked: boolean) => {
    if (!checked && notifyPromotions) {
      setConfirmPromotionsOff(true);
    } else {
      setValue('notify_promotions', checked, { shouldDirty: true });
    }
  };

  const handleLoyaltyToggle = (checked: boolean) => {
    if (!checked && notifyLoyalty) {
      setConfirmLoyaltyOff(true);
    } else {
      setValue('notify_loyalty', checked, { shouldDirty: true });
    }
  };

  const handleSignOutAllDevices = async () => {
    setSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut({ scope: 'global' });
      toast.success('Signed out of all devices');
      router.push('/signin');
    } catch {
      toast.error('Failed to sign out');
    } finally {
      setSigningOut(false);
      setConfirmSignOut(false);
    }
  };

  const handleChangePassword = async () => {
    if (!customer.email) {
      toast.error('No email address on file');
      return;
    }

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(customer.email, {
        redirectTo: `${window.location.origin}/portal/reset-password`,
      });

      if (error) throw error;
      toast.success('Password reset email sent. Check your inbox.');
    } catch {
      toast.error('Failed to send password reset email');
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
      <p className="mt-1 text-sm text-gray-600">
        Manage your account settings and preferences.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-6">
        {/* Card 1: Personal Information */}
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>
              Your basic contact details. We use this to reach you about your appointments.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="First Name" required error={errors.first_name?.message} htmlFor="first_name">
                <Input id="first_name" {...register('first_name')} />
              </FormField>

              <FormField label="Last Name" required error={errors.last_name?.message} htmlFor="last_name">
                <Input id="last_name" {...register('last_name')} />
              </FormField>
            </div>

            <FormField label="Email" htmlFor="email">
              <div className="relative">
                <Input id="email" value={customer.email ?? ''} disabled className="bg-gray-50 pr-10" />
                <Lock className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Your email is used to sign in and cannot be changed here. Contact us if you need to update it.
              </p>
            </FormField>

            <FormField
              label="Mobile"
              required
              error={errors.phone?.message}
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
              <p className="mt-1 text-xs text-gray-500">
                We&apos;ll text you appointment reminders and updates.
              </p>
            </FormField>
          </CardContent>
        </Card>

        {/* Card 2: Communication Channels */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>Communication Channels</CardTitle>
                <CardDescription>
                  Choose how you&apos;d like to receive messages from us.
                </CardDescription>
              </div>
              <div className="group relative">
                <Info className="h-5 w-5 text-gray-400 cursor-help" />
                <div className="absolute right-0 top-6 z-10 hidden w-64 rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-600 shadow-lg group-hover:block">
                  Turning off a channel means you won&apos;t receive any messages through it, including important appointment reminders.
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
              <div>
                <p className="text-sm font-medium text-gray-900">Text Messages (SMS)</p>
                <p className="text-xs text-gray-500">
                  Get appointment reminders and updates via text
                </p>
              </div>
              <Switch
                checked={smsConsent ?? false}
                onCheckedChange={handleSmsToggle}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
              <div>
                <p className="text-sm font-medium text-gray-900">Email</p>
                <p className="text-xs text-gray-500">
                  Get receipts, confirmations, and updates via email
                </p>
              </div>
              <Switch
                checked={emailConsent ?? false}
                onCheckedChange={handleEmailToggle}
              />
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Notification Preferences */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>
                  Control what types of messages you receive.
                </CardDescription>
              </div>
              <div className="group relative">
                <Info className="h-5 w-5 text-gray-400 cursor-help" />
                <div className="absolute right-0 top-6 z-10 hidden w-64 rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-600 shadow-lg group-hover:block">
                  Some notifications are required to keep you informed about your appointments. Optional notifications can be turned off anytime.
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Required notifications */}
            <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div>
                <p className="text-sm font-medium text-gray-900">Appointment Reminders</p>
                <p className="text-xs text-gray-500">
                  Booking confirmations and upcoming appointment reminders
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">Required</span>
                <Switch checked disabled className="opacity-60" onCheckedChange={() => {}} />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div>
                <p className="text-sm font-medium text-gray-900">Service Updates</p>
                <p className="text-xs text-gray-500">
                  Status updates when your vehicle is being serviced
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">Required</span>
                <Switch checked disabled className="opacity-60" onCheckedChange={() => {}} />
              </div>
            </div>

            {/* Optional notifications */}
            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
              <div>
                <p className="text-sm font-medium text-gray-900">Promotions & Special Offers</p>
                <p className="text-xs text-gray-500">
                  Exclusive discounts and seasonal deals just for you
                </p>
              </div>
              <Switch
                checked={notifyPromotions ?? true}
                onCheckedChange={handlePromotionsToggle}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
              <div>
                <p className="text-sm font-medium text-gray-900">Loyalty Rewards</p>
                <p className="text-xs text-gray-500">
                  Points earned, reward milestones, and bonus opportunities
                </p>
              </div>
              <Switch
                checked={notifyLoyalty ?? true}
                onCheckedChange={handleLoyaltyToggle}
              />
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button type="submit" disabled={saving || !isDirty}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>

      {/* Card 4: Account Security (outside form) */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Account Security</CardTitle>
          <CardDescription>
            Manage your password and sign-in sessions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={handleChangePassword}>
              Change Password
            </Button>
            <Button
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => setConfirmSignOut(true)}
            >
              Sign Out All Devices
            </Button>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Signing out all devices will log you out everywhere, including this browser. You&apos;ll need to sign in again.
          </p>
        </CardContent>
      </Card>

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        open={confirmSmsOff}
        onOpenChange={setConfirmSmsOff}
        title="Turn Off Text Messages?"
        description="You won't receive any text messages from us, including appointment reminders and service updates. You can turn this back on anytime."
        confirmLabel="Turn Off"
        variant="destructive"
        onConfirm={() => {
          setValue('sms_consent', false, { shouldDirty: true });
          setConfirmSmsOff(false);
        }}
      />

      <ConfirmDialog
        open={confirmEmailOff}
        onOpenChange={setConfirmEmailOff}
        title="Turn Off Email?"
        description="You won't receive any emails from us, including receipts, confirmations, and appointment reminders. You can turn this back on anytime."
        confirmLabel="Turn Off"
        variant="destructive"
        onConfirm={() => {
          setValue('email_consent', false, { shouldDirty: true });
          setConfirmEmailOff(false);
        }}
      />

      <ConfirmDialog
        open={confirmPromotionsOff}
        onOpenChange={setConfirmPromotionsOff}
        title="Turn Off Promotions?"
        description="You'll miss out on exclusive discounts, special offers, and seasonal deals. You can turn this back on anytime."
        confirmLabel="Turn Off"
        variant="destructive"
        onConfirm={() => {
          setValue('notify_promotions', false, { shouldDirty: true });
          setConfirmPromotionsOff(false);
        }}
      />

      <ConfirmDialog
        open={confirmLoyaltyOff}
        onOpenChange={setConfirmLoyaltyOff}
        title="Turn Off Loyalty Updates?"
        description="You won't be notified when you earn points, reach reward milestones, or unlock bonus opportunities. You can turn this back on anytime."
        confirmLabel="Turn Off"
        variant="destructive"
        onConfirm={() => {
          setValue('notify_loyalty', false, { shouldDirty: true });
          setConfirmLoyaltyOff(false);
        }}
      />

      <ConfirmDialog
        open={confirmSignOut}
        onOpenChange={setConfirmSignOut}
        title="Sign Out All Devices?"
        description="This will sign you out of every device where you're currently logged in, including this one. You'll need to sign in again to continue."
        confirmLabel="Sign Out Everywhere"
        variant="destructive"
        loading={signingOut}
        onConfirm={handleSignOutAllDevices}
      />
    </div>
  );
}

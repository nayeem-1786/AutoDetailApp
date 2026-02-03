'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { toast } from 'sonner';
import { employeeCreateSchema, type EmployeeCreateInput } from '@/lib/utils/validation';
import { ROLE_LABELS } from '@/lib/utils/constants';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { FormField } from '@/components/ui/form-field';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';

export default function NewStaffPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<EmployeeCreateInput>({
    resolver: formResolver(employeeCreateSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      role: 'detailer',
      password: '',
      pin_code: '',
      hourly_rate: null,
      bookable_for_appointments: true,
    },
  });

  const bookable = watch('bookable_for_appointments');

  async function onSubmit(data: EmployeeCreateInput) {
    setSaving(true);
    try {
      const res = await fetch('/api/staff/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Failed to create staff member');
      }

      toast.success('Staff member created successfully');
      router.push('/admin/staff');
    } catch (err) {
      console.error('Create staff error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to create staff member');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Add Staff Member"
        action={
          <Button variant="outline" onClick={() => router.push('/admin/staff')}>
            <ArrowLeft className="h-4 w-4" />
            Back to Staff
          </Button>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-6 md:grid-cols-2">
              <FormField label="First Name" error={errors.first_name?.message} required htmlFor="first_name">
                <Input id="first_name" {...register('first_name')} placeholder="John" />
              </FormField>

              <FormField label="Last Name" error={errors.last_name?.message} required htmlFor="last_name">
                <Input id="last_name" {...register('last_name')} placeholder="Doe" />
              </FormField>

              <FormField label="Email" error={errors.email?.message} required htmlFor="email">
                <Input id="email" type="email" {...register('email')} placeholder="john@example.com" />
              </FormField>

              <FormField label="Phone" error={errors.phone?.message} htmlFor="phone">
                <Input id="phone" {...register('phone')} placeholder="+1XXXXXXXXXX" />
              </FormField>

              <FormField label="Role" error={errors.role?.message} required htmlFor="role">
                <Select id="role" {...register('role')}>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </Select>
              </FormField>

              <FormField label="Password" error={errors.password?.message} required htmlFor="password" description="Minimum 8 characters">
                <Input id="password" type="password" {...register('password')} placeholder="Min. 8 characters" />
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
                  placeholder="0.00"
                />
              </FormField>

              <FormField label="Bookable for Appointments">
                <div className="flex items-center gap-3 pt-1">
                  <Switch
                    checked={bookable}
                    onCheckedChange={(checked) => setValue('bookable_for_appointments', checked)}
                  />
                  <span className="text-sm text-gray-600">
                    {bookable ? 'Available for booking' : 'Not bookable'}
                  </span>
                </div>
              </FormField>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/admin/staff')}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Creating...' : 'Create Staff Member'}
          </Button>
        </div>
      </form>
    </div>
  );
}

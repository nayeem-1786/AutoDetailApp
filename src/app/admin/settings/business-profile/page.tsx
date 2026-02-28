'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { createClient } from '@/lib/supabase/client';
import { businessProfileSchema, businessHoursSchema, type BusinessProfileInput, type BusinessHoursInput } from '@/lib/utils/validation';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { formatPhone, formatPhoneInput } from '@/lib/utils/format';
import { toast } from 'sonner';

const DAY_LABELS = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
] as const;

type DayKey = typeof DAY_LABELS[number]['key'];

export default function BusinessProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingHours, setSavingHours] = useState(false);
  const [savingBooking, setSavingBooking] = useState(false);
  const [booking, setBooking] = useState({
    default_deposit_amount: '50',
    quote_validity_days: '10',
  });
  const [bookingDirty, setBookingDirty] = useState(false);
  const [savingSeo, setSavingSeo] = useState(false);
  const [seo, setSeo] = useState({
    business_description: '',
    business_latitude: '',
    business_longitude: '',
    service_area_name: '',
    service_area_radius: '',
    price_range: '$$',
  });
  const [seoDirty, setSeoDirty] = useState(false);
  const [hours, setHours] = useState<BusinessHoursInput>({
    monday: { open: '08:00', close: '18:00' },
    tuesday: { open: '08:00', close: '18:00' },
    wednesday: { open: '08:00', close: '18:00' },
    thursday: { open: '08:00', close: '18:00' },
    friday: { open: '08:00', close: '18:00' },
    saturday: { open: '08:00', close: '18:00' },
    sunday: null,
  });
  const [hoursDirty, setHoursDirty] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isDirty },
  } = useForm<BusinessProfileInput>({
    resolver: formResolver(businessProfileSchema),
    defaultValues: {
      business_name: '',
      business_phone: '',
      business_address: {
        line1: '',
        city: '',
        state: '',
        zip: '',
      },
      business_email: '',
      business_website: '',
    },
  });

  useEffect(() => {
    async function loadSettings() {
      const supabase = createClient();

      const { data, error } = await supabase
        .from('business_settings')
        .select('key, value')
        .in('key', [
          'business_name', 'business_phone', 'business_address', 'business_email', 'business_website', 'business_hours',
          'business_description', 'business_latitude', 'business_longitude', 'service_area_name', 'service_area_radius', 'price_range',
          'default_deposit_amount', 'quote_validity_days',
        ]);

      if (error) {
        toast.error('Failed to load business settings', {
          description: error.message,
        });
        setLoading(false);
        return;
      }

      const settings: Record<string, unknown> = {};
      for (const row of data || []) {
        settings[row.key] = row.value;
      }

      // Convert any stored format (E.164 or raw) to (XXX) XXX-XXXX for display
      const rawPhone = (settings.business_phone as string) || '';
      const displayPhone = rawPhone ? formatPhone(rawPhone) : '';

      reset({
        business_name: (settings.business_name as string) || '',
        business_phone: displayPhone,
        business_address: (settings.business_address as BusinessProfileInput['business_address']) || {
          line1: '',
          city: '',
          state: '',
          zip: '',
        },
        business_email: (settings.business_email as string) || '',
        business_website: (settings.business_website as string) || '',
      });

      // Load business hours
      if (settings.business_hours) {
        const parsed = businessHoursSchema.safeParse(settings.business_hours);
        if (parsed.success) {
          setHours(parsed.data);
        }
      }

      // Load booking & quote settings
      setBooking({
        default_deposit_amount: String(settings.default_deposit_amount ?? '50'),
        quote_validity_days: String(settings.quote_validity_days ?? '10'),
      });

      // Load SEO settings
      setSeo({
        business_description: String(settings.business_description ?? ''),
        business_latitude: String(settings.business_latitude ?? ''),
        business_longitude: String(settings.business_longitude ?? ''),
        service_area_name: String(settings.service_area_name ?? ''),
        service_area_radius: String(settings.service_area_radius ?? ''),
        price_range: String(settings.price_range ?? '$$'),
      });

      setLoading(false);
    }

    loadSettings();
  }, [reset]);

  async function onSubmit(formData: BusinessProfileInput) {
    setSaving(true);
    const supabase = createClient();

    const entries = [
      { key: 'business_name', value: formData.business_name },
      { key: 'business_phone', value: formData.business_phone },
      { key: 'business_address', value: formData.business_address },
      { key: 'business_email', value: formData.business_email || null },
      { key: 'business_website', value: formData.business_website || null },
    ];

    for (const entry of entries) {
      const { error } = await supabase
        .from('business_settings')
        .upsert(
          {
            key: entry.key,
            value: entry.value as unknown,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'key' }
        );

      if (error) {
        toast.error(`Failed to save ${entry.key}`, {
          description: error.message,
        });
        setSaving(false);
        return;
      }
    }

    toast.success('Business profile updated');
    reset(formData);
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Business Profile"
          description="Update your business information."
        />
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  function toggleDayOpen(day: DayKey) {
    setHours((prev) => ({
      ...prev,
      [day]: prev[day] ? null : { open: '08:00', close: '18:00' },
    }));
    setHoursDirty(true);
  }

  function updateDayTime(day: DayKey, field: 'open' | 'close', value: string) {
    setHours((prev) => {
      const current = prev[day];
      if (!current) return prev;
      return {
        ...prev,
        [day]: { ...current, [field]: value },
      };
    });
    setHoursDirty(true);
  }

  async function saveHours() {
    setSavingHours(true);
    const supabase = createClient();

    const { error } = await supabase
      .from('business_settings')
      .upsert(
        {
          key: 'business_hours',
          value: hours as unknown,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );

    if (error) {
      toast.error('Failed to save business hours', {
        description: error.message,
      });
    } else {
      toast.success('Business hours updated');
      setHoursDirty(false);
    }
    setSavingHours(false);
  }

  function updateBookingField(field: keyof typeof booking, value: string) {
    setBooking((prev) => ({ ...prev, [field]: value }));
    setBookingDirty(true);
  }

  async function saveBooking() {
    const depositNum = parseInt(booking.default_deposit_amount) || 50;
    const validityNum = parseInt(booking.quote_validity_days) || 10;

    if (depositNum < 0) {
      toast.error('Deposit amount cannot be negative');
      return;
    }
    if (validityNum < 1 || validityNum > 365) {
      toast.error('Quote validity must be between 1 and 365 days');
      return;
    }

    setSavingBooking(true);
    const supabase = createClient();

    const entries = [
      { key: 'default_deposit_amount', value: depositNum },
      { key: 'quote_validity_days', value: validityNum },
    ];

    for (const entry of entries) {
      const { error } = await supabase
        .from('business_settings')
        .upsert(
          {
            key: entry.key,
            value: entry.value as unknown,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'key' }
        );

      if (error) {
        toast.error(`Failed to save ${entry.key}`, { description: error.message });
        setSavingBooking(false);
        return;
      }
    }

    toast.success('Booking & Quote settings updated');
    setBookingDirty(false);
    setSavingBooking(false);
  }

  function updateSeoField(field: keyof typeof seo, value: string) {
    setSeo((prev) => ({ ...prev, [field]: value }));
    setSeoDirty(true);
  }

  async function saveSeo() {
    setSavingSeo(true);
    const supabase = createClient();

    const entries = [
      { key: 'business_description', value: seo.business_description || null },
      { key: 'business_latitude', value: seo.business_latitude ? parseFloat(seo.business_latitude) : null },
      { key: 'business_longitude', value: seo.business_longitude ? parseFloat(seo.business_longitude) : null },
      { key: 'service_area_name', value: seo.service_area_name || null },
      { key: 'service_area_radius', value: seo.service_area_radius || null },
      { key: 'price_range', value: seo.price_range || null },
    ];

    for (const entry of entries) {
      if (entry.value === null) continue;
      const { error } = await supabase
        .from('business_settings')
        .upsert(
          {
            key: entry.key,
            value: entry.value as unknown,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'key' }
        );

      if (error) {
        toast.error(`Failed to save ${entry.key}`, {
          description: error.message,
        });
        setSavingSeo(false);
        return;
      }
    }

    toast.success('SEO & Location settings updated');
    setSeoDirty(false);
    setSavingSeo(false);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Business Profile"
        description="Update your business name, contact info, and address."
      />

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Business Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              label="Business Name"
              required
              error={errors.business_name?.message}
              htmlFor="business_name"
            >
              <Input
                id="business_name"
                placeholder="Smart Detail Auto Spa"
                {...register('business_name')}
              />
            </FormField>

            <FormField
              label="Business Phone"
              error={errors.business_phone?.message}
              htmlFor="business_phone"
            >
              <Input
                id="business_phone"
                placeholder="(310) 555-1234"
                {...register('business_phone', {
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                    const formatted = formatPhoneInput(e.target.value);
                    setValue('business_phone', formatted, { shouldDirty: true, shouldValidate: true });
                  },
                })}
              />
            </FormField>

            <FormField
              label="Business Email"
              error={errors.business_email?.message}
              htmlFor="business_email"
            >
              <Input
                id="business_email"
                type="email"
                placeholder="info@yourbusiness.com"
                {...register('business_email')}
              />
            </FormField>

            <FormField
              label="Website"
              error={errors.business_website?.message}
              htmlFor="business_website"
            >
              <Input
                id="business_website"
                type="url"
                placeholder="https://yourbusiness.com"
                {...register('business_website')}
              />
            </FormField>

            <div className="border-t border-gray-200 pt-4">
              <h4 className="mb-3 text-sm font-medium text-gray-700">
                Business Address
              </h4>
              <div className="space-y-4">
                <FormField
                  label="Street Address"
                  required
                  error={errors.business_address?.line1?.message}
                  htmlFor="address_line1"
                >
                  <Input
                    id="address_line1"
                    placeholder="123 Main St"
                    {...register('business_address.line1')}
                  />
                </FormField>

                <div className="grid gap-4 sm:grid-cols-3">
                  <FormField
                    label="City"
                    required
                    error={errors.business_address?.city?.message}
                    htmlFor="address_city"
                  >
                    <Input
                      id="address_city"
                      placeholder="Torrance"
                      {...register('business_address.city')}
                    />
                  </FormField>

                  <FormField
                    label="State"
                    required
                    error={errors.business_address?.state?.message}
                    htmlFor="address_state"
                  >
                    <Input
                      id="address_state"
                      placeholder="CA"
                      {...register('business_address.state')}
                    />
                  </FormField>

                  <FormField
                    label="ZIP Code"
                    required
                    error={errors.business_address?.zip?.message}
                    htmlFor="address_zip"
                  >
                    <Input
                      id="address_zip"
                      placeholder="90501"
                      {...register('business_address.zip')}
                    />
                  </FormField>
                </div>
              </div>
            </div>

            <div className="flex justify-end border-t border-gray-200 pt-4">
              <Button type="submit" disabled={saving || !isDirty}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {/* Business Hours */}
      <Card>
        <CardHeader>
          <CardTitle>Business Hours</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {DAY_LABELS.map(({ key, label }) => {
            const dayHours = hours[key];
            const isOpen = dayHours !== null;

            return (
              <div
                key={key}
                className="flex items-center gap-4 border-b border-gray-100 pb-3 last:border-0 last:pb-0"
              >
                <div className="w-28 text-sm font-medium text-gray-700">
                  {label}
                </div>
                <Switch
                  checked={isOpen}
                  onCheckedChange={() => toggleDayOpen(key)}
                />
                {isOpen && dayHours ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={dayHours.open}
                      onChange={(e) =>
                        updateDayTime(key, 'open', e.target.value)
                      }
                      className="w-32"
                    />
                    <span className="text-sm text-gray-500">to</span>
                    <Input
                      type="time"
                      value={dayHours.close}
                      onChange={(e) =>
                        updateDayTime(key, 'close', e.target.value)
                      }
                      className="w-32"
                    />
                  </div>
                ) : (
                  <span className="text-sm text-gray-400">Closed</span>
                )}
              </div>
            );
          })}

          <div className="flex justify-end border-t border-gray-200 pt-4">
            <Button
              type="button"
              onClick={saveHours}
              disabled={savingHours || !hoursDirty}
            >
              {savingHours ? 'Saving...' : 'Save Hours'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Booking & Quotes */}
      <Card>
        <CardHeader>
          <CardTitle>Booking &amp; Quotes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Default Deposit Amount ($)"
              description="Amount charged as a deposit when booking online."
              htmlFor="deposit_amount"
            >
              <Input
                id="deposit_amount"
                type="number"
                min="0"
                step="1"
                value={booking.default_deposit_amount}
                onChange={(e) => updateBookingField('default_deposit_amount', e.target.value)}
                placeholder="50"
              />
            </FormField>

            <FormField
              label="Quote Validity (days)"
              description="How many days a quote remains valid. Shown in quote emails."
              htmlFor="quote_validity"
            >
              <Input
                id="quote_validity"
                type="number"
                min="1"
                max="365"
                value={booking.quote_validity_days}
                onChange={(e) => updateBookingField('quote_validity_days', e.target.value)}
                placeholder="10"
              />
            </FormField>
          </div>

          <div className="flex justify-end border-t border-gray-200 pt-4">
            <Button
              type="button"
              onClick={saveBooking}
              disabled={savingBooking || !bookingDirty}
            >
              {savingBooking ? 'Saving...' : 'Save Booking Settings'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* SEO & Location */}
      <Card>
        <CardHeader>
          <CardTitle>SEO &amp; Location</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            These values power JSON-LD structured data, the OG image, and homepage meta description.
          </p>

          <FormField label="Business Description" htmlFor="seo_description">
            <textarea
              id="seo_description"
              rows={3}
              value={seo.business_description}
              onChange={(e) => updateSeoField('business_description', e.target.value)}
              placeholder="Professional auto detailing, ceramic coatings, and car care supplies..."
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Latitude" htmlFor="seo_latitude">
              <Input
                id="seo_latitude"
                type="number"
                step="any"
                value={seo.business_latitude}
                onChange={(e) => updateSeoField('business_latitude', e.target.value)}
                placeholder="33.7922"
              />
            </FormField>

            <FormField label="Longitude" htmlFor="seo_longitude">
              <Input
                id="seo_longitude"
                type="number"
                step="any"
                value={seo.business_longitude}
                onChange={(e) => updateSeoField('business_longitude', e.target.value)}
                placeholder="-118.3151"
              />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Service Area Name" htmlFor="seo_area_name">
              <Input
                id="seo_area_name"
                value={seo.service_area_name}
                onChange={(e) => updateSeoField('service_area_name', e.target.value)}
                placeholder="South Bay, Los Angeles"
              />
            </FormField>

            <FormField label="Service Area Radius" htmlFor="seo_area_radius">
              <Input
                id="seo_area_radius"
                value={seo.service_area_radius}
                onChange={(e) => updateSeoField('service_area_radius', e.target.value)}
                placeholder="5 mi"
              />
            </FormField>
          </div>

          <FormField label="Price Range" htmlFor="seo_price_range">
            <select
              id="seo_price_range"
              value={seo.price_range}
              onChange={(e) => updateSeoField('price_range', e.target.value)}
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="$">$ — Budget</option>
              <option value="$$">$$ — Moderate</option>
              <option value="$$$">$$$ — Premium</option>
              <option value="$$$$">$$$$ — Luxury</option>
            </select>
          </FormField>

          <div className="flex justify-end border-t border-gray-200 pt-4">
            <Button
              type="button"
              onClick={saveSeo}
              disabled={savingSeo || !seoDirty}
            >
              {savingSeo ? 'Saving...' : 'Save SEO Settings'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

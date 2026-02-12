import { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBusinessInfo } from '@/lib/data/business';
import { AuthorizationClient } from './authorization-client';

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ action?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const biz = await getBusinessInfo();
  return {
    title: `Service Authorization — ${biz.name}`,
    robots: 'noindex, nofollow',
  };
}

export default async function AuthorizationPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const { action } = await searchParams;
  const supabase = createAdminClient();
  const biz = await getBusinessInfo();

  // Look up addon by token
  const { data: addon, error } = await supabase
    .from('job_addons')
    .select(`
      *,
      job:jobs!job_addons_job_id_fkey(
        id, services, estimated_pickup_at,
        customer:customers!jobs_customer_id_fkey(id, first_name, last_name, phone),
        vehicle:vehicles!jobs_vehicle_id_fkey(id, year, make, model, color)
      )
    `)
    .eq('authorization_token', token)
    .single();

  // Not found
  if (error || !addon) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            <svg className="h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">Authorization Not Found</h1>
          <p className="mt-2 text-sm text-gray-500">
            This authorization link is invalid or has been removed.
          </p>
        </div>
      </div>
    );
  }

  // Check expiration
  const isExpired = addon.status === 'expired' ||
    (addon.status === 'pending' && addon.expires_at && new Date(addon.expires_at) < new Date());

  // If expired but still marked pending, update it
  if (addon.status === 'pending' && isExpired) {
    await supabase
      .from('job_addons')
      .update({ status: 'expired', responded_at: new Date().toISOString() })
      .eq('id', addon.id);
  }

  // Already responded
  if (addon.status !== 'pending' && !isExpired) {
    const statusMessages: Record<string, { title: string; message: string; color: string }> = {
      approved: {
        title: 'Approved!',
        message: "Your detailer will get right on it. Thank you!",
        color: 'bg-green-100 text-green-800',
      },
      declined: {
        title: 'Declined',
        message: "No problem! We'll note this as a recommendation for your next visit.",
        color: 'bg-gray-100 text-gray-700',
      },
    };

    const status = statusMessages[addon.status];
    if (status) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
          <div className="w-full max-w-md text-center">
            <div className={`mx-auto mb-4 inline-flex rounded-full px-6 py-2 text-sm font-medium ${status.color}`}>
              {status.title}
            </div>
            <p className="text-sm text-gray-600">{status.message}</p>
            <p className="mt-4 text-xs text-gray-400">{biz.name}</p>
          </div>
        </div>
      );
    }
  }

  // Expired
  if (isExpired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
            <svg className="h-8 w-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">Authorization Expired</h1>
          <p className="mt-2 text-sm text-gray-500">
            This authorization has expired. Please contact {biz.name} at{' '}
            <a href={`tel:${biz.phone}`} className="text-blue-600 hover:underline">
              {biz.phone}
            </a>{' '}
            if you&apos;d like to proceed.
          </p>
        </div>
      </div>
    );
  }

  // Get photos
  let photos: { id: string; image_url: string; annotation_data: unknown }[] = [];
  if (addon.photo_ids?.length > 0) {
    const { data: photoData } = await supabase
      .from('job_photos')
      .select('id, image_url, annotation_data')
      .in('id', addon.photo_ids);
    photos = photoData ?? [];
  }

  // Get catalog item name
  let catalogItemName: string | null = null;
  if (addon.service_id) {
    const { data: svc } = await supabase.from('services').select('name').eq('id', addon.service_id).single();
    catalogItemName = svc?.name ?? null;
  } else if (addon.product_id) {
    const { data: prod } = await supabase.from('products').select('name').eq('id', addon.product_id).single();
    catalogItemName = prod?.name ?? null;
  }

  const job = addon.job as {
    id: string;
    services: { id: string; name: string; price: number }[];
    estimated_pickup_at: string | null;
    customer: { id: string; first_name: string; last_name: string; phone: string | null } | null;
    vehicle: { id: string; year: number | null; make: string | null; model: string | null; color: string | null } | null;
  };

  const customer = job?.customer;
  const vehicle = job?.vehicle;
  const vehicleDesc = vehicle ? [vehicle.color, vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') : null;
  const currentServices = (job?.services ?? []).map((s) => s.name).join(', ');
  const finalPrice = addon.price - addon.discount_amount;
  const itemName = catalogItemName || addon.custom_description || 'Service Add-on';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-lg px-4 py-6">
        {/* Header */}
        <div className="mb-6 rounded-xl bg-blue-800 p-6 text-center shadow-lg">
          {biz.logo_url && (
            <img src={biz.logo_url} alt={biz.name} className="mx-auto mb-3 h-12" />
          )}
          <h1 className="text-xl font-semibold text-white">{biz.name}</h1>
          <p className="mt-1 text-sm text-blue-200">Service Authorization Request</p>
        </div>

        {/* Content card */}
        <div className="rounded-xl bg-white shadow-md">
          {/* Greeting */}
          <div className="p-5">
            {customer && (
              <p className="mb-3 text-sm text-gray-700">
                Hi {customer.first_name},
              </p>
            )}

            {/* Message */}
            {addon.message_to_customer && (
              <p className="text-sm leading-relaxed text-gray-800">
                {addon.message_to_customer}
              </p>
            )}
          </div>

          {/* Photos */}
          {photos.length > 0 && (
            <div className="px-5 pb-4">
              {photos.map((photo) => (
                <div key={photo.id} className="overflow-hidden rounded-lg">
                  <img
                    src={photo.image_url}
                    alt="Issue found"
                    className="w-full object-cover"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Details */}
          <div className="space-y-3 border-t border-gray-100 px-5 py-4">
            {/* Item name */}
            <div>
              <p className="text-xs font-medium uppercase text-gray-500">Proposed Service</p>
              <p className="mt-0.5 text-sm font-medium text-gray-900">{itemName}</p>
            </div>

            {/* Vehicle */}
            {vehicleDesc && (
              <div>
                <p className="text-xs font-medium uppercase text-gray-500">Vehicle</p>
                <p className="mt-0.5 text-sm text-gray-900">{vehicleDesc}</p>
              </div>
            )}

            {/* Current services */}
            {currentServices && (
              <div>
                <p className="text-xs font-medium uppercase text-gray-500">Currently Performing</p>
                <p className="mt-0.5 text-sm text-gray-700">{currentServices}</p>
              </div>
            )}
          </div>

          {/* Price */}
          <div className="border-t border-gray-100 px-5 py-4">
            {addon.discount_amount > 0 ? (
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Original price</span>
                  <span className="text-gray-500 line-through">${Number(addon.price).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-green-600">Discount</span>
                  <span className="text-green-600">-${Number(addon.discount_amount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t border-gray-100 pt-1">
                  <span className="font-semibold text-gray-900">Total</span>
                  <span className="text-2xl font-bold text-gray-900">${finalPrice.toFixed(2)}</span>
                </div>
              </div>
            ) : (
              <div className="flex justify-between">
                <span className="font-semibold text-gray-900">Total</span>
                <span className="text-2xl font-bold text-gray-900">${finalPrice.toFixed(2)}</span>
              </div>
            )}
            {addon.pickup_delay_minutes > 0 && (
              <p className="mt-2 text-sm text-gray-500">
                Estimated additional time: +{addon.pickup_delay_minutes} minutes
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="border-t border-gray-100 p-5">
            <AuthorizationClient token={token} initialAction={action} />
          </div>

          {/* Contact link */}
          <div className="border-t border-gray-100 p-4 text-center">
            <a
              href={`sms:${biz.phone}`}
              className="text-sm text-blue-600 hover:underline"
            >
              Have a question? Text us
            </a>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-gray-400">
          {biz.name} &middot; {biz.address}
        </p>
      </div>
    </div>
  );
}

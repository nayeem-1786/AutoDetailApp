import { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBusinessInfo } from '@/lib/data/business';
import { getIssueHumanReadable, friendlyServiceName } from '@/lib/utils/issue-types';
import { AuthorizationClient } from './authorization-client';
import { AnnotationOverlay } from '@/app/pos/jobs/components/photo-annotation';
import type { Annotation } from '@/lib/utils/job-zones';
import type { IssueType } from '@/lib/supabase/types';

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ action?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const biz = await getBusinessInfo();
  return {
    title: `Additional Service Authorization — ${biz.name}`,
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
        vehicle:vehicles!jobs_vehicle_id_fkey(id, year, make, model, color),
        addons:job_addons(id, price, discount_amount, status)
      ),
      creator:employees!job_addons_created_by_fkey(first_name, last_name)
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

  // Get catalog item name + description
  let catalogItemName: string | null = null;
  let catalogItemDescription: string | null = null;
  if (addon.service_id) {
    const { data: svc } = await supabase.from('services').select('name, description').eq('id', addon.service_id).single();
    catalogItemName = svc?.name ?? null;
    catalogItemDescription = svc?.description ?? null;
  } else if (addon.product_id) {
    const { data: prod } = await supabase.from('products').select('name, description').eq('id', addon.product_id).single();
    catalogItemName = prod?.name ?? null;
    catalogItemDescription = prod?.description ?? null;
  }

  const job = addon.job as {
    id: string;
    services: { id: string; name: string; price: number }[];
    estimated_pickup_at: string | null;
    customer: { id: string; first_name: string; last_name: string; phone: string | null } | null;
    vehicle: { id: string; year: number | null; make: string | null; model: string | null; color: string | null } | null;
    addons: { id: string; price: number; discount_amount: number; status: string }[];
  };

  const creator = addon.creator as { first_name: string; last_name: string } | null;
  const detailerName = creator?.first_name || 'Your detailer';

  const customer = job?.customer;
  const vehicle = job?.vehicle;
  const vehicleDesc = vehicle && (vehicle.make || vehicle.model)
    ? [vehicle.make, vehicle.model].filter(Boolean).join(' ')
    : null;

  const addonPrice = Number(addon.price) - Number(addon.discount_amount);
  const itemName = catalogItemName || addon.custom_description || 'Service Add-on';

  // Calculate new ticket total
  const originalServicesTotal = (job?.services ?? []).reduce((sum, s) => sum + s.price, 0);
  const approvedAddonsTotal = (job?.addons ?? [])
    .filter((a) => a.status === 'approved' && a.id !== addon.id)
    .reduce((sum, a) => sum + (Number(a.price) - Number(a.discount_amount)), 0);
  const newTicketTotal = originalServicesTotal + approvedAddonsTotal + addonPrice;

  // Issue type human readable
  const issueText = getIssueHumanReadable(
    addon.issue_type as IssueType | null,
    addon.issue_description
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-lg px-4 py-6">
        {/* Header — most prominent element */}
        <div className="mb-6 rounded-xl bg-blue-800 p-6 text-center shadow-lg">
          {biz.logo_url && (
            <img src={biz.logo_url} alt={biz.name} className="mx-auto mb-3 h-12" />
          )}
          <h1 className="text-2xl font-bold text-white">
            Additional Service Authorization Request
          </h1>
        </div>

        {/* Content card */}
        <div className="rounded-xl bg-white shadow-md">
          {/* Conversational message */}
          <div className="p-5">
            <p className="text-base leading-relaxed text-gray-800">
              Hi {customer?.first_name || 'there'},
            </p>
            <p className="mt-2 text-base leading-relaxed text-gray-800">
              While working on your {vehicleDesc || 'vehicle'}, {detailerName} noticed{' '}
              <span className="font-medium">{issueText}</span>.
            </p>
            <p className="mt-2 text-base leading-relaxed text-gray-800">
              We&apos;d like to take care of it while your vehicle is already here.
            </p>
          </div>

          {/* Photos from inspection */}
          {photos.length > 0 && (
            <div className="px-5 pb-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                Photos from our inspection
              </p>
              <div className="space-y-3">
                {photos.map((photo) => {
                  const photoAnnotations = photo.annotation_data as Annotation[] | null;
                  return (
                    <div key={photo.id} className="relative overflow-hidden rounded-lg">
                      <img
                        src={photo.image_url}
                        alt="Inspection photo"
                        className="w-full object-cover"
                      />
                      {photoAnnotations && photoAnnotations.length > 0 && (
                        <AnnotationOverlay annotations={photoAnnotations} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Proposed Add-On Service */}
          <div className="border-t border-gray-100 px-5 py-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Proposed Add-On Service
            </p>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-lg font-semibold text-gray-900">{itemName}</p>
              {catalogItemDescription && (
                <p className="mt-1 text-sm text-gray-600">{catalogItemDescription}</p>
              )}
            </div>
          </div>

          {/* Pricing */}
          <div className="border-t border-gray-100 px-5 py-5">
            {addon.discount_amount > 0 ? (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Original price</span>
                  <span className="text-gray-500 line-through">${Number(addon.price).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-green-600">Discount</span>
                  <span className="text-green-600">-${Number(addon.discount_amount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t border-gray-100 pt-2">
                  <span className="text-lg font-semibold text-gray-900">Additional Cost</span>
                  <span className="text-2xl font-bold text-gray-900">${addonPrice.toFixed(2)}</span>
                </div>
              </div>
            ) : (
              <div className="flex justify-between">
                <span className="text-lg font-semibold text-gray-900">Additional Cost</span>
                <span className="text-2xl font-bold text-gray-900">${addonPrice.toFixed(2)}</span>
              </div>
            )}

            {/* New ticket total */}
            <div className="mt-3 flex justify-between rounded-lg bg-blue-50 px-3 py-2">
              <span className="text-sm text-blue-700">New Ticket Total</span>
              <span className="text-sm font-semibold text-blue-900">${newTicketTotal.toFixed(2)}</span>
            </div>

            {addon.pickup_delay_minutes > 0 && (
              <p className="mt-3 text-sm text-gray-500">
                Estimated additional time: +{addon.pickup_delay_minutes} minutes
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="border-t border-gray-100 p-5">
            <AuthorizationClient token={token} initialAction={action} />
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-sm font-medium text-gray-600">{biz.name}</p>
          {biz.address && <p className="mt-1 text-xs text-gray-400">{biz.address}</p>}
          {biz.phone && (
            <p className="mt-1">
              <a href={`tel:${biz.phone}`} className="text-xs text-blue-600 hover:underline">
                {biz.phone}
              </a>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

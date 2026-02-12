import { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBusinessInfo } from '@/lib/data/business';
import { getZoneLabel } from '@/lib/utils/job-zones';
import { GalleryClient } from './gallery-client';

interface Props {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const supabase = createAdminClient();
  const businessInfo = await getBusinessInfo();

  const { data: job } = await supabase
    .from('jobs')
    .select(`
      vehicle:vehicles!jobs_vehicle_id_fkey(year, make, model)
    `)
    .eq('gallery_token', token)
    .single();

  const vehicle = job?.vehicle as unknown as { year: number | null; make: string | null; model: string | null } | null;
  const vehicleDesc = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')
    : 'Vehicle';

  return {
    title: `${vehicleDesc} Service Photos — ${businessInfo.name}`,
    description: `View before and after photos from your ${vehicleDesc} service at ${businessInfo.name}.`,
    robots: { index: false, follow: false },
  };
}

type PhotoRow = {
  id: string;
  zone: string;
  phase: string;
  image_url: string;
  thumbnail_url: string | null;
  notes: string | null;
  is_featured: boolean;
  sort_order: number;
};

export default async function JobPhotosGalleryPage({ params }: Props) {
  const { token } = await params;
  const supabase = createAdminClient();
  const businessInfo = await getBusinessInfo();

  // Lookup job by gallery token
  const { data: job, error } = await supabase
    .from('jobs')
    .select(`
      id, status, services, timer_seconds, work_completed_at, created_at,
      customer:customers!jobs_customer_id_fkey(first_name),
      vehicle:vehicles!jobs_vehicle_id_fkey(year, make, model, color)
    `)
    .eq('gallery_token', token)
    .single();

  if (error || !job) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Not Found</h1>
          <p className="mt-2 text-gray-500">This photo gallery could not be found.</p>
        </div>
      </div>
    );
  }

  if (job.status === 'cancelled') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Job Cancelled</h1>
          <p className="mt-2 text-gray-500">This service job has been cancelled.</p>
        </div>
      </div>
    );
  }

  // Get all non-internal photos
  const { data: photos } = await supabase
    .from('job_photos')
    .select('id, zone, phase, image_url, thumbnail_url, notes, is_featured, sort_order')
    .eq('job_id', job.id)
    .eq('is_internal', false)
    .order('zone')
    .order('phase')
    .order('sort_order', { ascending: true });

  const vehicle = job.vehicle as unknown as { year: number | null; make: string | null; model: string | null; color: string | null } | null;
  const vehicleParts = [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean);
  const vehicleInfo = vehicleParts.length > 0 ? vehicleParts.join(' ') : 'Vehicle';
  const vehicleColor = vehicle?.color || null;
  const customerName = (job.customer as unknown as { first_name: string } | null)?.first_name || null;

  const services = (job.services as Array<{ name: string; price: number }>) || [];
  const completedDate = job.work_completed_at
    ? new Date(job.work_completed_at).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'America/Los_Angeles',
      })
    : null;

  // Group photos by zone
  const allPhotos: PhotoRow[] = (photos || []) as PhotoRow[];
  const photosByZone: Record<string, { intake: PhotoRow[]; completion: PhotoRow[]; progress: PhotoRow[] }> = {};
  for (const photo of allPhotos) {
    if (!photosByZone[photo.zone]) {
      photosByZone[photo.zone] = { intake: [], completion: [], progress: [] };
    }
    const phase = photo.phase as 'intake' | 'completion' | 'progress';
    photosByZone[photo.zone][phase].push(photo);
  }

  // Sort zones: exterior first, then interior
  const sortedZones = Object.keys(photosByZone).sort((a, b) => {
    if (a.startsWith('exterior_') && b.startsWith('interior_')) return -1;
    if (a.startsWith('interior_') && b.startsWith('exterior_')) return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 text-center">
        <p className="text-sm font-medium text-blue-600">{businessInfo.name}</p>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">
          {customerName ? `${customerName}'s ` : ''}{vehicleColor ? `${vehicleColor} ` : ''}{vehicleInfo}
        </h1>
        {completedDate && (
          <p className="mt-1 text-sm text-gray-500">Service completed {completedDate}</p>
        )}
      </div>

      {/* Services performed */}
      {services.length > 0 && (
        <div className="mb-8 rounded-xl bg-gray-50 p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-500">Services Performed</h2>
          <ul className="space-y-1">
            {services.map((svc, i) => (
              <li key={i} className="text-sm text-gray-700">{svc.name}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Photo gallery by zone */}
      <div className="space-y-8">
        {sortedZones.map((zoneKey) => {
          const zonePhotos = photosByZone[zoneKey];
          const label = getZoneLabel(zoneKey);
          const hasBeforeAfter = zonePhotos.intake.length > 0 && zonePhotos.completion.length > 0;

          return (
            <div key={zoneKey}>
              <h3 className="mb-3 text-lg font-semibold text-gray-900">{label}</h3>

              {hasBeforeAfter ? (
                <GalleryClient
                  beforeSrc={zonePhotos.intake[0].image_url}
                  afterSrc={zonePhotos.completion[0].image_url}
                />
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {[...zonePhotos.intake, ...zonePhotos.completion, ...zonePhotos.progress].map((photo) => (
                    <div key={photo.id} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.image_url}
                        alt={`${label} - ${photo.phase}`}
                        className="w-full rounded-lg"
                        loading="lazy"
                      />
                      <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium capitalize text-white">
                        {photo.phase}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {sortedZones.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-gray-500">Photos will be available once your service is complete.</p>
        </div>
      )}

      {/* Footer */}
      <div className="mt-12 border-t border-gray-200 pt-6 text-center">
        <p className="text-sm text-gray-400">{businessInfo.name}</p>
        {businessInfo.phone && (
          <p className="mt-1 text-sm text-gray-400">{businessInfo.phone}</p>
        )}
      </div>
    </div>
  );
}

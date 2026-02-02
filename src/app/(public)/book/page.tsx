import type { Metadata } from 'next';
import { BookingWizard } from '@/components/booking/booking-wizard';
import {
  getBookableServices,
  getBookableServiceBySlug,
  getMobileZones,
  getBusinessHours,
  getBookingConfig,
  getRebookData,
} from '@/lib/data/booking';
import { getCustomerFromSession } from '@/lib/auth/customer-helpers';
import { createClient } from '@/lib/supabase/server';
import { SITE_NAME, SITE_URL } from '@/lib/utils/constants';

export const metadata: Metadata = {
  title: `Book an Appointment | ${SITE_NAME}`,
  description:
    'Schedule your auto detailing, ceramic coating, or car care appointment online. Choose your service, pick a time, and book instantly.',
  openGraph: {
    title: `Book an Appointment | ${SITE_NAME}`,
    description:
      'Schedule your auto detailing appointment online. Choose your service, pick a time, and book instantly.',
    url: `${SITE_URL}/book`,
  },
};

interface BookPageProps {
  searchParams: Promise<{ service?: string; rebook?: string }>;
}

export default async function BookPage({ searchParams }: BookPageProps) {
  const params = await searchParams;

  const [categories, mobileZones, businessHours, bookingConfig] =
    await Promise.all([
      getBookableServices(),
      getMobileZones(),
      getBusinessHours(),
      getBookingConfig(),
    ]);

  // Pre-select service if ?service=slug is provided
  let preSelectedService = null;
  if (params.service) {
    preSelectedService = await getBookableServiceBySlug(params.service);
  }

  // Fetch rebook data if ?rebook=appointment_id is provided
  let rebookData = null;
  if (params.rebook) {
    rebookData = await getRebookData(params.rebook);
  }

  // Check if user is a logged-in customer for pre-filling customer info
  let customerData = null;
  try {
    const supabase = await createClient();
    const customer = await getCustomerFromSession(supabase);
    if (customer) {
      // Fetch customer's vehicles
      const { data: vehicles } = await supabase
        .from('vehicles')
        .select('id, vehicle_type, size_class, year, make, model, color')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false });

      customerData = {
        customer: {
          first_name: customer.first_name,
          last_name: customer.last_name,
          phone: customer.phone,
          email: customer.email,
        },
        vehicles: vehicles ?? [],
      };
    }
  } catch {
    // Not authenticated — ignore
  }

  return (
    <section className="bg-white py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Book Your Appointment
          </h1>
          <p className="mt-3 text-lg text-gray-600">
            Select a service, configure your options, and pick a time that works
            for you. Payment is collected at time of service.
          </p>
        </div>

        <div className="mt-12">
          <BookingWizard
            categories={categories}
            mobileZones={mobileZones}
            businessHours={businessHours}
            bookingConfig={bookingConfig}
            preSelectedService={preSelectedService}
            rebookData={rebookData}
            customerData={customerData}
          />
        </div>
      </div>
    </section>
  );
}

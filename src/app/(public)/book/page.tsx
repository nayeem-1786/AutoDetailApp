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
import { createAdminClient } from '@/lib/supabase/admin';
import { SITE_URL } from '@/lib/utils/constants';
import { getBusinessInfo } from '@/lib/data/business';

export async function generateMetadata(): Promise<Metadata> {
  const businessInfo = await getBusinessInfo();
  return {
    title: `Book an Appointment | ${businessInfo.name}`,
    description:
      'Schedule your auto detailing, ceramic coating, or car care appointment online. Choose your service, pick a time, and book instantly.',
    openGraph: {
      title: `Book an Appointment | ${businessInfo.name}`,
      description:
        'Schedule your auto detailing appointment online. Choose your service, pick a time, and book instantly.',
      url: `${SITE_URL}/book`,
    },
  };
}

interface BookPageProps {
  searchParams: Promise<{ service?: string; rebook?: string; coupon?: string; email?: string; name?: string; phone?: string }>;
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

  // Campaign deep-link: pre-fill customer info from URL params when not logged in
  let campaignCustomerData = null;
  if (!customerData && (params.email || params.name || params.phone)) {
    // Try to find existing customer by email for full data + vehicles
    if (params.email) {
      const adminClient = createAdminClient();
      const { data: cust } = await adminClient
        .from('customers')
        .select('id, first_name, last_name, phone, email')
        .eq('email', decodeURIComponent(params.email))
        .single();
      if (cust) {
        const { data: vehicles } = await adminClient
          .from('vehicles')
          .select('id, vehicle_type, size_class, year, make, model, color')
          .eq('customer_id', cust.id)
          .order('created_at', { ascending: false });
        campaignCustomerData = {
          customer: { first_name: cust.first_name, last_name: cust.last_name, phone: cust.phone, email: cust.email },
          vehicles: vehicles ?? [],
        };
      }
    }

    // Fallback: use URL params directly (customer not found or no email provided)
    if (!campaignCustomerData) {
      const nameParts = params.name ? decodeURIComponent(params.name).split(' ') : [];
      campaignCustomerData = {
        customer: {
          first_name: nameParts[0] || '',
          last_name: nameParts.slice(1).join(' ') || '',
          phone: params.phone ? decodeURIComponent(params.phone) : null,
          email: params.email ? decodeURIComponent(params.email) : null,
        },
        vehicles: [],
      };
    }
  }

  return (
    <section className="bg-white dark:bg-gray-900 py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl">
            Book Your Appointment
          </h1>
          <p className="mt-3 text-lg text-gray-600 dark:text-gray-400">
            Select a service, configure your options, and pick a time that works
            for you.
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
            customerData={customerData ?? campaignCustomerData}
            couponCode={params.coupon ?? null}
          />
        </div>
      </div>
    </section>
  );
}

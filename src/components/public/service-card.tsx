import Link from 'next/link';
import { Clock, Car, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils/format';
import type { Service } from '@/lib/supabase/types';

interface ServiceCardProps {
  service: Service;
  categorySlug: string;
}

function getStartingPrice(service: Service): string {
  switch (service.pricing_model) {
    case 'vehicle_size': {
      if (service.pricing && service.pricing.length > 0) {
        const tier = service.pricing[0];
        const prices = [
          tier.vehicle_size_sedan_price,
          tier.vehicle_size_truck_suv_price,
          tier.vehicle_size_suv_van_price,
        ].filter((p): p is number => p !== null);
        if (prices.length > 0) {
          return `From ${formatCurrency(Math.min(...prices))}`;
        }
        return `From ${formatCurrency(tier.price)}`;
      }
      return 'Contact for pricing';
    }
    case 'scope':
    case 'specialty': {
      if (service.pricing && service.pricing.length > 0) {
        const sorted = [...service.pricing].sort((a, b) => a.price - b.price);
        return `From ${formatCurrency(sorted[0].price)}`;
      }
      return 'Contact for pricing';
    }
    case 'per_unit': {
      if (service.per_unit_price !== null) {
        return `${formatCurrency(service.per_unit_price)}/${service.per_unit_label ?? 'unit'}`;
      }
      return 'Contact for pricing';
    }
    case 'flat': {
      if (service.flat_price !== null) {
        return formatCurrency(service.flat_price);
      }
      return 'Contact for pricing';
    }
    case 'custom': {
      if (service.custom_starting_price !== null) {
        return `From ${formatCurrency(service.custom_starting_price)}`;
      }
      return 'Contact for pricing';
    }
    default:
      return 'Contact for pricing';
  }
}

function truncateDescription(text: string, maxLength: number = 120): string {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + '...';
}

export function ServiceCard({ service, categorySlug }: ServiceCardProps) {
  const priceDisplay = getStartingPrice(service);

  return (
    <Link href={`/services/${categorySlug}/${service.slug}`} className="group block">
      <div className="h-full rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700 transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between">
          <h3 className="font-display text-lg font-semibold text-gray-900 dark:text-gray-100 group-hover:text-brand-600 transition-colors">
            {service.name}
          </h3>
          <div className="ml-3 flex-shrink-0 text-gray-400 group-hover:text-brand-600 transition-colors">
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>

        {service.description && (
          <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
            {truncateDescription(service.description)}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-lg font-bold text-brand-600">
            {priceDisplay}
          </span>
          <Badge variant="secondary" className="text-xs">
            <Clock className="mr-1 h-3 w-3" />
            {service.base_duration_minutes} min
          </Badge>
          {service.mobile_eligible && (
            <Badge variant="info" className="text-xs">
              <Car className="mr-1 h-3 w-3" />
              Mobile
            </Badge>
          )}
        </div>
      </div>
    </Link>
  );
}

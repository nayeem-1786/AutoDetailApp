import Link from 'next/link';
import Image from 'next/image';
import { Clock, Car, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils/format';
import { getSaleStatus, hasAnySalePrice, getTierSaleInfo } from '@/lib/utils/sale-pricing';
import type { Service } from '@/lib/supabase/types';

interface ServiceCardProps {
  service: Service;
  categorySlug: string;
}

interface PriceDisplay {
  text: string;
  wasText?: string;
  isOnSale: boolean;
}

function getStartingPrice(service: Service): PriceDisplay {
  const saleStatus = getSaleStatus(service);
  const tiers = service.pricing ?? [];
  const showSale = saleStatus.isOnSale && hasAnySalePrice(tiers);

  switch (service.pricing_model) {
    case 'vehicle_size': {
      if (tiers.length > 0) {
        const tier = tiers[0];
        const prices = [
          tier.vehicle_size_sedan_price,
          tier.vehicle_size_truck_suv_price,
          tier.vehicle_size_suv_van_price,
        ].filter((p): p is number => p !== null);
        const standardMin = prices.length > 0 ? Math.min(...prices) : tier.price;

        if (showSale && tier.sale_price !== null && tier.sale_price < tier.price) {
          const saleInfo = getTierSaleInfo(tier.price, tier.sale_price, true);
          if (saleInfo?.isDiscounted) {
            return {
              text: `From ${formatCurrency(saleInfo.currentPrice)}`,
              wasText: `From ${formatCurrency(standardMin)}`,
              isOnSale: true,
            };
          }
        }
        return { text: `From ${formatCurrency(standardMin)}`, isOnSale: false };
      }
      return { text: 'Contact for pricing', isOnSale: false };
    }
    case 'scope':
    case 'specialty': {
      if (tiers.length > 0) {
        const sorted = [...tiers].sort((a, b) => a.price - b.price);
        if (showSale) {
          const saleInfo = getTierSaleInfo(sorted[0].price, sorted[0].sale_price, true);
          if (saleInfo?.isDiscounted) {
            return {
              text: `From ${formatCurrency(saleInfo.currentPrice)}`,
              wasText: `From ${formatCurrency(saleInfo.originalPrice)}`,
              isOnSale: true,
            };
          }
        }
        return { text: `From ${formatCurrency(sorted[0].price)}`, isOnSale: false };
      }
      return { text: 'Contact for pricing', isOnSale: false };
    }
    case 'per_unit': {
      if (service.per_unit_price !== null) {
        return { text: `${formatCurrency(service.per_unit_price)}/${service.per_unit_label ?? 'unit'}`, isOnSale: false };
      }
      return { text: 'Contact for pricing', isOnSale: false };
    }
    case 'flat': {
      if (service.flat_price !== null) {
        return { text: formatCurrency(service.flat_price), isOnSale: false };
      }
      return { text: 'Contact for pricing', isOnSale: false };
    }
    case 'custom': {
      if (service.custom_starting_price !== null) {
        return { text: `From ${formatCurrency(service.custom_starting_price)}`, isOnSale: false };
      }
      return { text: 'Contact for pricing', isOnSale: false };
    }
    default:
      return { text: 'Contact for pricing', isOnSale: false };
  }
}

export function ServiceCard({ service, categorySlug }: ServiceCardProps) {
  const priceDisplay = getStartingPrice(service);

  return (
    <Link href={`/services/${categorySlug}/${service.slug}`} className="group block">
      <div className="h-full overflow-hidden rounded-2xl bg-brand-surface border border-site-border transition-all duration-300 hover:border-lime/30 hover:-translate-y-1 hover:shadow-lime-sm">
        {/* Service image */}
        {service.image_url && (
          <div className="relative w-full h-48 sm:h-56 overflow-hidden">
            {priceDisplay.isOnSale && (
              <span className="absolute top-3 left-3 z-10 inline-flex items-center rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-bold text-white uppercase tracking-wide">
                Sale
              </span>
            )}
            <Image
              src={service.image_url}
              alt={service.name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover group-hover:scale-105 transition-transform duration-500"
            />
          </div>
        )}

        <div className="p-6">
          <div className="flex items-start justify-between">
            <h3 className="font-display text-lg font-bold text-site-text group-hover:text-lime transition-colors">
              {service.name}
            </h3>
            <div className="ml-3 flex-shrink-0 text-site-text-dim group-hover:text-lime transition-colors">
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>

          {service.description && (
            <p className="mt-2 text-sm leading-relaxed text-site-text-muted line-clamp-2">
              {service.description}
            </p>
          )}

          <div className="mt-4 pt-4 border-t border-site-border flex flex-wrap items-center justify-between gap-2">
            <div>
              {priceDisplay.wasText && (
                <span className="text-sm text-site-text-muted line-through mr-2">
                  {priceDisplay.wasText}
                </span>
              )}
              <span className="text-lg font-bold text-lime">
                {priceDisplay.text}
              </span>
            </div>
            <div className="flex items-center gap-2">
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
        </div>
      </div>
    </Link>
  );
}

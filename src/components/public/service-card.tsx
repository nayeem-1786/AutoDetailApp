import Link from 'next/link';
import Image from 'next/image';
import { Clock, Car, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatMoney } from '@/lib/utils/format';
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
          tier.vehicle_size_sedan_price_cents,
          tier.vehicle_size_truck_suv_price_cents,
          tier.vehicle_size_suv_van_price_cents,
        ].filter((p): p is number => p !== null);
        const standardMin = prices.length > 0 ? Math.min(...prices) : tier.price_cents;

        if (showSale && tier.sale_price_cents !== null && tier.sale_price_cents < tier.price_cents) {
          const saleInfo = getTierSaleInfo(tier.price_cents, tier.sale_price_cents, true);
          if (saleInfo?.isDiscounted) {
            return {
              text: `From ${formatMoney(saleInfo.currentPriceCents)}`,
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
        const sorted = [...tiers].sort((a, b) => a.price_cents - b.price_cents);
        if (showSale) {
          const saleInfo = getTierSaleInfo(sorted[0].price_cents, sorted[0].sale_price_cents, true);
          if (saleInfo?.isDiscounted) {
            return {
              text: `From ${formatMoney(saleInfo.currentPriceCents)}`,
              wasText: `From ${formatMoney(saleInfo.originalPriceCents)}`,
              isOnSale: true,
            };
          }
        }
        return { text: `From ${formatCurrency(sorted[0].price_cents)}`, isOnSale: false };
      }
      return { text: 'Contact for pricing', isOnSale: false };
    }
    case 'per_unit': {
      if (service.per_unit_price_cents !== null) {
        const label = service.per_unit_label ?? 'unit';
        if (saleStatus.isOnSale && service.sale_price_cents != null && service.sale_price_cents < service.per_unit_price_cents) {
          return {
            text: `${formatCurrency(service.sale_price_cents)}/${label}`,
            wasText: `${formatCurrency(service.per_unit_price_cents)}/${label}`,
            isOnSale: true,
          };
        }
        return { text: `${formatCurrency(service.per_unit_price_cents)}/${label}`, isOnSale: false };
      }
      return { text: 'Contact for pricing', isOnSale: false };
    }
    case 'flat': {
      if (service.flat_price_cents !== null) {
        if (saleStatus.isOnSale && service.sale_price_cents != null && service.sale_price_cents < service.flat_price_cents) {
          return {
            text: formatCurrency(service.sale_price_cents),
            wasText: formatCurrency(service.flat_price_cents),
            isOnSale: true,
          };
        }
        return { text: formatCurrency(service.flat_price_cents), isOnSale: false };
      }
      return { text: 'Contact for pricing', isOnSale: false };
    }
    case 'custom': {
      if (service.custom_starting_price_cents !== null) {
        return { text: `From ${formatCurrency(service.custom_starting_price_cents)}`, isOnSale: false };
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
      <div className="h-full overflow-hidden rounded-2xl bg-brand-surface border border-site-border transition-all duration-300 hover:border-accent-ui/30 hover:-translate-y-1 hover:shadow-accent-sm">
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
            <h3 className="font-display text-lg font-bold text-site-text group-hover:text-accent-ui transition-colors">
              {service.name}
            </h3>
            <div className="ml-3 flex-shrink-0 text-site-text-dim group-hover:text-accent-ui transition-colors">
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
              <span className="text-lg font-bold text-accent-brand">
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

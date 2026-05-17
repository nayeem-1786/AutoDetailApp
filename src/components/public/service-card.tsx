import Link from 'next/link';
import Image from 'next/image';
import { Clock, Car, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils/format';
import { resolveServicePriceWithSale } from '@/lib/services/picker-engine';
import { CUSTOMER_SELF_SERVICE_SIZE_CLASSES } from '@/lib/utils/constants';
import type { Service, ServicePricing } from '@/lib/supabase/types';

interface ServiceCardProps {
  service: Service;
  categorySlug: string;
}

interface PriceDisplay {
  text: string;
  wasText?: string;
  isOnSale: boolean;
}

/**
 * Item 15f Layer 4 — public service-card "From $X" display.
 *
 * Rewritten as a thin dispatcher over `resolveServicePriceWithSale` from
 * the canonical engine per CLAUDE.md Rule 22. The pre-Layer-4 version had
 * the same drift bugs Layer 3d fixed in `service-resolver.ts`:
 *   - `vehicle_size` "From X" min was computed only over sedan/truck/van
 *     columns (exotic/classic prices missing from the floor).
 *   - Inline sale-price comparison against the base `tier.price` ignored
 *     the per-size column for vehicle_size_aware tiers.
 *   - Direct `vehicle_size_*_price` reads outside the engine (Rule 22
 *     violation).
 *
 * Behavior preserved: customer-facing "From X" floor uses the 3 self-
 * service size classes (sedan / truck_suv_2row / suv_3row_van) per
 * `CUSTOMER_SELF_SERVICE_SIZE_CLASSES` — exotic/classic remain gated to
 * staff-quoted paths per the booking-wizard pattern. Engine handles the
 * sale-price comparison correctly at the per-size column level.
 *
 * Synthesizes a `ServicePricing` row for `flat` / `per_unit` / `custom`
 * (no row in `service_pricing`) — same pattern as `service-resolver.ts`.
 */
function getStartingPrice(service: Service): PriceDisplay {
  const saleWindow = {
    sale_starts_at: service.sale_starts_at,
    sale_ends_at: service.sale_ends_at,
  };
  const tiers = service.pricing ?? [];

  // Synthesize a one-off `ServicePricing` for services without rows
  // (flat / per_unit). The engine consumes a single row + size class.
  function synthesize(price: number, salePrice: number | null): ServicePricing {
    return {
      id: `synthetic-${service.id}`,
      service_id: service.id,
      tier_name: 'synthetic',
      tier_label: null,
      price,
      sale_price: salePrice,
      display_order: 0,
      is_vehicle_size_aware: false,
      vehicle_size_sedan_price: null,
      vehicle_size_truck_suv_price: null,
      vehicle_size_suv_van_price: null,
      vehicle_size_exotic_price: null,
      vehicle_size_classic_price: null,
      max_qty: null,
      qty_label: null,
      created_at: '',
    };
  }

  // Compute the "From X" floor across the 3 customer-facing size classes
  // for a vehicle_size_aware tier — engine handles per-column dispatch
  // + per-column sale_price comparison. Returns { current, original,
  // isOnSale } where current = min effective, original = min standard.
  function fromFloorAcrossCustomerSizes(tier: ServicePricing) {
    let minCurrent = Infinity;
    let minOriginal = Infinity;
    let anyOnSale = false;
    for (const sc of CUSTOMER_SELF_SERVICE_SIZE_CLASSES) {
      const r = resolveServicePriceWithSale(tier, sc, saleWindow);
      if (r.effectivePrice < minCurrent) minCurrent = r.effectivePrice;
      if (r.standardPrice < minOriginal) minOriginal = r.standardPrice;
      if (r.isOnSale) anyOnSale = true;
    }
    return {
      current: Number.isFinite(minCurrent) ? minCurrent : tier.price,
      original: Number.isFinite(minOriginal) ? minOriginal : tier.price,
      isOnSale: anyOnSale,
    };
  }

  switch (service.pricing_model) {
    case 'vehicle_size': {
      if (tiers.length === 0) return { text: 'Contact for pricing', isOnSale: false };
      // Row-pattern: each tier IS a size class; iterate tiers + take min
      // effective via engine. Column-pattern: single tier with per-size
      // columns; iterate customer sizes + take min via engine.
      const tier = tiers[0];
      if (tier.is_vehicle_size_aware) {
        const floor = fromFloorAcrossCustomerSizes(tier);
        if (floor.isOnSale && floor.original !== floor.current) {
          return {
            text: `From ${formatCurrency(floor.current)}`,
            wasText: `From ${formatCurrency(floor.original)}`,
            isOnSale: true,
          };
        }
        return { text: `From ${formatCurrency(floor.current)}`, isOnSale: false };
      }
      // Row-pattern: iterate tiers (each is a size_class row).
      let minCurrent = Infinity;
      let minOriginal = Infinity;
      let anyOnSale = false;
      for (const t of tiers) {
        const r = resolveServicePriceWithSale(t, null, saleWindow);
        if (r.effectivePrice < minCurrent) minCurrent = r.effectivePrice;
        if (r.standardPrice < minOriginal) minOriginal = r.standardPrice;
        if (r.isOnSale) anyOnSale = true;
      }
      if (!Number.isFinite(minCurrent)) {
        return { text: 'Contact for pricing', isOnSale: false };
      }
      if (anyOnSale && minOriginal !== minCurrent) {
        return {
          text: `From ${formatCurrency(minCurrent)}`,
          wasText: `From ${formatCurrency(minOriginal)}`,
          isOnSale: true,
        };
      }
      return { text: `From ${formatCurrency(minCurrent)}`, isOnSale: false };
    }
    case 'scope':
    case 'specialty': {
      if (tiers.length === 0) return { text: 'Contact for pricing', isOnSale: false };
      // Find the tier with the lowest effective price via engine.
      let minCurrent = Infinity;
      let minOriginal = Infinity;
      let anyOnSale = false;
      for (const t of tiers) {
        // For vehicle_size_aware scope tiers, take the floor across
        // customer sizes (the engine's per-column dispatch).
        if (t.is_vehicle_size_aware) {
          const floor = fromFloorAcrossCustomerSizes(t);
          if (floor.current < minCurrent) minCurrent = floor.current;
          if (floor.original < minOriginal) minOriginal = floor.original;
          if (floor.isOnSale) anyOnSale = true;
        } else {
          const r = resolveServicePriceWithSale(t, null, saleWindow);
          if (r.effectivePrice < minCurrent) minCurrent = r.effectivePrice;
          if (r.standardPrice < minOriginal) minOriginal = r.standardPrice;
          if (r.isOnSale) anyOnSale = true;
        }
      }
      if (!Number.isFinite(minCurrent)) {
        return { text: 'Contact for pricing', isOnSale: false };
      }
      if (anyOnSale && minOriginal !== minCurrent) {
        return {
          text: `From ${formatCurrency(minCurrent)}`,
          wasText: `From ${formatCurrency(minOriginal)}`,
          isOnSale: true,
        };
      }
      return { text: `From ${formatCurrency(minCurrent)}`, isOnSale: false };
    }
    case 'per_unit': {
      if (service.per_unit_price == null) {
        return { text: 'Contact for pricing', isOnSale: false };
      }
      const label = service.per_unit_label ?? 'unit';
      const r = resolveServicePriceWithSale(
        synthesize(service.per_unit_price, service.sale_price ?? null),
        null,
        saleWindow,
      );
      if (r.isOnSale) {
        return {
          text: `${formatCurrency(r.effectivePrice)}/${label}`,
          wasText: `${formatCurrency(r.standardPrice)}/${label}`,
          isOnSale: true,
        };
      }
      return { text: `${formatCurrency(r.effectivePrice)}/${label}`, isOnSale: false };
    }
    case 'flat': {
      if (service.flat_price == null) {
        return { text: 'Contact for pricing', isOnSale: false };
      }
      const r = resolveServicePriceWithSale(
        synthesize(service.flat_price, service.sale_price ?? null),
        null,
        saleWindow,
      );
      if (r.isOnSale) {
        return {
          text: formatCurrency(r.effectivePrice),
          wasText: formatCurrency(r.standardPrice),
          isOnSale: true,
        };
      }
      return { text: formatCurrency(r.effectivePrice), isOnSale: false };
    }
    case 'custom': {
      // Custom services surface `custom_starting_price` as a reference.
      // No sale logic (operator-assessed).
      if (service.custom_starting_price != null) {
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

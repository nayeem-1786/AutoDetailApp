import { formatCurrency } from '@/lib/utils/format';
import { getSaleStatus, getTierSaleInfo, hasAnySalePrice, getSaleEndDescription, isEndingSoon } from '@/lib/utils/sale-pricing';
import { MessageSquare, Clock } from 'lucide-react';
import type { Service, ServicePricing } from '@/lib/supabase/types';

interface ServicePricingDisplayProps {
  service: Service;
}

export function ServicePricingDisplay({ service }: ServicePricingDisplayProps) {
  switch (service.pricing_model) {
    case 'vehicle_size':
      return <VehicleSizePricing service={service} />;
    case 'scope':
      return <ScopePricing service={service} />;
    case 'per_unit':
      return <PerUnitPricing service={service} />;
    case 'specialty':
      return <SpecialtyPricing service={service} />;
    case 'flat':
      return <FlatPricing service={service} />;
    case 'custom':
      return <CustomPricing service={service} />;
    default:
      return (
        <p className="text-sm text-site-text-muted">
          Contact us for pricing information.
        </p>
      );
  }
}

function SaleBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-bold text-white uppercase tracking-wide">
      Sale
    </span>
  );
}

function SaleCountdown({ endsAt }: { endsAt: Date | null }) {
  const desc = getSaleEndDescription(endsAt);
  if (!desc) return null;
  const urgent = isEndingSoon(endsAt);

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${urgent ? 'text-red-400' : 'text-site-text-muted'}`}>
      <Clock className="h-3 w-3" />
      {desc}
    </span>
  );
}

function VehicleSizePricing({ service }: { service: Service }) {
  const tiers = service.pricing
    ? [...service.pricing].sort((a, b) => a.display_order - b.display_order)
    : [];

  if (tiers.length === 0) {
    return <p className="text-sm text-site-text-muted">Contact us for pricing.</p>;
  }

  const saleStatus = getSaleStatus(service);
  const showSale = saleStatus.isOnSale && hasAnySalePrice(tiers);

  return (
    <div className="space-y-2">
      {showSale && (
        <div className="flex items-center gap-3">
          <SaleBadge />
          <SaleCountdown endsAt={saleStatus.saleEndsAt} />
        </div>
      )}
      <div className="overflow-x-auto rounded-2xl bg-brand-surface shadow-sm border border-site-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-site-border">
              {tiers.map((tier) => (
                <th key={tier.id} className="px-4 py-3 text-left font-display font-semibold text-site-text">
                  {tier.tier_label ?? tier.tier_name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {tiers.map((tier) => {
                const saleInfo = getTierSaleInfo(tier.price, tier.sale_price, saleStatus.isOnSale);
                if (saleInfo?.isDiscounted) {
                  return (
                    <td key={tier.id} className="px-4 py-4">
                      <span className="text-sm text-site-text-muted line-through">
                        {formatCurrency(saleInfo.originalPrice)}
                      </span>
                      <span className="ml-2 font-bold text-accent-brand text-base">
                        {formatCurrency(saleInfo.currentPrice)}
                      </span>
                    </td>
                  );
                }
                return (
                  <td key={tier.id} className="px-4 py-4 font-bold text-accent-brand text-base">
                    {formatCurrency(tier.price)}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScopePricing({ service }: { service: Service }) {
  const tiers = service.pricing
    ? [...service.pricing].sort((a, b) => a.display_order - b.display_order)
    : [];

  if (tiers.length === 0) {
    return <p className="text-sm text-site-text-muted">Contact us for pricing.</p>;
  }

  const saleStatus = getSaleStatus(service);
  const showSale = saleStatus.isOnSale && hasAnySalePrice(tiers);

  return (
    <div className="space-y-2">
      {showSale && (
        <div className="flex items-center gap-3">
          <SaleBadge />
          <SaleCountdown endsAt={saleStatus.saleEndsAt} />
        </div>
      )}
      <div className="overflow-x-auto rounded-2xl bg-brand-surface shadow-sm border border-site-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-site-border">
              <th className="px-4 py-3 text-left font-display font-semibold text-site-text">
                Option
              </th>
              <th className="px-4 py-3 text-right font-display font-semibold text-site-text">
                Price
              </th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier, index) => (
              <ScopeTierRow key={tier.id} tier={tier} index={index} isOnSale={saleStatus.isOnSale} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScopeTierRow({ tier, index, isOnSale }: { tier: ServicePricing; index: number; isOnSale: boolean }) {
  const rowBg = index % 2 === 1 ? 'bg-white/[0.02]' : '';
  const saleInfo = getTierSaleInfo(tier.price, tier.sale_price, isOnSale);

  if (tier.is_vehicle_size_aware) {
    return (
      <>
        <tr className={rowBg}>
          <td
            colSpan={2}
            className="px-4 pt-3 pb-1 font-display font-medium text-site-text"
          >
            {tier.tier_label ?? tier.tier_name}
          </td>
        </tr>
        <tr className={rowBg}>
          <td className="px-4 py-1 pl-8 text-site-text-muted">Sedan</td>
          <td className="px-4 py-1 text-right font-bold text-accent-brand">
            {tier.vehicle_size_sedan_price !== null
              ? formatCurrency(tier.vehicle_size_sedan_price)
              : '--'}
          </td>
        </tr>
        <tr className={rowBg}>
          <td className="px-4 py-1 pl-8 text-site-text-muted">Truck / SUV</td>
          <td className="px-4 py-1 text-right font-bold text-accent-brand">
            {tier.vehicle_size_truck_suv_price !== null
              ? formatCurrency(tier.vehicle_size_truck_suv_price)
              : '--'}
          </td>
        </tr>
        <tr className={rowBg}>
          <td className="px-4 pb-3 py-1 pl-8 text-site-text-muted">SUV / Van</td>
          <td className="px-4 pb-3 py-1 text-right font-bold text-accent-brand">
            {tier.vehicle_size_suv_van_price !== null
              ? formatCurrency(tier.vehicle_size_suv_van_price)
              : '--'}
          </td>
        </tr>
      </>
    );
  }

  return (
    <tr className={rowBg}>
      <td className="px-4 py-3 text-site-text-secondary">
        {tier.tier_label ?? tier.tier_name}
      </td>
      <td className="px-4 py-3 text-right">
        {saleInfo?.isDiscounted ? (
          <>
            <span className="text-sm text-site-text-muted line-through mr-2">
              {formatCurrency(saleInfo.originalPrice)}
            </span>
            <span className="font-bold text-accent-brand">
              {formatCurrency(saleInfo.currentPrice)}
            </span>
          </>
        ) : (
          <span className="font-bold text-accent-brand">
            {formatCurrency(tier.price)}
          </span>
        )}
      </td>
    </tr>
  );
}

function PerUnitPricing({ service }: { service: Service }) {
  return (
    <div className="space-y-2">
      <p className="font-display text-2xl font-bold text-accent-brand">
        {service.per_unit_price !== null
          ? formatCurrency(service.per_unit_price)
          : '--'}{' '}
        <span className="text-base font-normal text-site-text-muted">
          per {service.per_unit_label ?? 'unit'}
        </span>
      </p>
      {service.per_unit_max !== null && (
        <p className="text-sm text-site-text-muted">
          Maximum {service.per_unit_max} {service.per_unit_label ?? 'units'}
        </p>
      )}
    </div>
  );
}

function SpecialtyPricing({ service }: { service: Service }) {
  const tiers = service.pricing
    ? [...service.pricing].sort((a, b) => a.display_order - b.display_order)
    : [];

  if (tiers.length === 0) {
    return <p className="text-sm text-site-text-muted">Contact us for pricing.</p>;
  }

  const saleStatus = getSaleStatus(service);
  const showSale = saleStatus.isOnSale && hasAnySalePrice(tiers);

  return (
    <div className="space-y-2">
      {showSale && (
        <div className="flex items-center gap-3">
          <SaleBadge />
          <SaleCountdown endsAt={saleStatus.saleEndsAt} />
        </div>
      )}
      <div className="overflow-x-auto rounded-2xl bg-brand-surface shadow-sm border border-site-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-site-border">
              <th className="px-4 py-3 text-left font-display font-semibold text-site-text">
                Option
              </th>
              <th className="px-4 py-3 text-right font-display font-semibold text-site-text">
                Price
              </th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier, index) => {
              const saleInfo = getTierSaleInfo(tier.price, tier.sale_price, saleStatus.isOnSale);
              return (
                <tr key={tier.id} className={index % 2 === 1 ? 'bg-white/[0.02]' : ''}>
                  <td className="px-4 py-3 text-site-text-secondary">
                    {tier.tier_label ?? tier.tier_name}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {saleInfo?.isDiscounted ? (
                      <>
                        <span className="text-sm text-site-text-muted line-through mr-2">
                          {formatCurrency(saleInfo.originalPrice)}
                        </span>
                        <span className="font-bold text-accent-brand">
                          {formatCurrency(saleInfo.currentPrice)}
                        </span>
                      </>
                    ) : (
                      <span className="font-bold text-accent-brand">
                        {formatCurrency(tier.price)}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FlatPricing({ service }: { service: Service }) {
  return (
    <div>
      <p className="font-display text-3xl font-bold text-accent-brand">
        {service.flat_price !== null
          ? formatCurrency(service.flat_price)
          : '--'}
      </p>
    </div>
  );
}

function CustomPricing({ service }: { service: Service }) {
  return (
    <div className="space-y-2">
      <p className="font-display text-2xl font-bold text-accent-brand">
        {service.custom_starting_price !== null
          ? `Starting at ${formatCurrency(service.custom_starting_price)}`
          : 'Custom pricing'}
      </p>
      <p className="flex items-center gap-1.5 text-sm text-site-text-muted">
        <MessageSquare className="h-4 w-4" />
        Contact for exact quote
      </p>
    </div>
  );
}

import { formatCurrency } from '@/lib/utils/format';
import { MessageSquare } from 'lucide-react';
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
        <p className="text-sm text-gray-400">
          Contact us for pricing information.
        </p>
      );
  }
}

function VehicleSizePricing({ service }: { service: Service }) {
  const tiers = service.pricing
    ? [...service.pricing].sort((a, b) => a.display_order - b.display_order)
    : [];

  if (tiers.length === 0) {
    return <p className="text-sm text-gray-400">Contact us for pricing.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl bg-brand-surface shadow-sm border border-white/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10">
            {tiers.map((tier) => (
              <th key={tier.id} className="px-4 py-3 text-left font-display font-semibold text-white">
                {tier.tier_label ?? tier.tier_name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {tiers.map((tier) => (
              <td key={tier.id} className="px-4 py-4 font-bold text-lime text-base">
                {formatCurrency(tier.price)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ScopePricing({ service }: { service: Service }) {
  const tiers = service.pricing
    ? [...service.pricing].sort((a, b) => a.display_order - b.display_order)
    : [];

  if (tiers.length === 0) {
    return <p className="text-sm text-gray-400">Contact us for pricing.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl bg-brand-surface shadow-sm border border-white/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10">
            <th className="px-4 py-3 text-left font-display font-semibold text-white">
              Option
            </th>
            <th className="px-4 py-3 text-right font-display font-semibold text-white">
              Price
            </th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((tier, index) => (
            <ScopeTierRow key={tier.id} tier={tier} index={index} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScopeTierRow({ tier, index }: { tier: ServicePricing; index: number }) {
  const rowBg = index % 2 === 1 ? 'bg-white/[0.02]' : '';

  if (tier.is_vehicle_size_aware) {
    return (
      <>
        <tr className={rowBg}>
          <td
            colSpan={2}
            className="px-4 pt-3 pb-1 font-display font-medium text-white"
          >
            {tier.tier_label ?? tier.tier_name}
          </td>
        </tr>
        <tr className={rowBg}>
          <td className="px-4 py-1 pl-8 text-gray-400">Sedan</td>
          <td className="px-4 py-1 text-right font-bold text-lime">
            {tier.vehicle_size_sedan_price !== null
              ? formatCurrency(tier.vehicle_size_sedan_price)
              : '--'}
          </td>
        </tr>
        <tr className={rowBg}>
          <td className="px-4 py-1 pl-8 text-gray-400">Truck / SUV</td>
          <td className="px-4 py-1 text-right font-bold text-lime">
            {tier.vehicle_size_truck_suv_price !== null
              ? formatCurrency(tier.vehicle_size_truck_suv_price)
              : '--'}
          </td>
        </tr>
        <tr className={rowBg}>
          <td className="px-4 pb-3 py-1 pl-8 text-gray-400">SUV / Van</td>
          <td className="px-4 pb-3 py-1 text-right font-bold text-lime">
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
      <td className="px-4 py-3 text-gray-300">
        {tier.tier_label ?? tier.tier_name}
      </td>
      <td className="px-4 py-3 text-right font-bold text-lime">
        {formatCurrency(tier.price)}
      </td>
    </tr>
  );
}

function PerUnitPricing({ service }: { service: Service }) {
  return (
    <div className="space-y-2">
      <p className="font-display text-2xl font-bold text-lime">
        {service.per_unit_price !== null
          ? formatCurrency(service.per_unit_price)
          : '--'}{' '}
        <span className="text-base font-normal text-gray-400">
          per {service.per_unit_label ?? 'unit'}
        </span>
      </p>
      {service.per_unit_max !== null && (
        <p className="text-sm text-gray-400">
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
    return <p className="text-sm text-gray-400">Contact us for pricing.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl bg-brand-surface shadow-sm border border-white/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10">
            <th className="px-4 py-3 text-left font-display font-semibold text-white">
              Option
            </th>
            <th className="px-4 py-3 text-right font-display font-semibold text-white">
              Price
            </th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((tier, index) => (
            <tr key={tier.id} className={index % 2 === 1 ? 'bg-white/[0.02]' : ''}>
              <td className="px-4 py-3 text-gray-300">
                {tier.tier_label ?? tier.tier_name}
              </td>
              <td className="px-4 py-3 text-right font-bold text-lime">
                {formatCurrency(tier.price)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FlatPricing({ service }: { service: Service }) {
  return (
    <div>
      <p className="font-display text-3xl font-bold text-lime">
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
      <p className="font-display text-2xl font-bold text-lime">
        {service.custom_starting_price !== null
          ? `Starting at ${formatCurrency(service.custom_starting_price)}`
          : 'Custom pricing'}
      </p>
      <p className="flex items-center gap-1.5 text-sm text-gray-400">
        <MessageSquare className="h-4 w-4" />
        Contact for exact quote
      </p>
    </div>
  );
}

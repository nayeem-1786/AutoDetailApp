'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Clock, Truck, ChevronRight } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type { BookableCategory, BookableService } from '@/lib/data/booking';

interface StepServiceSelectProps {
  categories: BookableCategory[];
  selectedServiceId: string | null;
  onSelect: (service: BookableService) => void;
}

export function StepServiceSelect({
  categories,
  selectedServiceId,
  onSelect,
}: StepServiceSelectProps) {
  const [activeCategory, setActiveCategory] = useState(
    () => {
      // If a service is pre-selected, default to its category
      if (selectedServiceId) {
        const cat = categories.find((c) =>
          c.services.some((s) => s.id === selectedServiceId)
        );
        if (cat) return cat.category.id;
      }
      return categories[0]?.category.id ?? '';
    }
  );

  return (
    <div>
      <h2 className="text-xl font-semibold text-site-text">
        Select a Service
      </h2>
      <p className="mt-1 text-sm text-site-text-secondary">
        Choose the detailing service you&apos;d like to book.
      </p>

      <Tabs
        value={activeCategory}
        onValueChange={setActiveCategory}
        className="mt-6"
      >
        <TabsList className="flex-wrap bg-brand-surface dark:bg-brand-surface">
          {categories.map((cat) => (
            <TabsTrigger
              key={cat.category.id}
              value={cat.category.id}
              className="data-[state=active]:bg-brand-grey data-[state=active]:text-site-text data-[state=active]:shadow-none text-site-text-muted hover:text-site-text dark:data-[state=active]:bg-brand-grey dark:data-[state=active]:text-site-text dark:text-site-text-muted dark:hover:text-site-text"
            >
              {cat.category.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {categories.map((cat) => (
          <TabsContent key={cat.category.id} value={cat.category.id}>
            <div className="grid gap-3 sm:grid-cols-2">
              {cat.services.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  isSelected={service.id === selectedServiceId}
                  onSelect={() => onSelect(service)}
                />
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function ServiceCard({
  service,
  isSelected,
  onSelect,
}: {
  service: BookableService;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const priceLabel = getStartingPrice(service);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex items-center justify-between rounded-lg border p-4 text-left transition-all hover:shadow-sm',
        isSelected
          ? 'border-lime bg-brand-surface ring-1 ring-lime'
          : 'border-site-border hover:border-site-border-medium'
      )}
    >
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-site-text">{service.name}</h3>
        {service.description && (
          <p className="mt-1 text-xs text-site-text-muted line-clamp-2">
            {service.description}
          </p>
        )}
        <div className="mt-2 flex items-center gap-3 text-xs text-site-text-muted">
          {service.base_duration_minutes > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {service.base_duration_minutes >= 60
                ? `${Math.floor(service.base_duration_minutes / 60)}h${service.base_duration_minutes % 60 > 0 ? ` ${service.base_duration_minutes % 60}m` : ''}`
                : `${service.base_duration_minutes}m`}
            </span>
          )}
          {service.mobile_eligible && (
            <span className="flex items-center gap-1">
              <Truck className="h-3.5 w-3.5" />
              Mobile
            </span>
          )}
        </div>
        {priceLabel && (
          <p className="mt-1.5 text-sm font-medium text-site-text">
            {priceLabel}
          </p>
        )}
      </div>
      <ChevronRight className="ml-3 h-5 w-5 flex-shrink-0 text-site-text-muted" />
    </button>
  );
}

function getStartingPrice(service: BookableService): string | null {
  switch (service.pricing_model) {
    case 'flat':
      return service.flat_price != null
        ? formatCurrency(service.flat_price)
        : null;

    case 'vehicle_size':
    case 'scope':
    case 'specialty': {
      const tiers = service.service_pricing;
      if (tiers.length === 0) return null;
      // Find lowest price across all tiers
      let min = Infinity;
      for (const tier of tiers) {
        if (tier.price < min) min = tier.price;
        if (tier.is_vehicle_size_aware) {
          if (tier.vehicle_size_sedan_price != null && tier.vehicle_size_sedan_price < min) {
            min = tier.vehicle_size_sedan_price;
          }
        }
      }
      return min < Infinity ? `From ${formatCurrency(min)}` : null;
    }

    case 'per_unit':
      return service.per_unit_price != null
        ? `${formatCurrency(service.per_unit_price)} / ${service.per_unit_label || 'unit'}`
        : null;

    case 'custom':
      return service.custom_starting_price != null
        ? `From ${formatCurrency(service.custom_starting_price)}`
        : null;

    default:
      return null;
  }
}

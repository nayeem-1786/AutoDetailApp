'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Sparkles, X } from 'lucide-react';
import { useTicket } from '../context/ticket-context';
import { useCatalog } from '../hooks/use-catalog';
import { useAddonSuggestions, type AddonSuggestionEntry } from '../hooks/use-addon-suggestions';
import { ServiceDetailDialog } from './service-detail-dialog';
import type { CatalogService } from '../types';

/**
 * Displays add-on suggestions in the ticket panel when a service with
 * configured add-ons is on the ticket. Non-blocking, dismissible.
 */
export function AddonSuggestions() {
  const { ticket } = useTicket();
  const { services } = useCatalog();
  const { suggestionsMap, loading } = useAddonSuggestions();

  const [dismissed, setDismissed] = useState(false);
  const [pickerService, setPickerService] = useState<CatalogService | null>(null);

  // Track the set of service IDs that were on the ticket last time suggestions were shown,
  // so we can reset dismissed state when new services are added
  const prevServiceIdsRef = useRef<string>('');

  // Service IDs currently on the ticket
  const ticketServiceIds = useMemo(
    () => new Set(ticket.items.filter((i) => i.serviceId).map((i) => i.serviceId!)),
    [ticket.items]
  );

  const ticketServiceIdsKey = Array.from(ticketServiceIds).sort().join(',');

  // Reset dismissed state when ticket services change (new service added)
  useEffect(() => {
    if (prevServiceIdsRef.current !== ticketServiceIdsKey) {
      // Only reset if new services were added (not just removed)
      const prevIds = new Set(prevServiceIdsRef.current.split(',').filter(Boolean));
      const currentIds = ticketServiceIds;
      const hasNewService = Array.from(currentIds).some((id) => !prevIds.has(id));
      if (hasNewService) {
        setDismissed(false);
      }
      prevServiceIdsRef.current = ticketServiceIdsKey;
    }
  }, [ticketServiceIdsKey, ticketServiceIds]);

  // Compute suggestions: for each service on the ticket, look up its add-ons,
  // filter out ones already on the ticket, and deduplicate
  const suggestions = useMemo(() => {
    if (loading || suggestionsMap.size === 0 || ticketServiceIds.size === 0) {
      return [];
    }

    const seen = new Set<string>();
    const result: AddonSuggestionEntry[] = [];

    for (const serviceId of ticketServiceIds) {
      const addons = suggestionsMap.get(serviceId);
      if (!addons) continue;

      for (const addon of addons) {
        // Skip if already on the ticket
        if (ticketServiceIds.has(addon.addonServiceId)) continue;
        // Skip duplicates (same add-on suggested by multiple primary services)
        if (seen.has(addon.addonServiceId)) continue;
        seen.add(addon.addonServiceId);
        result.push(addon);
      }
    }

    // Sort by display order
    result.sort((a, b) => a.displayOrder - b.displayOrder);
    return result;
  }, [loading, suggestionsMap, ticketServiceIds]);

  if (dismissed || suggestions.length === 0) {
    return null;
  }

  function handleChipClick(addon: AddonSuggestionEntry) {
    // Find the full CatalogService for this addon so we can open the pricing picker
    const service = services.find((s) => s.id === addon.addonServiceId);
    if (!service) return;
    setPickerService(service);
  }

  return (
    <>
      <div className="mx-4 mb-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
        {/* Header row */}
        <div className="mb-1.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-xs font-medium text-blue-700">Suggested Add-Ons</span>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="flex h-6 w-6 items-center justify-center rounded text-blue-400 hover:bg-blue-100 hover:text-blue-600"
            aria-label="Dismiss suggestions"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Suggestion chips */}
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((addon) => (
            <button
              key={addon.addonServiceId}
              onClick={() => handleChipClick(addon)}
              className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-100 active:scale-[0.98]"
            >
              <span className="max-w-[140px] truncate">{addon.addonServiceName}</span>
              {addon.comboPrice != null && (
                <span className="whitespace-nowrap text-blue-500">
                  ${addon.comboPrice.toFixed(0)}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Service detail dialog for adding the selected add-on */}
      {pickerService && (
        <ServiceDetailDialog
          service={pickerService}
          open={!!pickerService}
          onClose={() => setPickerService(null)}
        />
      )}
    </>
  );
}

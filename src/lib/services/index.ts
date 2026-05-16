/**
 * Item 15f Layer 1 — Public surface for the canonical service-picker
 * engine + hook. Per CLAUDE.md Rule 22, all service-pricing math must
 * import from this module (or its sub-paths).
 *
 * Existing files in `src/lib/services/` (audit, shippo, messaging-ai,
 * etc.) are imported via their direct sub-paths and are NOT re-exported
 * here. This barrel deliberately scopes to the picker-engine surface.
 */

export {
  resolveServicePrice,
  resolveServicePriceWithSale,
  getServicePriceRange,
  routeServiceTap,
} from './picker-engine';

export type {
  ServiceTapRoute,
  ResolvedPrice,
} from './picker-engine';

export { useServicePicker } from './use-service-picker';

export type {
  ServicePickerOptions,
  ServicePickerSurface,
} from './use-service-picker';

// Item 15f Layer 2 — `custom` pricing_model UX.
export { CustomPriceDialog, buildCustomPricing } from './custom-price-dialog';
export type { CustomPriceDialogProps } from './custom-price-dialog';

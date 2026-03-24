import type { ComponentType } from 'react';
import type { VehicleSizeClass } from '@/lib/supabase/types';
import type { SilhouetteProps } from './types';
import { SedanExterior } from './sedan-exterior';
import { SuvExterior } from './suv-exterior';
import { VanExterior } from './van-exterior';
import { SedanInterior } from './sedan-interior';
import { SuvInterior } from './suv-interior';
import { VanInterior } from './van-interior';

export type { SilhouetteProps } from './types';

const EXTERIOR_MAP: Record<string, ComponentType<SilhouetteProps>> = {
  sedan: SedanExterior,
  truck_suv_2row: SuvExterior,
  suv_3row_van: VanExterior,
};

const INTERIOR_MAP: Record<string, ComponentType<SilhouetteProps>> = {
  sedan: SedanInterior,
  truck_suv_2row: SuvInterior,
  suv_3row_van: VanInterior,
};

/**
 * Get the correct exterior silhouette component for a vehicle size class.
 * Falls back to sedan if size_class is unknown or null.
 */
export function getExteriorSilhouette(
  sizeClass: VehicleSizeClass | string | null | undefined
): ComponentType<SilhouetteProps> {
  return (sizeClass && EXTERIOR_MAP[sizeClass]) || SedanExterior;
}

/**
 * Get the correct interior silhouette component for a vehicle size class.
 * Falls back to sedan if size_class is unknown or null.
 */
export function getInteriorSilhouette(
  sizeClass: VehicleSizeClass | string | null | undefined
): ComponentType<SilhouetteProps> {
  return (sizeClass && INTERIOR_MAP[sizeClass]) || SedanInterior;
}

// Zone system for job photo documentation
// Used by zone picker, photo capture, and gallery components

export interface ZoneDefinition {
  key: string;
  label: string;
  description: string;
  group: 'exterior' | 'interior';
}

export const EXTERIOR_ZONES: ZoneDefinition[] = [
  { key: 'exterior_front', label: 'Front', description: 'Front bumper, grille, headlights', group: 'exterior' },
  { key: 'exterior_rear', label: 'Rear', description: 'Rear bumper, taillights, exhaust area', group: 'exterior' },
  { key: 'exterior_driver_side', label: 'Driver Side', description: 'Full driver side profile', group: 'exterior' },
  { key: 'exterior_passenger_side', label: 'Passenger Side', description: 'Full passenger side profile', group: 'exterior' },
  { key: 'exterior_hood', label: 'Hood', description: 'Hood surface, common for paint issues', group: 'exterior' },
  { key: 'exterior_roof', label: 'Roof', description: 'Roof panel, often neglected', group: 'exterior' },
  { key: 'exterior_trunk', label: 'Trunk/Tailgate', description: 'Trunk lid or tailgate', group: 'exterior' },
  { key: 'exterior_wheels', label: 'Wheels & Tires', description: 'All wheels, tire condition, brake dust', group: 'exterior' },
];

export const INTERIOR_ZONES: ZoneDefinition[] = [
  { key: 'interior_dashboard', label: 'Dashboard', description: 'Dash, instrument cluster, vents', group: 'interior' },
  { key: 'interior_console', label: 'Center Console', description: 'Shifter, cup holders, armrest', group: 'interior' },
  { key: 'interior_seats_front', label: 'Front Seats', description: 'Driver and passenger seats', group: 'interior' },
  { key: 'interior_seats_rear', label: 'Rear Seats', description: 'Back seat area', group: 'interior' },
  { key: 'interior_carpet', label: 'Carpet/Floor', description: 'Floor mats, carpet, pedal area', group: 'interior' },
  { key: 'interior_door_panels', label: 'Door Panels', description: 'All 4 door interiors', group: 'interior' },
  { key: 'interior_trunk_cargo', label: 'Trunk/Cargo', description: 'Trunk liner, cargo area', group: 'interior' },
];

export const ALL_ZONES: ZoneDefinition[] = [...EXTERIOR_ZONES, ...INTERIOR_ZONES];

export function getZoneByKey(key: string): ZoneDefinition | undefined {
  return ALL_ZONES.find((z) => z.key === key);
}

export function getZoneLabel(key: string): string {
  return getZoneByKey(key)?.label ?? key;
}

export function getZoneGroup(key: string): 'exterior' | 'interior' {
  return key.startsWith('interior_') ? 'interior' : 'exterior';
}

/** Count unique zones that have at least 1 photo */
export function countCoveredZones(
  photoCounts: Record<string, number>,
  group: 'exterior' | 'interior'
): number {
  const zones = group === 'exterior' ? EXTERIOR_ZONES : INTERIOR_ZONES;
  return zones.filter((z) => (photoCounts[z.key] ?? 0) > 0).length;
}

// Annotation types stored in job_photos.annotation_data
export interface CircleAnnotation {
  type: 'circle';
  x: number; // percentage 0-100
  y: number;
  radius: number; // percentage of image width
  color: string;
}

export interface ArrowAnnotation {
  type: 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}

export interface TextAnnotation {
  type: 'text';
  x: number;
  y: number;
  label: string;
  color: string;
}

export type Annotation = CircleAnnotation | ArrowAnnotation | TextAnnotation;

export const DEFAULT_ANNOTATION_COLOR = '#FF0000';

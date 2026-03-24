// Shared types for vehicle silhouette SVG components

export interface SilhouetteProps {
  photoCounts: Record<string, number>;
  onZoneTap: (zone: string) => void;
}

/** Returns fill color based on whether zone has photos */
export function zoneColor(photoCounts: Record<string, number>, key: string): string {
  return (photoCounts[key] ?? 0) > 0 ? '#dcfce7' : '#fee2e2';
}

/** Returns stroke color based on whether zone has photos */
export function zoneBorder(photoCounts: Record<string, number>, key: string): string {
  return (photoCounts[key] ?? 0) > 0 ? '#16a34a' : '#dc2626';
}

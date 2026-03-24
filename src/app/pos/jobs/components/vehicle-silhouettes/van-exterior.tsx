import { EXTERIOR_ZONES } from '@/lib/utils/job-zones';
import { SilhouetteProps, zoneColor, zoneBorder } from './types';

/**
 * Van / 3-Row SUV exterior silhouette — top-down view
 * Tallest, boxiest profile with extended rear section
 */
export function VanExterior({ photoCounts, onZoneTap }: SilhouetteProps) {
  const zc = (key: string) => zoneColor(photoCounts, key);
  const zb = (key: string) => zoneBorder(photoCounts, key);

  return (
    <svg viewBox="0 0 300 520" className="mx-auto w-full max-w-[260px]">
      {/* Vehicle body outline — van/large SUV top-down silhouette (widest, longest) */}
      <path
        d="M 95 50 Q 95 20 150 10 Q 205 20 205 50
           L 215 90 L 218 150
           Q 220 165 220 180
           L 222 240 L 222 340
           L 220 400 Q 220 415 218 425
           L 215 460 L 205 480
           Q 205 505 150 510 Q 95 505 95 480
           L 85 460 L 82 425
           Q 80 415 80 400
           L 78 340 L 78 240
           Q 80 165 80 180
           L 82 150 L 85 90 Z"
        fill="none"
        stroke="#9ca3af"
        strokeWidth="2"
      />

      {/* Roof rails — extended for van length */}
      <line x1="82" y1="185" x2="82" y2="395" stroke="#d1d5db" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="218" y1="185" x2="218" y2="395" stroke="#d1d5db" strokeWidth="2.5" strokeLinecap="round" />

      {/* Side mirrors */}
      <path d="M 62 185 Q 52 180 52 185 Q 52 195 62 195 Z" fill="none" stroke="#9ca3af" strokeWidth="1.5" />
      <path d="M 238 185 Q 248 180 248 185 Q 248 195 238 195 Z" fill="none" stroke="#9ca3af" strokeWidth="1.5" />

      {/* Windshield — van style (more upright) */}
      <path
        d="M 93 148 Q 150 135 207 148 L 205 175 Q 150 165 95 175 Z"
        fill="#e5e7eb" stroke="#d1d5db" strokeWidth="1"
      />

      {/* Rear window — smaller on van */}
      <path
        d="M 95 405 Q 150 398 205 405 L 207 425 Q 150 432 93 425 Z"
        fill="#e5e7eb" stroke="#d1d5db" strokeWidth="1"
      />

      {/* Sliding door seam lines (van-specific) */}
      <line x1="80" y1="230" x2="80" y2="370" stroke="#d1d5db" strokeWidth="0.5" strokeDasharray="4,3" />
      <line x1="220" y1="230" x2="220" y2="370" stroke="#d1d5db" strokeWidth="0.5" strokeDasharray="4,3" />

      {/* Wheel arches — larger */}
      <ellipse cx="95" cy="115" rx="22" ry="14" fill="none" stroke="#d1d5db" strokeWidth="1" />
      <ellipse cx="205" cy="115" rx="22" ry="14" fill="none" stroke="#d1d5db" strokeWidth="1" />
      <ellipse cx="95" cy="440" rx="22" ry="14" fill="none" stroke="#d1d5db" strokeWidth="1" />
      <ellipse cx="205" cy="440" rx="22" ry="14" fill="none" stroke="#d1d5db" strokeWidth="1" />

      {/* ─── Tappable Zone Hotspots ─── */}

      {/* Front */}
      <path
        d="M 100 13 Q 150 3 200 13 L 210 55 L 90 55 Z"
        fill={zc('exterior_front')} stroke={zb('exterior_front')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('exterior_front')}
      />
      <text x="150" y="42" textAnchor="middle" fontSize="10" fill="#374151" fontWeight="500">Front</text>

      {/* Hood */}
      <path
        d="M 90 58 L 210 58 L 215 143 Q 150 130 85 143 Z"
        fill={zc('exterior_hood')} stroke={zb('exterior_hood')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('exterior_hood')}
      />
      <text x="150" y="108" textAnchor="middle" fontSize="11" fill="#374151" fontWeight="500">Hood</text>

      {/* Roof — larger area for van */}
      <path
        d="M 87 178 Q 150 168 213 178 L 215 290 L 213 395 Q 150 385 87 395 L 85 290 Z"
        fill={zc('exterior_roof')} stroke={zb('exterior_roof')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('exterior_roof')}
      />
      <text x="150" y="290" textAnchor="middle" fontSize="11" fill="#374151" fontWeight="500">Roof</text>

      {/* Driver Side */}
      <rect
        x="18" y="140" width="55" height="280"
        rx="6" fill={zc('exterior_driver_side')} stroke={zb('exterior_driver_side')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('exterior_driver_side')}
      />
      <text x="45" y="280" textAnchor="middle" fontSize="9" fill="#374151" fontWeight="500"
        transform="rotate(-90, 45, 280)">Driver Side</text>

      {/* Passenger Side */}
      <rect
        x="227" y="140" width="55" height="280"
        rx="6" fill={zc('exterior_passenger_side')} stroke={zb('exterior_passenger_side')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('exterior_passenger_side')}
      />
      <text x="255" y="280" textAnchor="middle" fontSize="9" fill="#374151" fontWeight="500"
        transform="rotate(90, 255, 280)">Passenger Side</text>

      {/* Trunk / Rear Door */}
      <path
        d="M 85 398 Q 150 388 215 398 L 210 455 L 90 455 Z"
        fill={zc('exterior_trunk')} stroke={zb('exterior_trunk')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('exterior_trunk')}
      />
      <text x="150" y="432" textAnchor="middle" fontSize="10" fill="#374151" fontWeight="500">Rear Door</text>

      {/* Rear */}
      <path
        d="M 90 458 L 210 458 L 203 485 Q 150 505 97 485 Z"
        fill={zc('exterior_rear')} stroke={zb('exterior_rear')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('exterior_rear')}
      />
      <text x="150" y="480" textAnchor="middle" fontSize="10" fill="#374151" fontWeight="500">Rear</text>

      {/* Wheels */}
      <g cursor="pointer" onClick={() => onZoneTap('exterior_wheels')}>
        <ellipse cx="95" cy="115" rx="20" ry="13"
          fill={zc('exterior_wheels')} stroke={zb('exterior_wheels')}
          strokeWidth="1.5" opacity="0.7"
        />
        <ellipse cx="205" cy="115" rx="20" ry="13"
          fill={zc('exterior_wheels')} stroke={zb('exterior_wheels')}
          strokeWidth="1.5" opacity="0.7"
        />
        <ellipse cx="95" cy="440" rx="20" ry="13"
          fill={zc('exterior_wheels')} stroke={zb('exterior_wheels')}
          strokeWidth="1.5" opacity="0.7"
        />
        <ellipse cx="205" cy="440" rx="20" ry="13"
          fill={zc('exterior_wheels')} stroke={zb('exterior_wheels')}
          strokeWidth="1.5" opacity="0.7"
        />
      </g>
      <text x="150" y="517" textAnchor="middle" fontSize="9" fill="#6b7280" fontWeight="500">Wheels (all 4)</text>

      {/* Photo count badges */}
      {EXTERIOR_ZONES.map((z) => {
        const count = photoCounts[z.key] ?? 0;
        if (count === 0) return null;
        const positions: Record<string, { x: number; y: number }> = {
          exterior_front: { x: 198, y: 22 },
          exterior_hood: { x: 205, y: 72 },
          exterior_roof: { x: 210, y: 190 },
          exterior_driver_side: { x: 58, y: 155 },
          exterior_passenger_side: { x: 270, y: 155 },
          exterior_trunk: { x: 210, y: 410 },
          exterior_rear: { x: 200, y: 470 },
          exterior_wheels: { x: 205, y: 128 },
        };
        const pos = positions[z.key];
        if (!pos) return null;
        return (
          <g key={z.key}>
            <circle cx={pos.x} cy={pos.y} r="10" fill="#2563eb" />
            <text x={pos.x} y={pos.y + 4} textAnchor="middle" fontSize="10" fill="white" fontWeight="bold">
              {count}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

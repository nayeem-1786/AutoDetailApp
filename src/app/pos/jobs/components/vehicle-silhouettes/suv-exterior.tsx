import { EXTERIOR_ZONES } from '@/lib/utils/job-zones';
import { SilhouetteProps, zoneColor, zoneBorder } from './types';

/**
 * SUV/Truck exterior silhouette — top-down view
 * Wider body, taller profile, boxier shape, roof rails
 */
export function SuvExterior({ photoCounts, onZoneTap }: SilhouetteProps) {
  const zc = (key: string) => zoneColor(photoCounts, key);
  const zb = (key: string) => zoneBorder(photoCounts, key);

  return (
    <svg viewBox="0 0 300 500" className="mx-auto w-full max-w-[260px]">
      {/* Vehicle body outline — SUV/truck top-down silhouette (wider, boxier) */}
      <path
        d="M 100 50 Q 100 22 150 12 Q 200 22 200 50
           L 208 85 L 212 140
           Q 215 155 215 170
           L 218 220 L 218 300
           L 215 350 Q 215 365 212 375
           L 208 420 L 200 455
           Q 200 478 150 488 Q 100 478 100 455
           L 92 420 L 88 375
           Q 85 365 85 350
           L 82 300 L 82 220
           Q 85 155 85 170
           L 88 140 L 92 85 Z"
        fill="none"
        stroke="#9ca3af"
        strokeWidth="2"
      />

      {/* Roof rails */}
      <line x1="88" y1="175" x2="88" y2="345" stroke="#d1d5db" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="212" y1="175" x2="212" y2="345" stroke="#d1d5db" strokeWidth="2.5" strokeLinecap="round" />

      {/* Side mirrors — larger for SUV */}
      <path d="M 68 180 Q 58 175 58 180 Q 58 188 68 188 Z" fill="none" stroke="#9ca3af" strokeWidth="1.5" />
      <path d="M 232 180 Q 242 175 242 180 Q 242 188 232 188 Z" fill="none" stroke="#9ca3af" strokeWidth="1.5" />

      {/* Windshield — wider */}
      <path
        d="M 98 140 Q 150 125 202 140 L 200 172 Q 150 160 100 172 Z"
        fill="#e5e7eb" stroke="#d1d5db" strokeWidth="1"
      />

      {/* Rear window — wider */}
      <path
        d="M 100 358 Q 150 348 200 358 L 202 385 Q 150 395 98 385 Z"
        fill="#e5e7eb" stroke="#d1d5db" strokeWidth="1"
      />

      {/* Wheel arches — larger */}
      <ellipse cx="98" cy="108" rx="22" ry="14" fill="none" stroke="#d1d5db" strokeWidth="1" />
      <ellipse cx="202" cy="108" rx="22" ry="14" fill="none" stroke="#d1d5db" strokeWidth="1" />
      <ellipse cx="98" cy="408" rx="22" ry="14" fill="none" stroke="#d1d5db" strokeWidth="1" />
      <ellipse cx="202" cy="408" rx="22" ry="14" fill="none" stroke="#d1d5db" strokeWidth="1" />

      {/* ─── Tappable Zone Hotspots ─── */}

      {/* Front */}
      <path
        d="M 105 15 Q 150 5 195 15 L 202 55 L 98 55 Z"
        fill={zc('exterior_front')} stroke={zb('exterior_front')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('exterior_front')}
      />
      <text x="150" y="42" textAnchor="middle" fontSize="10" fill="#374151" fontWeight="500">Front</text>

      {/* Hood */}
      <path
        d="M 98 58 L 202 58 L 210 135 Q 150 122 90 135 Z"
        fill={zc('exterior_hood')} stroke={zb('exterior_hood')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('exterior_hood')}
      />
      <text x="150" y="102" textAnchor="middle" fontSize="11" fill="#374151" fontWeight="500">Hood</text>

      {/* Roof */}
      <path
        d="M 92 175 Q 150 163 208 175 L 210 260 L 208 348 Q 150 336 92 348 L 90 260 Z"
        fill={zc('exterior_roof')} stroke={zb('exterior_roof')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('exterior_roof')}
      />
      <text x="150" y="265" textAnchor="middle" fontSize="11" fill="#374151" fontWeight="500">Roof</text>

      {/* Driver Side */}
      <rect
        x="25" y="135" width="55" height="250"
        rx="6" fill={zc('exterior_driver_side')} stroke={zb('exterior_driver_side')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('exterior_driver_side')}
      />
      <text x="52" y="260" textAnchor="middle" fontSize="9" fill="#374151" fontWeight="500"
        transform="rotate(-90, 52, 260)">Driver Side</text>

      {/* Passenger Side */}
      <rect
        x="220" y="135" width="55" height="250"
        rx="6" fill={zc('exterior_passenger_side')} stroke={zb('exterior_passenger_side')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('exterior_passenger_side')}
      />
      <text x="248" y="260" textAnchor="middle" fontSize="9" fill="#374151" fontWeight="500"
        transform="rotate(90, 248, 260)">Passenger Side</text>

      {/* Trunk / Tailgate */}
      <path
        d="M 90 388 Q 150 398 210 388 L 205 430 L 95 430 Z"
        fill={zc('exterior_trunk')} stroke={zb('exterior_trunk')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('exterior_trunk')}
      />
      <text x="150" y="415" textAnchor="middle" fontSize="10" fill="#374151" fontWeight="500">Tailgate</text>

      {/* Rear */}
      <path
        d="M 95 433 L 205 433 L 198 460 Q 150 482 102 460 Z"
        fill={zc('exterior_rear')} stroke={zb('exterior_rear')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('exterior_rear')}
      />
      <text x="150" y="458" textAnchor="middle" fontSize="10" fill="#374151" fontWeight="500">Rear</text>

      {/* Wheels */}
      <g cursor="pointer" onClick={() => onZoneTap('exterior_wheels')}>
        <ellipse cx="98" cy="108" rx="20" ry="13"
          fill={zc('exterior_wheels')} stroke={zb('exterior_wheels')}
          strokeWidth="1.5" opacity="0.7"
        />
        <ellipse cx="202" cy="108" rx="20" ry="13"
          fill={zc('exterior_wheels')} stroke={zb('exterior_wheels')}
          strokeWidth="1.5" opacity="0.7"
        />
        <ellipse cx="98" cy="408" rx="20" ry="13"
          fill={zc('exterior_wheels')} stroke={zb('exterior_wheels')}
          strokeWidth="1.5" opacity="0.7"
        />
        <ellipse cx="202" cy="408" rx="20" ry="13"
          fill={zc('exterior_wheels')} stroke={zb('exterior_wheels')}
          strokeWidth="1.5" opacity="0.7"
        />
      </g>
      <text x="150" y="497" textAnchor="middle" fontSize="9" fill="#6b7280" fontWeight="500">Wheels (all 4)</text>

      {/* Photo count badges */}
      {EXTERIOR_ZONES.map((z) => {
        const count = photoCounts[z.key] ?? 0;
        if (count === 0) return null;
        const positions: Record<string, { x: number; y: number }> = {
          exterior_front: { x: 192, y: 22 },
          exterior_hood: { x: 200, y: 72 },
          exterior_roof: { x: 205, y: 185 },
          exterior_driver_side: { x: 65, y: 150 },
          exterior_passenger_side: { x: 262, y: 150 },
          exterior_trunk: { x: 200, y: 400 },
          exterior_rear: { x: 195, y: 445 },
          exterior_wheels: { x: 202, y: 122 },
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

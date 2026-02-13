import { EXTERIOR_ZONES } from '@/lib/utils/job-zones';
import { SilhouetteProps, zoneColor, zoneBorder } from './types';

/**
 * Sedan exterior silhouette — top-down view
 * Compact body, defined trunk, lower roofline
 */
export function SedanExterior({ photoCounts, onZoneTap }: SilhouetteProps) {
  const zc = (key: string) => zoneColor(photoCounts, key);
  const zb = (key: string) => zoneBorder(photoCounts, key);

  return (
    <svg viewBox="0 0 300 500" className="mx-auto w-full max-w-[260px]">
      {/* Vehicle body outline — sedan top-down silhouette */}
      <path
        d="M 110 50 Q 110 25 150 15 Q 190 25 190 50
           L 195 80 L 200 130
           Q 205 145 205 160
           L 208 200 L 208 300
           L 205 340 Q 205 355 200 370
           L 195 420 L 190 450
           Q 190 475 150 485 Q 110 475 110 450
           L 105 420 L 100 370
           Q 95 355 95 340
           L 92 300 L 92 200
           Q 95 145 95 160
           L 100 130 L 105 80 Z"
        fill="none"
        stroke="#9ca3af"
        strokeWidth="2"
      />

      {/* Side mirrors */}
      <ellipse cx="78" cy="175" rx="12" ry="8" fill="none" stroke="#9ca3af" strokeWidth="1.5" />
      <ellipse cx="222" cy="175" rx="12" ry="8" fill="none" stroke="#9ca3af" strokeWidth="1.5" />

      {/* Windshield */}
      <path
        d="M 108 135 Q 150 120 192 135 L 190 165 Q 150 155 110 165 Z"
        fill="#e5e7eb" stroke="#d1d5db" strokeWidth="1"
      />

      {/* Rear window */}
      <path
        d="M 110 355 Q 150 345 190 355 L 192 380 Q 150 390 108 380 Z"
        fill="#e5e7eb" stroke="#d1d5db" strokeWidth="1"
      />

      {/* Wheel arches */}
      <ellipse cx="105" cy="105" rx="18" ry="12" fill="none" stroke="#d1d5db" strokeWidth="1" />
      <ellipse cx="195" cy="105" rx="18" ry="12" fill="none" stroke="#d1d5db" strokeWidth="1" />
      <ellipse cx="105" cy="400" rx="18" ry="12" fill="none" stroke="#d1d5db" strokeWidth="1" />
      <ellipse cx="195" cy="400" rx="18" ry="12" fill="none" stroke="#d1d5db" strokeWidth="1" />

      {/* ─── Tappable Zone Hotspots ─── */}

      {/* Front */}
      <path
        d="M 115 18 Q 150 10 185 18 L 190 55 L 110 55 Z"
        fill={zc('exterior_front')} stroke={zb('exterior_front')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('exterior_front')}
      />
      <text x="150" y="42" textAnchor="middle" fontSize="10" fill="#374151" fontWeight="500">Front</text>

      {/* Hood */}
      <path
        d="M 110 58 L 190 58 L 198 130 Q 150 120 102 130 Z"
        fill={zc('exterior_hood')} stroke={zb('exterior_hood')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('exterior_hood')}
      />
      <text x="150" y="100" textAnchor="middle" fontSize="11" fill="#374151" fontWeight="500">Hood</text>

      {/* Roof */}
      <path
        d="M 100 168 Q 150 158 200 168 L 202 260 L 200 335 Q 150 325 100 335 L 98 260 Z"
        fill={zc('exterior_roof')} stroke={zb('exterior_roof')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('exterior_roof')}
      />
      <text x="150" y="255" textAnchor="middle" fontSize="11" fill="#374151" fontWeight="500">Roof</text>

      {/* Driver Side */}
      <rect
        x="35" y="130" width="53" height="240"
        rx="6" fill={zc('exterior_driver_side')} stroke={zb('exterior_driver_side')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('exterior_driver_side')}
      />
      <text x="61" y="250" textAnchor="middle" fontSize="9" fill="#374151" fontWeight="500"
        transform="rotate(-90, 61, 250)">Driver Side</text>

      {/* Passenger Side */}
      <rect
        x="212" y="130" width="53" height="240"
        rx="6" fill={zc('exterior_passenger_side')} stroke={zb('exterior_passenger_side')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('exterior_passenger_side')}
      />
      <text x="239" y="250" textAnchor="middle" fontSize="9" fill="#374151" fontWeight="500"
        transform="rotate(90, 239, 250)">Passenger Side</text>

      {/* Trunk */}
      <path
        d="M 102 383 Q 150 393 198 383 L 192 425 L 108 425 Z"
        fill={zc('exterior_trunk')} stroke={zb('exterior_trunk')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('exterior_trunk')}
      />
      <text x="150" y="410" textAnchor="middle" fontSize="10" fill="#374151" fontWeight="500">Trunk</text>

      {/* Rear */}
      <path
        d="M 108 428 L 192 428 L 188 455 Q 150 480 112 455 Z"
        fill={zc('exterior_rear')} stroke={zb('exterior_rear')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('exterior_rear')}
      />
      <text x="150" y="455" textAnchor="middle" fontSize="10" fill="#374151" fontWeight="500">Rear</text>

      {/* Wheels */}
      <g cursor="pointer" onClick={() => onZoneTap('exterior_wheels')}>
        <ellipse cx="105" cy="105" rx="17" ry="11"
          fill={zc('exterior_wheels')} stroke={zb('exterior_wheels')}
          strokeWidth="1.5" opacity="0.7"
        />
        <ellipse cx="195" cy="105" rx="17" ry="11"
          fill={zc('exterior_wheels')} stroke={zb('exterior_wheels')}
          strokeWidth="1.5" opacity="0.7"
        />
        <ellipse cx="105" cy="400" rx="17" ry="11"
          fill={zc('exterior_wheels')} stroke={zb('exterior_wheels')}
          strokeWidth="1.5" opacity="0.7"
        />
        <ellipse cx="195" cy="400" rx="17" ry="11"
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
          exterior_front: { x: 185, y: 22 },
          exterior_hood: { x: 190, y: 72 },
          exterior_roof: { x: 195, y: 178 },
          exterior_driver_side: { x: 73, y: 145 },
          exterior_passenger_side: { x: 255, y: 145 },
          exterior_trunk: { x: 190, y: 395 },
          exterior_rear: { x: 185, y: 440 },
          exterior_wheels: { x: 195, y: 118 },
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

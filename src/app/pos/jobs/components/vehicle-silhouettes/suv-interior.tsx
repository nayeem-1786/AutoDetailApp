import { INTERIOR_ZONES } from '@/lib/utils/job-zones';
import { SilhouetteProps, zoneColor, zoneBorder } from './types';

/**
 * SUV/Truck interior silhouette — top-down cabin view
 * 2-row layout, wider cabin, larger seats, bigger center console
 */
export function SuvInterior({ photoCounts, onZoneTap }: SilhouetteProps) {
  const zc = (key: string) => zoneColor(photoCounts, key);
  const zb = (key: string) => zoneBorder(photoCounts, key);

  return (
    <svg viewBox="0 0 300 420" className="mx-auto w-full max-w-[260px]">
      {/* Cabin outline — SUV shape (wider, boxier) */}
      <path
        d="M 40 30 Q 40 12 150 8 Q 260 12 260 30
           L 265 60 L 268 120 L 268 320 L 265 360
           Q 265 398 150 402 Q 35 398 35 360
           L 32 320 L 32 120 L 35 60 Z"
        fill="none" stroke="#9ca3af" strokeWidth="2"
      />

      {/* Steering wheel — driver side */}
      <circle cx="90" cy="62" r="20" fill="none" stroke="#d1d5db" strokeWidth="1.5" />
      <circle cx="90" cy="62" r="7" fill="none" stroke="#d1d5db" strokeWidth="1" />

      {/* ─── Tappable Zone Hotspots ─── */}

      {/* Dashboard */}
      <path
        d="M 45 15 Q 150 6 255 15 L 260 55 L 40 55 Z"
        fill={zc('interior_dashboard')} stroke={zb('interior_dashboard')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_dashboard')}
      />
      <text x="190" y="40" textAnchor="middle" fontSize="11" fill="#374151" fontWeight="500">Dashboard</text>

      {/* Center Console — wider for SUV */}
      <rect
        x="115" y="60" width="70" height="145"
        rx="8" fill={zc('interior_console')} stroke={zb('interior_console')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_console')}
      />
      {/* Shifter */}
      <circle cx="150" cy="95" r="6" fill="none" stroke="#d1d5db" strokeWidth="0.8" />
      {/* Cup holders */}
      <circle cx="138" cy="138" r="7" fill="none" stroke="#d1d5db" strokeWidth="0.5" />
      <circle cx="162" cy="138" r="7" fill="none" stroke="#d1d5db" strokeWidth="0.5" />
      {/* Armrest storage */}
      <rect x="128" y="155" width="44" height="20" rx="4" fill="none" stroke="#d1d5db" strokeWidth="0.5" />
      <text x="150" y="195" textAnchor="middle" fontSize="9" fill="#374151" fontWeight="500">Console</text>

      {/* Driver Seat — wider for SUV */}
      <path
        d="M 45 62 Q 45 57 55 57 L 108 57 Q 112 57 112 62
           L 112 155 Q 112 163 108 165 L 55 165 Q 45 165 45 158 Z"
        fill={zc('interior_seats_front')} stroke={zb('interior_seats_front')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_seats_front')}
      />
      <rect x="65" y="62" width="28" height="15" rx="5" fill="none" stroke="#d1d5db" strokeWidth="0.8" />
      <text x="78" y="128" textAnchor="middle" fontSize="9" fill="#374151" fontWeight="500">Driver</text>

      {/* Passenger Seat */}
      <path
        d="M 188 62 Q 188 57 198 57 L 250 57 Q 255 57 255 62
           L 255 155 Q 255 163 250 165 L 198 165 Q 188 165 188 158 Z"
        fill={zc('interior_seats_front')} stroke={zb('interior_seats_front')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_seats_front')}
      />
      <rect x="207" y="62" width="28" height="15" rx="5" fill="none" stroke="#d1d5db" strokeWidth="0.8" />
      <text x="222" y="128" textAnchor="middle" fontSize="9" fill="#374151" fontWeight="500">Passenger</text>

      {/* Door Panels — Driver */}
      <rect
        x="32" y="170" width="48" height="55"
        rx="6" fill={zc('interior_door_panels')} stroke={zb('interior_door_panels')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_door_panels')}
      />
      <rect x="40" y="190" width="20" height="4" rx="2" fill="none" stroke="#d1d5db" strokeWidth="0.5" />
      <text x="56" y="207" textAnchor="middle" fontSize="8" fill="#374151" fontWeight="500">Door</text>

      {/* Door Panels — Passenger */}
      <rect
        x="220" y="170" width="48" height="55"
        rx="6" fill={zc('interior_door_panels')} stroke={zb('interior_door_panels')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_door_panels')}
      />
      <rect x="240" y="190" width="20" height="4" rx="2" fill="none" stroke="#d1d5db" strokeWidth="0.5" />
      <text x="244" y="207" textAnchor="middle" fontSize="8" fill="#374151" fontWeight="500">Door</text>

      {/* Rear Seats — wider */}
      <path
        d="M 40 235 L 260 235 Q 265 235 265 242 L 265 298 Q 265 305 260 305 L 40 305 Q 35 305 35 298 L 35 242 Q 35 235 40 235 Z"
        fill={zc('interior_seats_rear')} stroke={zb('interior_seats_rear')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_seats_rear')}
      />
      {/* 3 headrests */}
      <rect x="65" y="239" width="26" height="13" rx="5" fill="none" stroke="#d1d5db" strokeWidth="0.8" />
      <rect x="137" y="239" width="26" height="13" rx="5" fill="none" stroke="#d1d5db" strokeWidth="0.8" />
      <rect x="209" y="239" width="26" height="13" rx="5" fill="none" stroke="#d1d5db" strokeWidth="0.8" />
      <text x="150" y="280" textAnchor="middle" fontSize="11" fill="#374151" fontWeight="500">Rear Seats</text>

      {/* Carpet / Floor */}
      <rect
        x="38" y="312" width="224" height="48"
        rx="6" fill={zc('interior_carpet')} stroke={zb('interior_carpet')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_carpet')}
      />
      <line x1="105" y1="317" x2="105" y2="355" stroke="#d1d5db" strokeWidth="0.3" />
      <line x1="195" y1="317" x2="195" y2="355" stroke="#d1d5db" strokeWidth="0.3" />
      <text x="150" y="342" textAnchor="middle" fontSize="10" fill="#374151" fontWeight="500">Carpet / Floor</text>

      {/* Trunk / Cargo — larger for SUV */}
      <path
        d="M 42 368 L 258 368 L 260 392 Q 150 402 40 392 Z"
        fill={zc('interior_trunk_cargo')} stroke={zb('interior_trunk_cargo')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_trunk_cargo')}
      />
      <text x="150" y="388" textAnchor="middle" fontSize="9" fill="#374151" fontWeight="500">Cargo Area</text>

      {/* Photo count badges */}
      {INTERIOR_ZONES.map((z) => {
        const count = photoCounts[z.key] ?? 0;
        if (count === 0) return null;
        const positions: Record<string, { x: number; y: number }> = {
          interior_dashboard: { x: 252, y: 25 },
          interior_console: { x: 177, y: 75 },
          interior_seats_front: { x: 105, y: 70 },
          interior_door_panels: { x: 72, y: 180 },
          interior_seats_rear: { x: 252, y: 248 },
          interior_carpet: { x: 252, y: 325 },
          interior_trunk_cargo: { x: 252, y: 375 },
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

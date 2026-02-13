import { INTERIOR_ZONES } from '@/lib/utils/job-zones';
import { SilhouetteProps, zoneColor, zoneBorder } from './types';

/**
 * Van / 3-Row SUV interior silhouette — top-down cabin view
 * 3-row layout: dashboard, front seats, console, door panels, 2nd row, 3rd row, carpet, cargo
 * The 2nd + 3rd row both map to the `interior_seats_rear` zone
 */
export function VanInterior({ photoCounts, onZoneTap }: SilhouetteProps) {
  const zc = (key: string) => zoneColor(photoCounts, key);
  const zb = (key: string) => zoneBorder(photoCounts, key);

  return (
    <svg viewBox="0 0 300 500" className="mx-auto w-full max-w-[260px]">
      {/* Cabin outline — van/3-row SUV shape (tallest, widest) */}
      <path
        d="M 35 30 Q 35 10 150 5 Q 265 10 265 30
           L 270 60 L 272 120 L 272 400 L 270 440
           Q 270 480 150 485 Q 30 480 30 440
           L 28 400 L 28 120 L 30 60 Z"
        fill="none" stroke="#9ca3af" strokeWidth="2"
      />

      {/* Steering wheel */}
      <circle cx="88" cy="62" r="20" fill="none" stroke="#d1d5db" strokeWidth="1.5" />
      <circle cx="88" cy="62" r="7" fill="none" stroke="#d1d5db" strokeWidth="1" />

      {/* Row divider labels */}
      <text x="16" y="120" fontSize="8" fill="#9ca3af" fontWeight="500"
        transform="rotate(-90, 16, 120)">1st Row</text>
      <text x="16" y="258" fontSize="8" fill="#9ca3af" fontWeight="500"
        transform="rotate(-90, 16, 258)">2nd Row</text>
      <text x="16" y="365" fontSize="8" fill="#9ca3af" fontWeight="500"
        transform="rotate(-90, 16, 365)">3rd Row</text>

      {/* ─── Tappable Zone Hotspots ─── */}

      {/* Dashboard */}
      <path
        d="M 40 12 Q 150 3 260 12 L 262 55 L 38 55 Z"
        fill={zc('interior_dashboard')} stroke={zb('interior_dashboard')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_dashboard')}
      />
      <text x="195" y="38" textAnchor="middle" fontSize="11" fill="#374151" fontWeight="500">Dashboard</text>

      {/* Center Console */}
      <rect
        x="112" y="60" width="76" height="140"
        rx="8" fill={zc('interior_console')} stroke={zb('interior_console')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_console')}
      />
      {/* Shifter */}
      <circle cx="150" cy="92" r="6" fill="none" stroke="#d1d5db" strokeWidth="0.8" />
      {/* Cup holders */}
      <circle cx="138" cy="130" r="7" fill="none" stroke="#d1d5db" strokeWidth="0.5" />
      <circle cx="162" cy="130" r="7" fill="none" stroke="#d1d5db" strokeWidth="0.5" />
      {/* Armrest */}
      <rect x="125" y="150" width="50" height="20" rx="4" fill="none" stroke="#d1d5db" strokeWidth="0.5" />
      <text x="150" y="190" textAnchor="middle" fontSize="9" fill="#374151" fontWeight="500">Console</text>

      {/* Driver Seat */}
      <path
        d="M 38 62 Q 38 57 48 57 L 105 57 Q 110 57 110 62
           L 110 155 Q 110 163 105 165 L 48 165 Q 38 165 38 158 Z"
        fill={zc('interior_seats_front')} stroke={zb('interior_seats_front')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_seats_front')}
      />
      <rect x="60" y="62" width="28" height="15" rx="5" fill="none" stroke="#d1d5db" strokeWidth="0.8" />
      <text x="74" y="128" textAnchor="middle" fontSize="9" fill="#374151" fontWeight="500">Driver</text>

      {/* Passenger Seat */}
      <path
        d="M 190 62 Q 190 57 200 57 L 255 57 Q 262 57 262 62
           L 262 155 Q 262 163 255 165 L 200 165 Q 190 165 190 158 Z"
        fill={zc('interior_seats_front')} stroke={zb('interior_seats_front')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_seats_front')}
      />
      <rect x="212" y="62" width="28" height="15" rx="5" fill="none" stroke="#d1d5db" strokeWidth="0.8" />
      <text x="226" y="128" textAnchor="middle" fontSize="9" fill="#374151" fontWeight="500">Passenger</text>

      {/* Door Panels — Driver side (front + rear) */}
      <rect
        x="28" y="170" width="48" height="50"
        rx="6" fill={zc('interior_door_panels')} stroke={zb('interior_door_panels')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_door_panels')}
      />
      <rect x="36" y="188" width="18" height="4" rx="2" fill="none" stroke="#d1d5db" strokeWidth="0.5" />
      <text x="52" y="203" textAnchor="middle" fontSize="8" fill="#374151" fontWeight="500">Door</text>

      {/* Door Panels — Passenger side */}
      <rect
        x="224" y="170" width="48" height="50"
        rx="6" fill={zc('interior_door_panels')} stroke={zb('interior_door_panels')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_door_panels')}
      />
      <rect x="246" y="188" width="18" height="4" rx="2" fill="none" stroke="#d1d5db" strokeWidth="0.5" />
      <text x="248" y="203" textAnchor="middle" fontSize="8" fill="#374151" fontWeight="500">Door</text>

      {/* 2nd Row Seats — maps to interior_seats_rear */}
      <path
        d="M 35 230 L 265 230 Q 270 230 270 237 L 270 290 Q 270 297 265 297 L 35 297 Q 30 297 30 290 L 30 237 Q 30 230 35 230 Z"
        fill={zc('interior_seats_rear')} stroke={zb('interior_seats_rear')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_seats_rear')}
      />
      {/* 3 headrests */}
      <rect x="60" y="234" width="26" height="13" rx="5" fill="none" stroke="#d1d5db" strokeWidth="0.8" />
      <rect x="137" y="234" width="26" height="13" rx="5" fill="none" stroke="#d1d5db" strokeWidth="0.8" />
      <rect x="214" y="234" width="26" height="13" rx="5" fill="none" stroke="#d1d5db" strokeWidth="0.8" />
      <text x="150" y="275" textAnchor="middle" fontSize="10" fill="#374151" fontWeight="500">2nd Row</text>

      {/* 3rd Row Seats — also maps to interior_seats_rear */}
      <path
        d="M 38 308 L 262 308 Q 267 308 267 315 L 267 365 Q 267 372 262 372 L 38 372 Q 33 372 33 365 L 33 315 Q 33 308 38 308 Z"
        fill={zc('interior_seats_rear')} stroke={zb('interior_seats_rear')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_seats_rear')}
      />
      {/* 2 headrests (3rd row is narrower) */}
      <rect x="95" y="312" width="24" height="12" rx="4" fill="none" stroke="#d1d5db" strokeWidth="0.8" />
      <rect x="181" y="312" width="24" height="12" rx="4" fill="none" stroke="#d1d5db" strokeWidth="0.8" />
      <text x="150" y="352" textAnchor="middle" fontSize="10" fill="#374151" fontWeight="500">3rd Row</text>

      {/* Carpet / Floor */}
      <rect
        x="33" y="380" width="234" height="48"
        rx="6" fill={zc('interior_carpet')} stroke={zb('interior_carpet')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_carpet')}
      />
      <line x1="100" y1="385" x2="100" y2="423" stroke="#d1d5db" strokeWidth="0.3" />
      <line x1="200" y1="385" x2="200" y2="423" stroke="#d1d5db" strokeWidth="0.3" />
      <text x="150" y="410" textAnchor="middle" fontSize="10" fill="#374151" fontWeight="500">Carpet / Floor</text>

      {/* Cargo Area */}
      <path
        d="M 36 436 L 264 436 L 267 465 Q 150 480 33 465 Z"
        fill={zc('interior_trunk_cargo')} stroke={zb('interior_trunk_cargo')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_trunk_cargo')}
      />
      <text x="150" y="460" textAnchor="middle" fontSize="9" fill="#374151" fontWeight="500">Cargo Area</text>

      {/* Photo count badges */}
      {INTERIOR_ZONES.map((z) => {
        const count = photoCounts[z.key] ?? 0;
        if (count === 0) return null;
        const positions: Record<string, { x: number; y: number }> = {
          interior_dashboard: { x: 255, y: 22 },
          interior_console: { x: 180, y: 75 },
          interior_seats_front: { x: 103, y: 70 },
          interior_door_panels: { x: 68, y: 180 },
          interior_seats_rear: { x: 258, y: 244 },
          interior_carpet: { x: 258, y: 393 },
          interior_trunk_cargo: { x: 258, y: 448 },
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

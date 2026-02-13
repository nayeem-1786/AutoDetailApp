import { INTERIOR_ZONES } from '@/lib/utils/job-zones';
import { SilhouetteProps, zoneColor, zoneBorder } from './types';

/**
 * Sedan/Coupe interior silhouette — top-down cabin view
 * 2-row layout: dashboard, front seats, console, door panels, rear bench, carpet, trunk
 */
export function SedanInterior({ photoCounts, onZoneTap }: SilhouetteProps) {
  const zc = (key: string) => zoneColor(photoCounts, key);
  const zb = (key: string) => zoneBorder(photoCounts, key);

  return (
    <svg viewBox="0 0 300 420" className="mx-auto w-full max-w-[260px]">
      {/* Cabin outline — sedan shape */}
      <path
        d="M 50 30 Q 50 15 150 10 Q 250 15 250 30
           L 255 60 L 258 120 L 258 320 L 255 360
           Q 255 395 150 400 Q 45 395 45 360
           L 42 320 L 42 120 L 45 60 Z"
        fill="none" stroke="#9ca3af" strokeWidth="2"
      />

      {/* Steering wheel — driver side */}
      <circle cx="95" cy="62" r="18" fill="none" stroke="#d1d5db" strokeWidth="1.5" />
      <circle cx="95" cy="62" r="6" fill="none" stroke="#d1d5db" strokeWidth="1" />

      {/* ─── Tappable Zone Hotspots ─── */}

      {/* Dashboard */}
      <path
        d="M 55 18 Q 150 10 245 18 L 250 55 L 50 55 Z"
        fill={zc('interior_dashboard')} stroke={zb('interior_dashboard')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_dashboard')}
      />
      <text x="185" y="40" textAnchor="middle" fontSize="11" fill="#374151" fontWeight="500">Dashboard</text>

      {/* Center Console */}
      <rect
        x="120" y="60" width="60" height="145"
        rx="8" fill={zc('interior_console')} stroke={zb('interior_console')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_console')}
      />
      {/* Shifter detail */}
      <circle cx="150" cy="100" r="5" fill="none" stroke="#d1d5db" strokeWidth="0.8" />
      {/* Cup holders */}
      <circle cx="142" cy="140" r="6" fill="none" stroke="#d1d5db" strokeWidth="0.5" />
      <circle cx="158" cy="140" r="6" fill="none" stroke="#d1d5db" strokeWidth="0.5" />
      <text x="150" y="175" textAnchor="middle" fontSize="9" fill="#374151" fontWeight="500">Console</text>

      {/* Driver Seat */}
      <path
        d="M 55 62 Q 55 58 65 58 L 110 58 Q 115 58 115 62
           L 115 150 Q 115 158 110 160 L 65 160 Q 55 160 55 155 Z"
        fill={zc('interior_seats_front')} stroke={zb('interior_seats_front')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_seats_front')}
      />
      {/* Seat headrest */}
      <rect x="72" y="62" width="26" height="14" rx="5" fill="none" stroke="#d1d5db" strokeWidth="0.8" />
      <text x="85" y="125" textAnchor="middle" fontSize="9" fill="#374151" fontWeight="500">Driver</text>

      {/* Passenger Seat */}
      <path
        d="M 185 62 Q 185 58 195 58 L 240 58 Q 245 58 245 62
           L 245 150 Q 245 158 240 160 L 195 160 Q 185 160 185 155 Z"
        fill={zc('interior_seats_front')} stroke={zb('interior_seats_front')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_seats_front')}
      />
      {/* Seat headrest */}
      <rect x="202" y="62" width="26" height="14" rx="5" fill="none" stroke="#d1d5db" strokeWidth="0.8" />
      <text x="215" y="125" textAnchor="middle" fontSize="9" fill="#374151" fontWeight="500">Passenger</text>

      {/* Door Panels — Driver */}
      <rect
        x="42" y="165" width="45" height="55"
        rx="6" fill={zc('interior_door_panels')} stroke={zb('interior_door_panels')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_door_panels')}
      />
      {/* Door handle detail */}
      <rect x="50" y="185" width="18" height="4" rx="2" fill="none" stroke="#d1d5db" strokeWidth="0.5" />
      <text x="64" y="200" textAnchor="middle" fontSize="8" fill="#374151" fontWeight="500">Door</text>

      {/* Door Panels — Passenger */}
      <rect
        x="213" y="165" width="45" height="55"
        rx="6" fill={zc('interior_door_panels')} stroke={zb('interior_door_panels')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_door_panels')}
      />
      <rect x="232" y="185" width="18" height="4" rx="2" fill="none" stroke="#d1d5db" strokeWidth="0.5" />
      <text x="236" y="200" textAnchor="middle" fontSize="8" fill="#374151" fontWeight="500">Door</text>

      {/* Rear Seats */}
      <path
        d="M 50 228 L 250 228 Q 255 228 255 235 L 255 290 Q 255 298 250 298 L 50 298 Q 45 298 45 290 L 45 235 Q 45 228 50 228 Z"
        fill={zc('interior_seats_rear')} stroke={zb('interior_seats_rear')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_seats_rear')}
      />
      {/* 3 headrests */}
      <rect x="72" y="232" width="22" height="12" rx="4" fill="none" stroke="#d1d5db" strokeWidth="0.8" />
      <rect x="139" y="232" width="22" height="12" rx="4" fill="none" stroke="#d1d5db" strokeWidth="0.8" />
      <rect x="206" y="232" width="22" height="12" rx="4" fill="none" stroke="#d1d5db" strokeWidth="0.8" />
      <text x="150" y="272" textAnchor="middle" fontSize="11" fill="#374151" fontWeight="500">Rear Seats</text>

      {/* Carpet / Floor */}
      <rect
        x="48" y="305" width="204" height="45"
        rx="6" fill={zc('interior_carpet')} stroke={zb('interior_carpet')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_carpet')}
      />
      {/* Floor mat pattern */}
      <line x1="100" y1="310" x2="100" y2="345" stroke="#d1d5db" strokeWidth="0.3" />
      <line x1="200" y1="310" x2="200" y2="345" stroke="#d1d5db" strokeWidth="0.3" />
      <text x="150" y="332" textAnchor="middle" fontSize="10" fill="#374151" fontWeight="500">Carpet / Floor</text>

      {/* Trunk / Cargo */}
      <path
        d="M 50 358 L 250 358 L 252 380 Q 150 395 48 380 Z"
        fill={zc('interior_trunk_cargo')} stroke={zb('interior_trunk_cargo')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_trunk_cargo')}
      />
      <text x="150" y="378" textAnchor="middle" fontSize="9" fill="#374151" fontWeight="500">Trunk</text>

      {/* Photo count badges */}
      {INTERIOR_ZONES.map((z) => {
        const count = photoCounts[z.key] ?? 0;
        if (count === 0) return null;
        const positions: Record<string, { x: number; y: number }> = {
          interior_dashboard: { x: 242, y: 28 },
          interior_console: { x: 172, y: 75 },
          interior_seats_front: { x: 107, y: 72 },
          interior_door_panels: { x: 78, y: 175 },
          interior_seats_rear: { x: 242, y: 242 },
          interior_carpet: { x: 242, y: 318 },
          interior_trunk_cargo: { x: 242, y: 365 },
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

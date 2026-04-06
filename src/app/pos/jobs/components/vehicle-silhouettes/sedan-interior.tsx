import { INTERIOR_ZONES } from '@/lib/utils/job-zones';
import { SilhouetteProps, zoneColor, zoneBorder } from './types';

/**
 * Sedan interior silhouette — professional Illustrator artwork, landscape cabin view
 * Car faces RIGHT: dashboard=right, trunk=left, driver=top, passenger=bottom
 * Rotated 90° CW from original portrait artwork via transform group
 */
export function SedanInterior({ photoCounts, onZoneTap }: SilhouetteProps) {
  const zc = (key: string) => zoneColor(photoCounts, key);
  const zb = (key: string) => zoneBorder(photoCounts, key);

  return (
    <svg viewBox="350 620 1680 920" className="mx-auto w-full max-w-[500px]">
      {/* ─── Rotated Illustrator Artwork (90° CW) ─── */}
      <g transform="rotate(90, 1080, 1080)">
        {/* Background fills */}
        <g fill="#e5e7eb">
          <path d="M1339.6,722.5s-78-78.7-251.6-77c0,0-155.1-6.6-249,74.6,0,0,37.2,153.1,43,228.4,0,0,178.3-56.6,411.8,0,0,0,27-175.3,45.6-226.1Z" />
          <path d="M943.4,1188.5h-18s-13.1-2.6-14.8-18.8v-195.6s1.3-11.5,16.4-12.6l106.1-1.1s13.1,6,14.4,17.8v194.9s-3.7,15-15.1,15.2l-15.7.2s-1.5,12.9-12.5,15.4h-49.7c0,.1-10.5-3-11-15.4Z" />
          <path d="M1080.5,1245.9h-110.6s-41.8,3.2-46.1,50.3v72.1l-21.8,52.3s-6.4,21.7,15.5,28.3h326.9s19.7-6.4,13.5-30.4l-21.3-51.3-.2-72.9s-.5-42.1-47.4-48.4h-108.6Z" />
          <path d="M895.3,1513.4v158.6s8,48.9,60.1,56.9c0,0,163,19.1,254.3-.7,0,0,55.9-13.8,55.9-67.4v-146.7c0,0-3.6-4-3.6-4h-363.2l-3.5,3.3Z" />
          <path d="M1142.7,1188.5h-18s-13.1-2.6-14.8-18.8v-195.6s1.3-11.5,16.4-12.6l106.1-1.1s13.1,6,14.4,17.8v194.9s-3.7,15-15.1,15.2l-15.7.2s-1.5,12.9-12.5,15.4h-49.7c0,.1-10.5-3-11-15.4Z" />
          <path d="M1080,1245.9" />
        </g>

        {/* Body outline */}
        <g fill="none" stroke="#9ca3af" strokeWidth={4} strokeMiterlimit={10}>
          <path d="M1080,249.1s-180.8-13.9-278.6,122.7c-4.9,6.9-7.6,15.2-7.6,23.7v250.5c0,7.3,1.8,14.5,5.2,21l29.4,55.6s130.6,447.7,27,873.2c-2,8.2-2.5,16.8-1.5,25.2l17.8,144.8c.8,6.3,4.1,12,9.2,15.7,20.8,15.3,82.9,51.6,199.1,46.1" />
          <path d="M1080,645.6s-157.3-8.6-251.6,77" />
          <path d="M1080,923.3s-102.3-3.1-205.9,25.3" />
          <path d="M1080,249.1s180.8-13.9,278.6,122.7c4.9,6.9,7.6,15.2,7.6,23.7v250.5c0,7.3-1.8,14.5-5.2,21l-29.4,55.6s-130.6,447.7-27,873.2c2,8.2,2.5,16.8,1.5,25.2l-17.8,144.8c-.8,6.3-4.1,12-9.2,15.7-20.8,15.3-82.9,51.6-199.1,46.1" />
          <path d="M1080,645.6s157.3-8.6,251.6,77" />
          <path d="M1080,923.3s102.3-3.1,205.9,25.3" />
        </g>

        {/* Seat and cabin detail strokes */}
        <g fill="none" stroke="#d1d5db" strokeWidth={3} strokeMiterlimit={10}>
          <path d="M1016.6,1188.5h13.1c9.8,0,17.8-8,17.8-17.8v-192.5c0-9.8-8-17.8-17.8-17.8h-101.2c-9.8,0-17.8,8-17.8,17.8v192.5c0,9.8,8,17.8,17.8,17.8h14.9" />
          <rect x="943.3" y="1174.9" width="73.3" height="29.2" rx="14.6" ry="14.6" />
          <line x1="910.7" y1="1083.3" x2="1047.5" y2="1083.3" />
          <path d="M1215.9,1188.5h13.1c9.8,0,17.8-8,17.8-17.8v-192.5c0-9.8-8-17.8-17.8-17.8h-101.2c-9.8,0-17.8,8-17.8,17.8v192.5c0,9.8,8,17.8,17.8,17.8h14.9" />
          <rect x="1142.7" y="1174.9" width="73.3" height="29.2" rx="14.6" ry="14.6" />
          <line x1="1110" y1="1083.3" x2="1246.8" y2="1083.3" />
          <path d="M1080,1245.9h-106.6c-22.9,0-42.9,15.8-47.8,38.1-.8,3.7-1.4,7.7-1.7,12.1v72.1l-21.3,50.3s-8.3,23.5,13.5,30.4h163.9" />
          <line x1="1080" y1="1367.3" x2="923.9" y2="1367.3" />
          <rect x="947.8" y="1412.7" width="61.9" height="29.7" rx="14.9" ry="14.9" />
          <path d="M1080,1412.7h-14.8c-8.2,0-14.9,6.7-14.9,14.9h0c0,8.2,6.7,14.9,14.9,14.9h14.8" />
          <path d="M1080.5,1245.9h106.6c22.9,0,42.9,15.8,47.8,38.1.8,3.7,1.4,7.7,1.7,12.1v72.1s21.3,50.3,21.3,50.3c0,0,8.3,23.5-13.5,30.4h-163.9" />
          <line x1="1080.5" y1="1367.3" x2="1236.6" y2="1367.3" />
          <rect x="1150.7" y="1412.7" width="61.9" height="29.7" rx="14.9" ry="14.9" transform="translate(2363.4 2855) rotate(180)" />
          <path d="M1080.5,1412.7h14.8c8.2,0,14.9,6.7,14.9,14.9h0c0,8.2-6.7,14.9-14.9,14.9h-14.8" />
          <path d="M1080.5,1510.1h-180.2c-2.7,0-4.9,2.2-4.9,4.9v149.5s0,1.7.3,4.6c3.2,29.8,26,53.9,55.6,59,21.1,3.6,65.1,9.4,128.8,9" />
          <path d="M895.3,1613.6l29.9-14.1c8.8-4.1,14.4-13,14.4-22.7v-66.7" />
          <path d="M1080.5,1510.1h180.2c2.7,0,4.9,2.2,4.9,4.9v149.5s0,1.7-.3,4.6c-3.2,29.8-26,53.9-55.6,59-21.1,3.6-65.1,9.4-128.8,9" />
          <path d="M1265.6,1613.6l-29.9-14.1c-8.8-4.1-14.4-13-14.4-22.7v-66.7" />
        </g>

        {/* Empty reference paths */}
        <g fill="none" stroke="#9ca3af" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
          <path d="M1369.8,731.5" />
          <path d="M1389,749.8" />
          <path d="M787.3,728" />
          <path d="M768.2,746.3" />
        </g>
      </g>

      {/* ─── Tappable Zone Hotspots (in rotated coordinate space) ─── */}
      {/* Layout: Trunk=LEFT, Dashboard=RIGHT, Driver=TOP, Passenger=BOTTOM */}

      {/* Trunk / Cargo (left end) */}
      <rect x={430} y={893} width={220} height={374} rx={12}
        fill={zc('interior_trunk_cargo')} stroke={zb('interior_trunk_cargo')}
        strokeWidth={5} opacity={0.7} cursor="pointer"
        onClick={() => onZoneTap('interior_trunk_cargo')}
      />
      <text x={540} y={1095} textAnchor="middle" fontSize={34} fill="#374151" fontWeight="500">Trunk</text>

      {/* Rear Seats */}
      <rect x={710} y={900} width={204} height={360} rx={12}
        fill={zc('interior_seats_rear')} stroke={zb('interior_seats_rear')}
        strokeWidth={5} opacity={0.7} cursor="pointer"
        onClick={() => onZoneTap('interior_seats_rear')}
      />
      <text x={812} y={1095} textAnchor="middle" fontSize={32} fill="#374151" fontWeight="500">Rear</text>

      {/* Driver Seat (TOP) */}
      <rect x={962} y={905} width={240} height={138} rx={12}
        fill={zc('interior_seats_front')} stroke={zb('interior_seats_front')}
        strokeWidth={5} opacity={0.7} cursor="pointer"
        onClick={() => onZoneTap('interior_seats_front')}
      />
      <text x={1082} y={985} textAnchor="middle" fontSize={30} fill="#374151" fontWeight="500">Driver</text>

      {/* Center Console */}
      <rect x={962} y={1045} width={240} height={70} rx={10}
        fill={zc('interior_console')} stroke={zb('interior_console')}
        strokeWidth={5} opacity={0.7} cursor="pointer"
        onClick={() => onZoneTap('interior_console')}
      />
      <text x={1082} y={1090} textAnchor="middle" fontSize={26} fill="#374151" fontWeight="500">Console</text>

      {/* Passenger Seat (BOTTOM) */}
      <rect x={962} y={1117} width={240} height={138} rx={12}
        fill={zc('interior_seats_front')} stroke={zb('interior_seats_front')}
        strokeWidth={5} opacity={0.7} cursor="pointer"
        onClick={() => onZoneTap('interior_seats_front')}
      />
      <text x={1082} y={1200} textAnchor="middle" fontSize={28} fill="#374151" fontWeight="500">Passenger</text>

      {/* Carpet / Floor */}
      <rect x={1205} y={830} width={230} height={500} rx={12}
        fill={zc('interior_carpet')} stroke={zb('interior_carpet')}
        strokeWidth={5} opacity={0.7} cursor="pointer"
        onClick={() => onZoneTap('interior_carpet')}
      />
      <text x={1320} y={1095} textAnchor="middle" fontSize={32} fill="#374151" fontWeight="500">Carpet</text>

      {/* Dashboard (right end) */}
      <rect x={1440} y={800} width={520} height={560} rx={20}
        fill={zc('interior_dashboard')} stroke={zb('interior_dashboard')}
        strokeWidth={5} opacity={0.7} cursor="pointer"
        onClick={() => onZoneTap('interior_dashboard')}
      />
      <text x={1700} y={1095} textAnchor="middle" fontSize={40} fill="#374151" fontWeight="500">Dashboard</text>

      {/* Door Panels — Driver (TOP) */}
      <rect x={705} y={793} width={730} height={107} rx={12}
        fill={zc('interior_door_panels')} stroke={zb('interior_door_panels')}
        strokeWidth={5} opacity={0.7} cursor="pointer"
        onClick={() => onZoneTap('interior_door_panels')}
      />
      <text x={1070} y={860} textAnchor="middle" fontSize={30} fill="#374151" fontWeight="500">Door Panel</text>

      {/* Door Panels — Passenger (BOTTOM) */}
      <rect x={705} y={1260} width={730} height={107} rx={12}
        fill={zc('interior_door_panels')} stroke={zb('interior_door_panels')}
        strokeWidth={5} opacity={0.7} cursor="pointer"
        onClick={() => onZoneTap('interior_door_panels')}
      />
      <text x={1070} y={1327} textAnchor="middle" fontSize={30} fill="#374151" fontWeight="500">Door Panel</text>

      {/* Photo count badges */}
      {INTERIOR_ZONES.map((z) => {
        const count = photoCounts[z.key] ?? 0;
        if (count === 0) return null;
        const positions: Record<string, { x: number; y: number }> = {
          interior_trunk_cargo: { x: 610, y: 940 },
          interior_seats_rear: { x: 870, y: 945 },
          interior_seats_front: { x: 1160, y: 940 },
          interior_console: { x: 1160, y: 1080 },
          interior_carpet: { x: 1390, y: 880 },
          interior_dashboard: { x: 1900, y: 850 },
          interior_door_panels: { x: 770, y: 840 },
        };
        const pos = positions[z.key];
        if (!pos) return null;
        return (
          <g key={z.key}>
            <circle cx={pos.x} cy={pos.y} r={32} fill="#2563eb" />
            <text x={pos.x} y={pos.y + 12} textAnchor="middle" fontSize={32} fill="white" fontWeight="bold">
              {count}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

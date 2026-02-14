'use client';

import { BeforeAfterSlider } from '@/components/before-after-slider';

interface HeroClientProps {
  beforeSrc: string;
  afterSrc: string;
  vehicleInfo: string | null;
  serviceName: string | null;
}

export function HeroClient({
  beforeSrc,
  afterSrc,
  vehicleInfo,
  serviceName,
}: HeroClientProps) {
  return (
    <div>
      <BeforeAfterSlider beforeSrc={beforeSrc} afterSrc={afterSrc} />
      {(vehicleInfo || serviceName) && (
        <div className="bg-white/10 backdrop-blur-sm px-4 py-3 flex items-center justify-between text-sm text-white/80">
          {vehicleInfo && <span>{vehicleInfo}</span>}
          {serviceName && (
            <span className="text-brand-200 font-medium">{serviceName}</span>
          )}
        </div>
      )}
    </div>
  );
}

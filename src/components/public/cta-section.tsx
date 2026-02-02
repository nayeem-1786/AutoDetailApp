import Link from 'next/link';
import { Phone } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { getBusinessInfo } from '@/lib/data/business';
import { formatPhone, phoneToE164 } from '@/lib/utils/format';

interface CtaSectionProps {
  title?: string;
  description?: string;
}

export async function CtaSection({
  title = 'Ready to Transform Your Vehicle?',
  description = 'Book your appointment today or call us to get started.',
}: CtaSectionProps) {
  const biz = await getBusinessInfo();

  return (
    <section className="bg-gradient-to-br from-gray-900 to-gray-800">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {title}
          </h2>
          <p className="mt-4 text-lg text-gray-300">
            {description}
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <a
              href={`tel:${phoneToE164(biz.phone)}`}
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors',
                'border border-white text-white hover:bg-white hover:text-gray-900',
                'h-11 px-8'
              )}
            >
              <Phone className="h-4 w-4" />
              {formatPhone(biz.phone)}
            </a>
            <Link
              href="/book"
              className={cn(
                'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors',
                'bg-white text-gray-900 hover:bg-gray-100',
                'h-11 px-8'
              )}
            >
              Book Now
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

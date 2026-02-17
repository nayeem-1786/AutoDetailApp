import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getBusinessInfo } from '@/lib/data/business';
import { formatPhone, phoneToE164 } from '@/lib/utils/format';

interface CtaSectionProps {
  title?: string;
  description?: string;
}

export async function CtaSection({
  title = 'Ready to Transform Your Vehicle?',
  description = 'Book your appointment today and experience the difference professional detailing makes.',
}: CtaSectionProps) {
  const biz = await getBusinessInfo();

  return (
    <section className="bg-gradient-to-br from-brand-grey to-black section-spacing relative overflow-hidden">
      {/* Subtle radial glow behind CTA */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
        <div className="w-96 h-96 bg-lime/5 rounded-full blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight text-site-text sm:text-4xl lg:text-5xl">
            {title}
          </h2>
          <p className="mt-5 text-lg text-site-text-muted">
            {description}
          </p>
          <div className="mt-10">
            <Link
              href="/book"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-lime text-black font-bold text-lg h-14 px-10 shadow-lg shadow-lime/25 hover:shadow-xl hover:shadow-lime/40 hover:scale-[1.03] transition-all duration-300 btn-lime-glow"
            >
              Book Your Detail
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
          <a
            href={`tel:${phoneToE164(biz.phone)}`}
            className="mt-5 inline-block text-sm font-medium text-site-text-dim hover:text-lime transition-colors"
          >
            or call {formatPhone(biz.phone)}
          </a>
        </div>
      </div>
    </section>
  );
}

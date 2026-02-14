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
    <section className="bg-gradient-cta section-spacing">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
            {title}
          </h2>
          <p className="mt-5 text-lg text-blue-100/60">
            {description}
          </p>
          <div className="mt-10">
            <Link
              href="/book"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white text-navy font-semibold text-base h-13 px-8 shadow-lg shadow-brand-900/25 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
            >
              Book Your Detail
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <a
            href={`tel:${phoneToE164(biz.phone)}`}
            className="mt-5 inline-block text-sm font-medium text-blue-100/50 hover:text-white transition-colors"
          >
            or call {formatPhone(biz.phone)}
          </a>
        </div>
      </div>
    </section>
  );
}

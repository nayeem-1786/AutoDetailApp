import { NextResponse } from 'next/server';
import { SITE_URL } from '@/lib/utils/constants';
import { getAllServicesForSitemap, getServiceCategories } from '@/lib/data/services';
import { getAllProductsForSitemap, getProductCategories } from '@/lib/data/products';

// ---------------------------------------------------------------------------
// Dynamic XML Sitemap
// GET /sitemap.xml
// ---------------------------------------------------------------------------

interface SitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq: string;
  priority: number;
}

function buildXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map(
      (entry) =>
        `  <url>
    <loc>${escapeXml(entry.loc)}</loc>${
          entry.lastmod ? `\n    <lastmod>${entry.lastmod}</lastmod>` : ''
        }
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority.toFixed(1)}</priority>
  </url>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toISODate(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined;
  try {
    return new Date(dateStr).toISOString().split('T')[0];
  } catch {
    return undefined;
  }
}

export async function GET() {
  const entries: SitemapEntry[] = [];

  // ---- Static pages ----
  entries.push({
    loc: SITE_URL,
    changefreq: 'weekly',
    priority: 1.0,
  });

  entries.push({
    loc: `${SITE_URL}/services`,
    changefreq: 'weekly',
    priority: 0.9,
  });

  entries.push({
    loc: `${SITE_URL}/products`,
    changefreq: 'weekly',
    priority: 0.8,
  });

  // ---- Service category pages ----
  const serviceCategories = await getServiceCategories();
  for (const cat of serviceCategories) {
    entries.push({
      loc: `${SITE_URL}/services/${cat.slug}`,
      lastmod: toISODate(cat.updated_at),
      changefreq: 'weekly',
      priority: 0.8,
    });
  }

  // ---- Individual service pages ----
  const services = await getAllServicesForSitemap();
  for (const svc of services) {
    // Ceramic coatings is the #1 SEO priority -- boost to 1.0
    const isCeramicCoatings = svc.categorySlug === 'ceramic-coatings';
    entries.push({
      loc: `${SITE_URL}/services/${svc.categorySlug}/${svc.serviceSlug}`,
      lastmod: toISODate(svc.updatedAt),
      changefreq: isCeramicCoatings ? 'weekly' : 'monthly',
      priority: isCeramicCoatings ? 1.0 : 0.7,
    });
  }

  // ---- Product category pages ----
  const productCategories = await getProductCategories();
  for (const cat of productCategories) {
    entries.push({
      loc: `${SITE_URL}/products/${cat.slug}`,
      lastmod: toISODate(cat.updated_at),
      changefreq: 'monthly',
      priority: 0.7,
    });
  }

  // ---- Individual product pages ----
  const products = await getAllProductsForSitemap();
  for (const prod of products) {
    entries.push({
      loc: `${SITE_URL}/products/${prod.categorySlug}/${prod.productSlug}`,
      lastmod: toISODate(prod.updatedAt),
      changefreq: 'monthly',
      priority: 0.6,
    });
  }

  const xml = buildXml(entries);

  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}

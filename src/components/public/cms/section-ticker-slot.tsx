import { getAllSectionTickers, getCmsToggles, getTickerOptions } from '@/lib/data/cms';
import { tickersForPosition, type TickerPosition, type PageType } from '@/lib/utils/ticker-sections';
import { SectionTickerFiltered } from './announcement-ticker';

/**
 * Server component that renders section tickers at a specific position.
 * Fetches tickers via cached data layer, filters by position + page type
 * (including fallback resolution), and renders the client-side ticker component.
 *
 * Returns null if CMS toggles are off or no tickers match the slot.
 */
export async function SectionTickerSlot({
  position,
  pageType,
}: {
  position: TickerPosition;
  pageType: PageType;
}) {
  const [cmsToggles, allTickers, tickerOptions] = await Promise.all([
    getCmsToggles(),
    getAllSectionTickers(),
    getTickerOptions(),
  ]);

  if (!cmsToggles.announcementTickers || !cmsToggles.tickerEnabled) return null;

  const matched = tickersForPosition(allTickers, position, pageType);
  if (matched.length === 0) return null;

  return <SectionTickerFiltered tickers={matched} options={tickerOptions.section} />;
}

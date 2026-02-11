'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatRelativeDate } from '@/lib/utils/format';
import { Link2, MousePointerClick } from 'lucide-react';

interface UrlStats {
  url: string;
  clicks: number;
  uniqueClicks: number;
}

interface RecentClick {
  clickedAt: string;
  customerName: string;
  url: string;
}

interface ClickDetailsProps {
  byUrl: UrlStats[];
  recent: RecentClick[];
  loading: boolean;
}

function truncateUrl(url: string, maxLen = 60): string {
  if (url.length <= maxLen) return url;
  return url.slice(0, maxLen) + '\u2026';
}

export function ClickDetails({ byUrl, recent, loading }: ClickDetailsProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle>Click Details</CardTitle></CardHeader>
        <CardContent>
          <div className="h-32 bg-gray-100 rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  const hasData = (byUrl?.length ?? 0) > 0 || (recent?.length ?? 0) > 0;

  if (!hasData) {
    return (
      <Card>
        <CardHeader><CardTitle>Click Details</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8">
            <MousePointerClick className="h-8 w-8 text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">No clicks recorded yet</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle>Click Details</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        {/* Link performance table */}
        {(byUrl?.length ?? 0) > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Link Performance</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase text-gray-500">
                    <th className="pb-2 pr-4">URL</th>
                    <th className="pb-2 pr-4 text-right">Total Clicks</th>
                    <th className="pb-2 text-right">Unique Clicks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {byUrl.map((u, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-1.5">
                          <Link2 className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                          <span className="text-xs text-gray-600" title={u.url}>
                            {truncateUrl(u.url)}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums font-medium text-gray-900">
                        {u.clicks}
                      </td>
                      <td className="py-2 text-right tabular-nums font-medium text-gray-900">
                        {u.uniqueClicks}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Recent click activity */}
        {(recent?.length ?? 0) > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Recent Activity</p>
            <div className="space-y-2">
              {recent.map((c, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <MousePointerClick className="h-3.5 w-3.5 shrink-0 text-purple-400 mt-0.5" />
                  <span className="text-gray-600">
                    <span className="font-medium text-gray-900">{c.customerName}</span>
                    {' clicked '}
                    <span className="text-xs text-gray-500" title={c.url}>
                      {truncateUrl(c.url, 40)}
                    </span>
                    {' '}
                    <span className="text-xs text-gray-400">
                      {formatRelativeDate(c.clickedAt)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

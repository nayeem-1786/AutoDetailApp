import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/utils/format';

interface CouponCardProps {
  coupon: {
    id: string;
    code: string;
    type: string;
    value: number;
    min_purchase: number | null;
    max_discount: number | null;
    expires_at: string | null;
    is_single_use: boolean;
  };
}

function couponValueLabel(type: string, value: number): string {
  switch (type) {
    case 'flat':
      return `${formatCurrency(value)} off`;
    case 'percentage':
      return `${value}% off`;
    case 'free_addon':
      return 'Free add-on';
    case 'free_product':
      return 'Free product';
    default:
      return `${formatCurrency(value)} off`;
  }
}

export function CouponCard({ coupon }: CouponCardProps) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold text-gray-900">
              {coupon.code}
            </span>
            <Badge variant="info">{couponValueLabel(coupon.type, coupon.value)}</Badge>
          </div>
          <div className="mt-1.5 space-y-0.5 text-xs text-gray-500">
            {coupon.min_purchase != null && coupon.min_purchase > 0 && (
              <p>Min. purchase: {formatCurrency(coupon.min_purchase)}</p>
            )}
            {coupon.max_discount != null && (
              <p>Max discount: {formatCurrency(coupon.max_discount)}</p>
            )}
            {coupon.expires_at && (
              <p>Expires: {formatDate(coupon.expires_at)}</p>
            )}
            {coupon.is_single_use && <p>Single use</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

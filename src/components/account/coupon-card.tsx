import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { DISCOUNT_TYPE_LABELS } from '@/lib/utils/constants';

interface CouponRewardSummary {
  applies_to: string;
  discount_type: string;
  discount_value: number;
  max_discount: number | null;
  target_product_name?: string;
  target_service_name?: string;
  target_product_category_name?: string;
  target_service_category_name?: string;
}

interface CouponCardProps {
  coupon: {
    id: string;
    code: string;
    name: string | null;
    min_purchase: number | null;
    expires_at: string | null;
    is_single_use: boolean;
    rewards?: CouponRewardSummary[];
  };
}

function rewardLabel(reward: CouponRewardSummary): string {
  const target =
    reward.target_product_name ||
    reward.target_service_name ||
    reward.target_product_category_name ||
    reward.target_service_category_name ||
    (reward.applies_to === 'order'
      ? 'entire order'
      : reward.applies_to === 'product'
        ? 'all products'
        : 'all services');

  if (reward.discount_type === 'free') return `Free ${target}`;
  if (reward.discount_type === 'percentage') {
    const cap = reward.max_discount ? ` (max ${formatCurrency(reward.max_discount)})` : '';
    return `${reward.discount_value}% off ${target}${cap}`;
  }
  return `${formatCurrency(reward.discount_value)} off ${target}`;
}

export function CouponCard({ coupon }: CouponCardProps) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold text-gray-900">
            {coupon.code}
          </span>
          {coupon.name && (
            <span className="text-sm text-gray-600">{coupon.name}</span>
          )}
        </div>

        {coupon.rewards && coupon.rewards.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {coupon.rewards.map((r, i) => (
              <Badge key={i} variant="info">{rewardLabel(r)}</Badge>
            ))}
          </div>
        )}

        <div className="mt-1.5 space-y-0.5 text-xs text-gray-500">
          {coupon.min_purchase != null && coupon.min_purchase > 0 && (
            <p>Min. purchase: {formatCurrency(coupon.min_purchase)}</p>
          )}
          {coupon.expires_at && (
            <p>Expires: {formatDate(coupon.expires_at)}</p>
          )}
          {coupon.is_single_use && <p>Single use</p>}
        </div>
      </div>
    </div>
  );
}

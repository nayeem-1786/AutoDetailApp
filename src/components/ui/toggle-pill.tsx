import { cn } from '@/lib/utils/cn';

interface TogglePillProps {
  label: string;
  active: boolean;
  onClick: () => void;
  activeClassName: string;
  count?: number;
}

export function TogglePill({
  label,
  active,
  onClick,
  activeClassName,
  count,
}: TogglePillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-4 py-1.5 text-sm font-medium cursor-pointer transition-colors',
        active ? activeClassName : 'bg-gray-100 text-gray-500'
      )}
    >
      {label}
      {count !== undefined && ` (${count})`}
    </button>
  );
}

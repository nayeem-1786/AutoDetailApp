import * as React from 'react';
import { cn } from '@/lib/utils/cn';

const badgeVariants = {
  default: 'bg-ui-badge-default-bg text-ui-badge-default-text',
  secondary: 'bg-ui-bg-muted text-ui-text-muted',
  success: 'bg-green-500/10 text-green-600',
  warning: 'bg-amber-500/10 text-amber-600',
  destructive: 'bg-red-500/10 text-red-600',
  info: 'bg-blue-500/10 text-blue-600',
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: keyof typeof badgeVariants;
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        badgeVariants[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge, badgeVariants };

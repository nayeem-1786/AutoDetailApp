import { cn } from '@/lib/utils/cn';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
      {Icon && (
        <div className="mb-4 rounded-full bg-ui-bg-muted p-4">
          <Icon className="h-14 w-14 text-ui-text-dim" />
        </div>
      )}
      <h3 className="text-lg font-medium text-ui-text">{title}</h3>
      {description && <p className="mt-1 text-sm text-ui-text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export { EmptyState };

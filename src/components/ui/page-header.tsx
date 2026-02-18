import { cn } from '@/lib/utils/cn';

interface PageHeaderProps {
  title: React.ReactNode;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

function PageHeader({ title, description, action, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between', className)}>
      <div>
        <h1 className="text-2xl font-bold text-ui-text">{title}</h1>
        {description && <p className="mt-1 text-sm text-ui-text-muted">{description}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

export { PageHeader };

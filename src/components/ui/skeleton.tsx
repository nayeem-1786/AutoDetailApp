import { cn } from '@/lib/utils/cn';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-ui-skeleton', className)}
      {...props}
    />
  );
}

export { Skeleton };

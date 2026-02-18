import * as React from 'react';
import { cn } from '@/lib/utils/cn';

const buttonVariants = {
  variant: {
    default: 'bg-ui-text text-ui-bg hover:bg-ui-text/90',
    destructive: 'bg-red-600 text-white hover:bg-red-700',
    outline: 'border border-ui-border bg-ui-bg text-ui-text-secondary hover:bg-ui-bg-hover',
    secondary: 'bg-ui-bg-muted text-ui-text hover:bg-ui-bg-muted/80',
    ghost: 'hover:bg-ui-bg-hover text-ui-text-secondary',
    link: 'text-blue-600 underline-offset-4 hover:underline',
  },
  size: {
    default: 'h-9 px-4 py-2',
    sm: 'h-8 px-3 text-xs',
    lg: 'h-10 px-6',
    icon: 'h-9 w-9',
  },
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof buttonVariants.variant;
  size?: keyof typeof buttonVariants.size;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
          buttonVariants.variant[variant],
          buttonVariants.size[size],
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };

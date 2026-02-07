import * as React from 'react';
import { cn } from '@/lib/utils/cn';

const buttonVariants = {
  variant: {
    default: 'bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200',
    destructive: 'bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600',
    outline: 'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700',
    secondary: 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700',
    ghost: 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300',
    link: 'text-blue-600 dark:text-blue-400 underline-offset-4 hover:underline',
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
          'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 dark:focus-visible:ring-gray-600 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
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

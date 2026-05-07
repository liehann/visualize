import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default:
          'border-border-strong bg-bg-panel text-fg-muted',
        success:
          'border-success/30 bg-success/15 text-success',
        danger:
          'border-danger/30 bg-danger/15 text-danger',
        warn:
          'border-warn/30 bg-warn/15 text-warn',
        accent:
          'border-accent/30 bg-accent/15 text-accent',
        outline: 'border-border bg-transparent text-fg-muted',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { badgeVariants };

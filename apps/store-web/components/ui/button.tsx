import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: 'border border-slate-950 bg-slate-950 text-slate-50 hover:bg-slate-800',
        destructive:
          'border border-red-700 bg-red-700 text-white hover:bg-red-800 focus-visible:ring-red-200',
        outline:
          'border border-slate-300 bg-white text-slate-900 shadow-none hover:bg-slate-100',
        secondary:
          'border border-slate-300 bg-slate-100 text-slate-900 hover:bg-slate-200',
        ghost:
          'border border-transparent bg-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-900',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default:
          'h-[var(--erp-control-h)] px-[var(--erp-control-px)] py-[var(--erp-control-py)] has-[>svg]:px-3',
        sm:
          'h-[var(--erp-control-h-sm)] rounded-md gap-1.5 px-2.5 has-[>svg]:px-2',
        lg: 'h-9 rounded-md px-5 has-[>svg]:px-3.5',
        icon: 'size-[var(--erp-control-h)]',
        'icon-sm': 'size-[var(--erp-control-h-sm)]',
        'icon-lg': 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };

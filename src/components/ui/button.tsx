import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out outline-none disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'border border-primary/90 bg-primary text-primary-foreground shadow-[0_8px_20px_-12px_var(--primary)] hover:-translate-y-px hover:bg-[var(--primary-600)] hover:shadow-[0_12px_26px_-14px_var(--primary)]',
        secondary:
          'border border-border bg-card text-foreground shadow-sm hover:-translate-y-px hover:border-primary/30 hover:bg-accent/60',
        outline:
          'border border-border bg-background/70 text-foreground shadow-sm backdrop-blur-sm hover:border-primary/35 hover:bg-accent/55',
        ghost: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        destructive:
          'border border-destructive/90 bg-destructive text-destructive-foreground shadow-sm hover:-translate-y-px hover:brightness-95',
        glass:
          'border border-border/80 bg-card/95 text-foreground shadow-[0_12px_36px_-22px_rgba(15,31,53,.55)] supports-[backdrop-filter:blur(1px)]:border-white/45 supports-[backdrop-filter:blur(1px)]:bg-white/55 supports-[backdrop-filter:blur(1px)]:backdrop-blur-xl supports-[backdrop-filter:blur(1px)]:hover:bg-white/70 dark:supports-[backdrop-filter:blur(1px)]:border-white/12 dark:supports-[backdrop-filter:blur(1px)]:bg-white/8 dark:supports-[backdrop-filter:blur(1px)]:hover:bg-white/12',
      },
      size: {
        sm: 'h-9 rounded-lg px-3 text-xs [&_svg]:size-4',
        default: 'h-10 px-4 [&_svg]:size-4',
        lg: 'h-11 px-5 text-sm [&_svg]:size-[18px]',
        icon: 'size-10 p-0 [&_svg]:size-[18px]',
        'icon-sm': 'size-9 rounded-lg p-0 [&_svg]:size-4',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={!asChild ? disabled || loading : undefined}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <LoaderCircle className="animate-spin" aria-hidden />}
        {children}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };

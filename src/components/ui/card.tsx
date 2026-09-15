import * as React from 'react';
import { cn } from '@/lib/utils';

type CardVariant = 'default' | 'soft' | 'glass' | 'flat';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

const variantClasses: Record<CardVariant, string> = {
  default:
    'border border-border/85 bg-card/95 shadow-[0_1px_2px_rgba(15,31,53,.045),0_16px_36px_-30px_rgba(15,31,53,.45)]',
  soft: 'border border-border/65 bg-secondary/55 shadow-sm',
  glass:
    'border border-border/80 bg-card/95 shadow-[0_20px_60px_-34px_rgba(15,31,53,.65)] supports-[backdrop-filter:blur(1px)]:border-white/55 supports-[backdrop-filter:blur(1px)]:bg-white/68 supports-[backdrop-filter:blur(1px)]:backdrop-blur-2xl dark:supports-[backdrop-filter:blur(1px)]:border-white/10 dark:supports-[backdrop-filter:blur(1px)]:bg-white/7',
  flat: 'border border-border/75 bg-card/70',
};

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <div ref={ref} className={cn('rounded-2xl text-card-foreground', variantClasses[variant], className)} {...props} />
  ),
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-1.5 p-5 sm:p-6', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-base font-semibold leading-tight tracking-[-0.02em]', className)} {...props} />
  ),
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm leading-relaxed text-muted-foreground', className)} {...props} />
  ),
);
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('px-5 pb-5 sm:px-6 sm:pb-6', className)} {...props} />,
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center gap-3 px-5 pb-5 sm:px-6 sm:pb-6', className)} {...props} />
  ),
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };

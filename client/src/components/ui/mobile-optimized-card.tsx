import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { useMobile } from '@/hooks/use-mobile';

const MobileOptimizedCard = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    variant?: 'default' | 'interactive' | 'compact';
  }
>(({ className, variant = 'default', ...props }, ref) => {
  const isMobile = useMobile();

  return (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border bg-card text-card-foreground shadow-sm',
        // Mobile optimizations
        isMobile && [
          'touch-target', // Ensure touch-friendly sizing
          'active:scale-95 transition-transform duration-150', // Touch feedback
          variant === 'interactive' && 'hover:shadow-md active:shadow-lg',
          variant === 'compact' && 'p-3 space-y-2',
        ],
        // Desktop styling
        !isMobile && [
          variant === 'interactive' && 'hover:shadow-md transition-shadow duration-200',
          'p-6 space-y-4',
        ],
        className
      )}
      {...props}
    />
  );
});

MobileOptimizedCard.displayName = 'MobileOptimizedCard';

const MobileOptimizedCardHeader = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const isMobile = useMobile();

  return (
    <div
      ref={ref}
      className={cn(
        'flex flex-col space-y-1.5',
        isMobile ? 'pb-2' : 'pb-4',
        className
      )}
      {...props}
    />
  );
});

MobileOptimizedCardHeader.displayName = 'MobileOptimizedCardHeader';

const MobileOptimizedCardTitle = forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => {
  const isMobile = useMobile();

  return (
    <h3
      ref={ref}
      className={cn(
        'font-semibold leading-none tracking-tight',
        isMobile ? 'text-base' : 'text-lg',
        className
      )}
      {...props}
    />
  );
});

MobileOptimizedCardTitle.displayName = 'MobileOptimizedCardTitle';

const MobileOptimizedCardDescription = forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  const isMobile = useMobile();

  return (
    <p
      ref={ref}
      className={cn(
        'text-muted-foreground',
        isMobile ? 'text-xs' : 'text-sm',
        className
      )}
      {...props}
    />
  );
});

MobileOptimizedCardDescription.displayName = 'MobileOptimizedCardDescription';

const MobileOptimizedCardContent = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const isMobile = useMobile();

  return (
    <div
      ref={ref}
      className={cn(
        isMobile ? 'space-y-2' : 'space-y-4',
        className
      )}
      {...props}
    />
  );
});

MobileOptimizedCardContent.displayName = 'MobileOptimizedCardContent';

const MobileOptimizedCardFooter = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const isMobile = useMobile();

  return (
    <div
      ref={ref}
      className={cn(
        'flex items-center',
        isMobile ? 'pt-2 gap-2' : 'pt-4 gap-4',
        className
      )}
      {...props}
    />
  );
});

MobileOptimizedCardFooter.displayName = 'MobileOptimizedCardFooter';

export {
  MobileOptimizedCard,
  MobileOptimizedCardHeader,
  MobileOptimizedCardTitle,
  MobileOptimizedCardDescription,
  MobileOptimizedCardContent,
  MobileOptimizedCardFooter,
};
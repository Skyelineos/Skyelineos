import { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * EmptyState — canonical "no data yet" panel.
 *
 * Renders inside a brand-beige card with a centered icon, headline,
 * supporting copy, and one or two CTAs. Pass the primary CTA as `action`
 * (it should already be styled with the brand-gold Button variant) and the
 * secondary CTA (e.g. "Clear filters") as `secondaryAction`.
 *
 * Use in place of ad-hoc empty cards so every "nothing here yet" moment
 * across the app reads with the same rhythm.
 */
interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <Card className={cn('bg-brand-beige border-brand-light-gray-blue', className)}>
      <CardContent className="text-center py-14 px-6">
        {icon ? (
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-white text-brand-gold">
            {icon}
          </div>
        ) : null}
        <h3 className="font-heading text-xl font-semibold text-brand-black">
          {title}
        </h3>
        {description ? (
          <p className="mt-2 text-sm font-sans text-muted-foreground max-w-md mx-auto">
            {description}
          </p>
        ) : null}
        {(action || secondaryAction) ? (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {action}
            {secondaryAction}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default EmptyState;

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * PageHeader — canonical page header for all main pages.
 *
 * Design contract (do not deviate — brand tokens live in
 * client/src/index.css + tailwind.config.ts):
 *   - Title:    font-heading (Cormorant Garamond), text-2xl/3xl, brand-black
 *   - Subtitle: font-sans (Inter), muted foreground
 *   - Actions:  live to the right on ≥sm, wrap below on phones so the CTA
 *               never crashes into the title at 360px.
 *
 * Adopting this component in place of ad-hoc <h1 className="text-3xl font-bold
 * text-gray-900"> keeps typography, spacing, and stack order consistent
 * across every page and gives us one spot to tune later.
 */
interface PageHeaderProps {
  /** Page title. Rendered as an <h1> in Cormorant Garamond. */
  title: string;
  /** Optional supporting copy under the title (Inter, muted). */
  subtitle?: string;
  /** Optional right-side actions — usually the primary "Add / New" gold CTA. */
  actions?: ReactNode;
  /** Optional leading icon or badge slot rendered next to the title. */
  icon?: ReactNode;
  /** Extra className merged onto the outer wrapper. */
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  icon,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        // On phones the actions wrap under the title so nothing overflows;
        // ≥sm they align to the right of the title block.
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        {icon ? (
          <span className="flex-shrink-0 text-brand-gold" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold text-brand-black tracking-tight truncate">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1 text-sm font-sans text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export default PageHeader;

/**
 * Full-viewport branded loading state.
 *
 * Drop in anywhere a route, role gate, or major data fetch is loading so the
 * user never sees a literal blank screen. The card sits centered, animates a
 * brand-gold spinner, and shows the page title we're about to render — that
 * single line of context turns a "is it stuck?" moment into an "OK it's
 * loading the Estimates page" moment.
 *
 * Use this over MinimalSpinner when:
 *   - The page is taking the whole viewport (route-level, RoleGuard)
 *   - There is no other layout chrome around the spinner to anchor the eye
 *
 * MinimalSpinner stays appropriate for inline use inside an already-rendered
 * page (loading a single card / panel).
 */

import { Loader2 } from 'lucide-react';

interface Props {
  title?: string;
  /** When provided, replaces the title text — for "Loading <Estimates>" etc. */
  subtitle?: string;
  /** Optional className for the outer container — defaults to full-viewport. */
  className?: string;
}

export function PageLoader({ title = 'Loading', subtitle, className }: Props) {
  return (
    <div
      className={
        className ||
        'flex items-center justify-center min-h-screen w-full bg-gray-50/40 p-6'
      }
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center text-center max-w-sm">
        <div className="w-12 h-12 rounded-full border-2 border-[#C9A96E]/30 flex items-center justify-center mb-3">
          <Loader2 className="w-6 h-6 animate-spin text-[#C9A96E]" />
        </div>
        <p className="font-heading text-base text-gray-800">{title}…</p>
        {subtitle && (
          <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

export default PageLoader;

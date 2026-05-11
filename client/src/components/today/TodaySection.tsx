import { ReactNode } from 'react';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronRight } from 'lucide-react';

interface TodaySectionProps {
  title: string;
  count: number;
  icon?: ReactNode;
  emptyState?: string;
  children?: ReactNode;
  viewAllHref?: string;
  viewAllLabel?: string;
  // Optional accent color for the title icon (matches role/section semantics)
  accentClass?: string;
}

export function TodaySection({
  title, count, icon, emptyState, children, viewAllHref, viewAllLabel = 'View all',
  accentClass = 'text-[#C9A96E]',
}: TodaySectionProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          {icon && <span className={accentClass}>{icon}</span>}
          <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
          {count > 0 && <Badge variant="secondary" className="text-[10px] h-4">{count}</Badge>}
        </div>
        {viewAllHref && (
          <Link href={viewAllHref} className="text-xs text-gray-500 hover:text-[#C9A96E] flex items-center gap-0.5">
            {viewAllLabel} <ChevronRight className="w-3 h-3" />
          </Link>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        {count === 0 ? (
          <p className="text-xs text-gray-400 italic py-3">
            {emptyState || 'All caught up.'}
          </p>
        ) : (
          <div className="space-y-1.5">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Reusable row for inside sections ────────────────────────────────────────

interface TodayRowProps {
  primary: ReactNode;
  secondary?: ReactNode;
  meta?: ReactNode;
  href?: string;
  onClick?: () => void;
  highlight?: boolean; // urgent / overdue
}

export function TodayRow({ primary, secondary, meta, href, onClick, highlight }: TodayRowProps) {
  const baseClass = `flex items-start justify-between gap-3 py-2 px-2 -mx-2 rounded transition-colors ${
    highlight ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'
  }`;

  const content = (
    <>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-800 truncate">{primary}</div>
        {secondary && <div className="text-xs text-gray-500 truncate mt-0.5">{secondary}</div>}
      </div>
      {meta && <div className="text-xs text-gray-500 shrink-0 mt-0.5">{meta}</div>}
    </>
  );

  if (href) {
    return <Link href={href} className={baseClass}>{content}</Link>;
  }
  if (onClick) {
    return <button onClick={onClick} className={`${baseClass} w-full text-left`}>{content}</button>;
  }
  return <div className={baseClass}>{content}</div>;
}

// ─── Greeting helper ─────────────────────────────────────────────────────────

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function todayLabel(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

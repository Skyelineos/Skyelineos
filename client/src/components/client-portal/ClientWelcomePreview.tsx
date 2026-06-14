// Polished welcome / pre-launch state for the client portal. Shown when the
// homeowner has no project yet, or their project exists but isn't set up (no
// schedule, no progress, no start date). Gives a warm welcome plus a preview of
// every feature they'll be able to track once the build is rolling — so the
// portal feels alive and valuable from day one instead of empty.

import {
  LayoutDashboard, CalendarClock, DollarSign, Palette, ClipboardList,
  ClipboardCheck, FileText, MessageSquare, Image, Sparkles, ArrowRight,
  MapPin, PenTool, HardHat, type LucideIcon,
} from 'lucide-react';

const GOLD = '#C9A96E';
const BLACK = '#141414';

interface FeatureTile {
  key: string;
  icon: LucideIcon;
  title: string;
  description: string;
}

// Mirrors the portal TABS so each tile maps to a real destination.
const FEATURES: FeatureTile[] = [
  { key: 'dashboard',     icon: LayoutDashboard, title: 'Build Progress',    description: 'Live progress, current phase, and your build timeline at a glance.' },
  { key: 'schedule',      icon: CalendarClock,   title: 'Schedule',          description: 'Your estimated build timeline, phase by phase, start to move-in.' },
  { key: 'financials',    icon: DollarSign,      title: 'Financials',        description: 'Contract value, budget, allowances, and your payment history.' },
  { key: 'selections',    icon: Palette,         title: 'Design Selections', description: 'Review and approve every finish and material for your home.' },
  { key: 'change-orders', icon: ClipboardList,   title: 'Change Orders',     description: 'See and approve any changes to scope or cost — full transparency.' },
  { key: 'site-log',      icon: ClipboardCheck,  title: 'Site Log',          description: 'Daily updates from the field as your home comes together.' },
  { key: 'documents',     icon: FileText,        title: 'Documents',         description: 'Contracts, plans, warranties, and project paperwork in one place.' },
  { key: 'messages',      icon: MessageSquare,   title: 'Messages',          description: 'A direct line to your Skyeline team, all in one thread.' },
  { key: 'photos',        icon: Image,           title: 'Photos',            description: 'A growing gallery of your home being built, week by week.' },
];

const STEPS = [
  { icon: PenTool,  title: 'We finalize your estimate', body: 'Your scope, allowances, and pricing get locked in.' },
  { icon: Palette,  title: 'You review your selections', body: 'Approve finishes and materials right here in the portal.' },
  { icon: HardHat,  title: 'We break ground',           body: 'Progress, photos, and field updates start flowing in.' },
];

interface Props {
  clientFirstName?: string;
  projectName?: string;
  projectAddress?: string;
  hasProject: boolean;
  onNavigate: (tab: string) => void;
}

export function ClientWelcomePreview({ clientFirstName, projectName, projectAddress, hasProject, onNavigate }: Props) {
  const name = clientFirstName?.trim();

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-2xl px-6 py-10 sm:px-10 sm:py-14"
        style={{ background: `linear-gradient(135deg, ${BLACK} 0%, #1f1d1a 55%, #2a2419 100%)` }}
      >
        {/* Soft gold glow accent */}
        <div
          className="pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-full opacity-25 blur-3xl"
          style={{ backgroundColor: GOLD }}
        />
        <div className="relative max-w-2xl">
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-widest"
            style={{ backgroundColor: 'rgba(201,169,110,0.15)', color: GOLD, letterSpacing: '0.18em' }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Skyeline Homes · Project Portal
          </div>

          <h1 className="mt-5 text-3xl sm:text-4xl font-bold text-white leading-tight">
            Welcome{name ? `, ${name}` : ''}.
          </h1>

          <p className="mt-3 text-base sm:text-lg text-gray-300 leading-relaxed">
            {hasProject ? (
              <>We're getting <span className="text-white font-medium">{projectName || 'your project'}</span> set up.
                This is your home base — every milestone, selection, dollar, and photo will live right here.</>
            ) : (
              <>This is your home base for building with Skyeline. Once your project kicks off, every milestone,
                selection, dollar, and photo will live right here.</>
            )}
          </p>

          {projectAddress && (
            <div className="mt-4 inline-flex items-center gap-2 text-sm text-gray-300">
              <MapPin className="h-4 w-4" style={{ color: GOLD }} />
              {projectAddress}
            </div>
          )}

          <p className="mt-6 text-sm tracking-wide" style={{ color: GOLD }}>
            Building Extraordinary Homes Through Extraordinary Experiences
          </p>
        </div>
      </div>

      {/* ── What happens next ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <div key={step.title} className="relative rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: 'rgba(201,169,110,0.14)' }}
                >
                  <Icon className="h-5 w-5" style={{ color: GOLD }} />
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  Step {i + 1}
                </span>
              </div>
              <p className="mt-3 text-sm font-semibold text-gray-900">{step.title}</p>
              <p className="mt-1 text-xs text-gray-500 leading-relaxed">{step.body}</p>
            </div>
          );
        })}
      </div>

      {/* ── Feature preview tiles ────────────────────────────────────────── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
            What you'll be able to track
          </h2>
          <span className="text-xs text-gray-400">Tap to explore</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(feat => {
            const Icon = feat.icon;
            return (
              <button
                key={feat.key}
                onClick={() => onNavigate(feat.key)}
                className="group flex flex-col items-start rounded-xl border border-gray-200 bg-white p-5 text-left transition-all hover:-translate-y-0.5 hover:border-[#C9A96E]/50 hover:shadow-md"
              >
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-xl transition-colors"
                  style={{ backgroundColor: 'rgba(201,169,110,0.12)' }}
                >
                  <Icon className="h-5 w-5" style={{ color: GOLD }} />
                </div>
                <p className="mt-4 text-sm font-semibold text-gray-900">{feat.title}</p>
                <p className="mt-1 flex-1 text-xs text-gray-500 leading-relaxed">{feat.description}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-gray-400 group-hover:text-[#8a6a3a]">
                  Open <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-center text-xs text-gray-400 pt-2">
        Questions in the meantime? Use the{' '}
        <button onClick={() => onNavigate('messages')} className="font-medium text-[#8a6a3a] hover:underline">
          Messages
        </button>{' '}
        tab to reach your Skyeline team anytime.
      </p>
    </div>
  );
}

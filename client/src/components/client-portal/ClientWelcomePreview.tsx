// Polished welcome / pre-launch state for the client portal. Shown when the
// homeowner has no project yet, or their project exists but isn't set up (no
// schedule, no progress, no start date). Gives a warm welcome plus a preview of
// every feature they'll be able to track once the build is rolling — so the
// portal feels alive and valuable from day one instead of empty.

import { useState } from 'react';
import {
  LayoutDashboard,
  CalendarClock,
  DollarSign,
  Palette,
  ClipboardList,
  ClipboardCheck,
  FileText,
  MessageSquare,
  Image,
  Sparkles,
  ArrowRight,
  MapPin,
  PenTool,
  HardHat,
  ChevronDown,
  type LucideIcon,
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
  {
    key: 'dashboard',
    icon: LayoutDashboard,
    title: 'Build Progress',
    description:
      'Live progress, current phase, and your build timeline at a glance.',
  },
  {
    key: 'schedule',
    icon: CalendarClock,
    title: 'Schedule',
    description:
      'Your estimated build timeline, phase by phase, start to move-in.',
  },
  {
    key: 'financials',
    icon: DollarSign,
    title: 'Financials',
    description:
      'Contract value, budget, allowances, and your payment history.',
  },
  {
    key: 'selections',
    icon: Palette,
    title: 'Design Selections',
    description: 'Review and approve every finish and material for your home.',
  },
  {
    key: 'change-orders',
    icon: ClipboardList,
    title: 'Change Orders',
    description:
      'See and approve any changes to scope or cost — full transparency.',
  },
  {
    key: 'site-log',
    icon: ClipboardCheck,
    title: 'Site Log',
    description: 'Daily updates from the field as your home comes together.',
  },
  {
    key: 'documents',
    icon: FileText,
    title: 'Documents',
    description:
      'Contracts, plans, warranties, and project paperwork in one place.',
  },
  {
    key: 'messages',
    icon: MessageSquare,
    title: 'Messages',
    description: 'A direct line to your Skyeline team, all in one thread.',
  },
  {
    key: 'photos',
    icon: Image,
    title: 'Photos',
    description: 'A growing gallery of your home being built, week by week.',
  },
];

const STEPS = [
  {
    icon: PenTool,
    title: 'We match you with an architect',
    body: 'We discuss your vision and match you with the best architect partner to design your dream home — walking you through the entire process.',
  },
  {
    icon: FileText,
    title: 'We finalize your estimate',
    body: 'Once your plans are ready, we lock in scope, allowances, and pricing.',
  },
  {
    icon: Palette,
    title: 'You review your selections',
    body: 'Approve finishes and materials right here in the portal.',
  },
  {
    icon: HardHat,
    title: 'We break ground',
    body: 'Progress, photos, and field updates start flowing in.',
  },
];

interface Props {
  clientFirstName?: string;
  projectName?: string;
  projectAddress?: string;
  hasProject: boolean;
  onNavigate: (tab: string) => void;
}

export function ClientWelcomePreview({
  clientFirstName,
  projectName,
  projectAddress,
  hasProject,
  onNavigate,
}: Props) {
  const name = clientFirstName?.trim();
  // Feature preview is collapsed by default so the page stays short and the
  // "Explore Skyeline" content below sits within reach instead of being buried
  // under nine full-height tiles.
  const [showFeatures, setShowFeatures] = useState(false);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-2xl px-6 py-10 sm:px-10 sm:py-14"
        style={{
          background: `linear-gradient(135deg, ${BLACK} 0%, #1f1d1a 55%, #2a2419 100%)`,
        }}
      >
        {/* Soft gold glow accent */}
        <div
          className="pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-full opacity-25 blur-3xl"
          style={{ backgroundColor: GOLD }}
        />
        <div className="relative max-w-2xl">
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-widest"
            style={{
              backgroundColor: 'rgba(201,169,110,0.15)',
              color: GOLD,
              letterSpacing: '0.18em',
            }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Skyeline Homes · Project Portal
          </div>

          <h1 className="mt-5 text-3xl sm:text-4xl font-bold text-white leading-tight">
            Welcome{name ? `, ${name}` : ''}.
          </h1>

          <p className="mt-3 text-base sm:text-lg text-gray-300 leading-relaxed">
            {hasProject ? (
              <>
                We're getting{' '}
                <span className="text-white font-medium">
                  {projectName || 'your project'}
                </span>{' '}
                set up. This is your home base — every milestone, selection,
                dollar, and photo will live right here.
              </>
            ) : (
              <>
                This is your home base for building with Skyeline. Once your
                project kicks off, every milestone, selection, dollar, and photo
                will live right here.
              </>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <div
              key={step.title}
              className="relative rounded-xl border border-gray-200 bg-white p-4"
            >
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
              <p className="mt-3 text-sm font-semibold text-gray-900">
                {step.title}
              </p>
              <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                {step.body}
              </p>
            </div>
          );
        })}
      </div>

      {/* ── Design Discovery — the one meaningful thing the homeowner can do
          right now, while we get the project set up. Routes straight into the
          guided Style Discovery flow (Design Studio tab). ─────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-[#C9A96E]/40 bg-gradient-to-br from-[#FBF7F0] to-[#F1E7D6] p-6 sm:p-7">
        <div
          className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full opacity-40 blur-3xl"
          style={{ backgroundColor: GOLD }}
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-start gap-4 min-w-0">
            <div
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl shadow-sm"
              style={{ backgroundColor: GOLD }}
            >
              <Sparkles className="h-6 w-6" style={{ color: BLACK }} />
            </div>
            <div className="min-w-0">
              <span
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest"
                style={{
                  backgroundColor: 'rgba(201,169,110,0.18)',
                  color: '#8a6a3a',
                }}
              >
                In the meantime
              </span>
              <h3 className="mt-2 text-lg font-bold text-gray-900">
                Let's start your Design Discovery
              </h3>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-gray-600">
                While we get your project set up, explore inspiring homes,
                materials, and finishes. It helps us understand your vision and
                personalize your build from day one.
              </p>
            </div>
          </div>
          <div className="flex-shrink-0">
            <button
              onClick={() => onNavigate('design')}
              className="inline-flex items-center gap-1.5 rounded-lg px-5 py-2.5 text-sm font-semibold shadow-sm transition-transform hover:-translate-y-0.5"
              style={{ backgroundColor: GOLD, color: BLACK }}
            >
              Start Design Discovery
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Feature preview tiles ────────────────────────────────────────────
          Collapsed by default: a row of compact, still-tappable chips keeps the
          page short so "Explore Skyeline" stays in view. Tapping the header
          expands the full descriptive tiles for homeowners who want detail. */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
        <button
          onClick={() => setShowFeatures((v) => !v)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
              What you'll be able to track
            </h2>
            <p className="mt-0.5 text-xs text-gray-400">
              {FEATURES.length} things you'll follow once your build is live —
              tap to {showFeatures ? 'collapse' : 'explore'}
            </p>
          </div>
          <ChevronDown
            className={`h-5 w-5 flex-shrink-0 text-gray-400 transition-transform ${showFeatures ? 'rotate-180' : ''}`}
          />
        </button>

        {showFeatures ? (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((feat) => {
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
                  <p className="mt-4 text-sm font-semibold text-gray-900">
                    {feat.title}
                  </p>
                  <p className="mt-1 flex-1 text-xs text-gray-500 leading-relaxed">
                    {feat.description}
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-gray-400 group-hover:text-[#8a6a3a]">
                    Open{' '}
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {FEATURES.map((feat) => {
              const Icon = feat.icon;
              return (
                <button
                  key={feat.key}
                  onClick={() => onNavigate(feat.key)}
                  className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-[#C9A96E]/50 hover:text-[#8a6a3a]"
                >
                  <Icon className="h-3.5 w-3.5" style={{ color: GOLD }} />
                  {feat.title}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-center text-xs text-gray-400 pt-2">
        Questions in the meantime? Use the{' '}
        <button
          onClick={() => onNavigate('messages')}
          className="font-medium text-[#8a6a3a] hover:underline"
        >
          Messages
        </button>{' '}
        tab to reach your Skyeline team anytime.
      </p>
    </div>
  );
}

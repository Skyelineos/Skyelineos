// Per-tab "what to expect" fill-in page shown in the client portal BEFORE a
// project/plan set exists. Each tab gets a tailored explanation + a muted
// template mock of what it'll look like once plans are finalized, plus a
// standing call-to-action to start the inspiration board in the meantime.

import {
  CalendarClock, DollarSign, ClipboardList, ClipboardCheck, FileText,
  MessageSquare, Sparkles, ArrowRight, Lock,
} from 'lucide-react';
import { CLIENT_PHASES } from '@/lib/clientPhases';

const GOLD = '#C9A96E';

type TabKey = 'schedule' | 'financials' | 'change-orders' | 'site-log' | 'documents' | 'messages';

interface Props {
  tab: TabKey;
  onStartInspiration: () => void;
}

const META: Record<TabKey, { icon: any; title: string; blurb: string }> = {
  schedule: {
    icon: CalendarClock,
    title: 'Your Build Schedule',
    blurb: 'Once your plans are finalized, your full build timeline appears here — every major milestone from foundation to move-in, with target dates you can follow in real time.',
  },
  financials: {
    icon: DollarSign,
    title: 'Your Financials',
    blurb: 'Your contract, allowances, change orders, and every payment milestone — complete transparency on where your investment goes, updated as your build progresses.',
  },
  'change-orders': {
    icon: ClipboardList,
    title: 'Change Orders',
    blurb: 'Any change to scope or cost shows up here for your review, with the budget impact laid out clearly — so nothing happens to your contract without your approval.',
  },
  'site-log': {
    icon: ClipboardCheck,
    title: 'Site Log',
    blurb: 'Daily updates straight from the field — what happened on site, who was there, and photos as it happens — so you always know how your home is coming along.',
  },
  documents: {
    icon: FileText,
    title: 'Documents',
    blurb: 'Your contract, plans, permits, selections, and warranties — organized in one place and available to download anytime.',
  },
  messages: {
    icon: MessageSquare,
    title: 'Messages',
    blurb: 'A direct line to your Skyeline team. Once your project starts, every conversation, question, and answer lives here in one thread.',
  },
};

// ── muted skeleton bar helper ──────────────────────────────────────────────
const Bar = ({ w = 'w-full', h = 'h-3' }: { w?: string; h?: string }) =>
  <div className={`${w} ${h} rounded bg-gray-200/80`} />;

function Mock({ tab }: { tab: TabKey }) {
  if (tab === 'schedule') {
    return (
      <div className="space-y-3">
        <div className="flex items-end gap-1">
          {CLIENT_PHASES.map((p, i) => (
            <div key={p} className="flex-1 flex flex-col items-center gap-1.5">
              <div className="w-full h-1.5 rounded-sm" style={{ backgroundColor: i < 2 ? GOLD : '#e5e7eb' }} />
              <span className="text-[9px] text-gray-400 text-center leading-tight hidden sm:block">{p}</span>
            </div>
          ))}
        </div>
        <div className="space-y-2 pt-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-gray-200" />
              <Bar w={i === 0 ? 'w-2/3' : i === 1 ? 'w-1/2' : 'w-3/4'} />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (tab === 'financials') {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="rounded-lg border border-gray-100 p-3 space-y-2">
              <Bar w="w-12" h="h-2" />
              <Bar w="w-16" h="h-4" />
            </div>
          ))}
        </div>
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full w-1/4 rounded-full" style={{ backgroundColor: `${GOLD}66` }} />
        </div>
      </div>
    );
  }
  // generic list mock — change-orders / site-log / documents / messages
  const rows = tab === 'messages' ? 4 : 3;
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`flex items-center gap-3 rounded-lg border border-gray-100 p-3 ${tab === 'messages' && i % 2 ? 'ml-8' : tab === 'messages' ? 'mr-8' : ''}`}>
          <div className="w-8 h-8 rounded-lg bg-gray-100 flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Bar w={i % 2 ? 'w-1/2' : 'w-2/3'} h="h-2.5" />
            <Bar w={i % 2 ? 'w-3/4' : 'w-1/3'} h="h-2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ClientTabPreview({ tab, onStartInspiration }: Props) {
  const m = META[tab];
  const Icon = m.icon;
  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Heading */}
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(201,169,110,0.12)' }}>
          <Icon className="h-5 w-5" style={{ color: GOLD }} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{m.title}</h1>
          <p className="mt-1 text-sm text-gray-500 leading-relaxed max-w-2xl">{m.blurb}</p>
        </div>
      </div>

      {/* Template preview */}
      <div className="relative rounded-xl border border-gray-200 bg-white p-5 overflow-hidden">
        <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          <Lock className="h-3 w-3" /> Preview
        </div>
        <div className="opacity-60 pointer-events-none select-none pt-4">
          <Mock tab={tab} />
        </div>
        <p className="mt-4 text-center text-xs text-gray-400">
          This unlocks with live data once your plans are finalized.
        </p>
      </div>

      {/* Meantime CTA */}
      <button
        onClick={onStartInspiration}
        className="group w-full text-left rounded-xl border border-[#C9A96E]/40 bg-[#C9A96E]/[0.06] p-5 flex items-center gap-4 hover:bg-[#C9A96E]/[0.1] transition-colors"
      >
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: 'rgba(201,169,110,0.18)' }}>
          <Sparkles className="h-5 w-5" style={{ color: GOLD }} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900">In the meantime, start your selections &amp; inspiration</p>
          <p className="text-xs text-gray-500 mt-0.5">Upload photos of finishes and styles you love so your designer can start shaping your vision.</p>
        </div>
        <ArrowRight className="h-4 w-4 text-[#8a6a3a] transition-transform group-hover:translate-x-0.5" />
      </button>
    </div>
  );
}

// Step 3 of Design Style Discovery — preliminary "Your Design Profile" card.
// Placeholder logic for now (see computeDesignProfile); will be AI-refined later.

import { Sparkles, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DesignProfile } from '@/lib/styleDiscovery';

const Chips = ({ items }: { items: string[] }) => (
  <div className="flex flex-wrap gap-1.5">
    {items.map((t, i) => (
      <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-[#fdf8f0] border border-[#eaddc4] text-[#8a6a3a] capitalize">{t}</span>
    ))}
  </div>
);

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-1 sm:gap-3 py-2 border-t border-gray-100">
    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-0.5">{label}</span>
    <div>{children}</div>
  </div>
);

export function StyleProfileCard({ profile, onRetake }: { profile: DesignProfile; onRetake?: () => void }) {
  const headline = profile.secondaryInfluence
    ? `${profile.primaryStyle} with ${profile.secondaryInfluence} influences`
    : profile.primaryStyle;

  return (
    <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white">
      <div className="p-5" style={{ background: 'linear-gradient(135deg, #1c1c1c 0%, #141414 100%)' }}>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" style={{ color: '#C9A96E' }} />
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#C9A96E' }}>Your Design Profile</span>
        </div>
        <h3 className="text-xl font-bold text-white mt-1">{headline}</h3>
        <p className="text-xs text-white/60 mt-1">A starting point — your designer will refine this with you.</p>
      </div>

      <div className="p-5">
        <Row label="Primary Style"><span className="text-sm font-medium text-gray-900">{profile.primaryStyle}</span></Row>
        {profile.secondaryInfluence && (
          <Row label="Secondary"><span className="text-sm text-gray-700">{profile.secondaryInfluence}</span></Row>
        )}
        {profile.materials.length > 0 && <Row label="Materials"><Chips items={profile.materials} /></Row>}
        {profile.colors.length > 0 && <Row label="Colors"><Chips items={profile.colors} /></Row>}
        {profile.mood.length > 0 && <Row label="Mood"><Chips items={profile.mood} /></Row>}
        {profile.recommended.length > 0 && (
          <Row label="Next Up">
            <ul className="text-sm text-gray-700 space-y-0.5">
              {profile.recommended.map((r, i) => <li key={i}>• {r}</li>)}
            </ul>
          </Row>
        )}

        {onRetake && (
          <div className="pt-4">
            <Button variant="outline" size="sm" onClick={onRetake} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" /> Start over
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

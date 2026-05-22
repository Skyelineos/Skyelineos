import React from 'react';
import { Star } from 'lucide-react';

interface Props {
  designerName?: string;
  note?: string | null;
  variant?: 'inline' | 'card';
}

/**
 * Client-facing badge that shows up on the recommended option inside the
 * Selections view. Used in ClientSelectionsTimeline.
 */
export default function RecommendationBadge({ designerName, note, variant = 'inline' }: Props) {
  if (variant === 'card') {
    return (
      <div className="rounded-lg bg-[#FBF7EE] border border-[#C9A96E]/40 p-3 mt-2">
        <div className="flex items-center gap-1.5 mb-1">
          <Star className="w-4 h-4 text-[#C9A96E] fill-[#C9A96E]" />
          <span className="text-xs font-semibold text-[#8a6a3a] uppercase tracking-wide">
            {designerName ? `${designerName} recommends this` : 'Skyeline Design recommends this'}
          </span>
        </div>
        {note && <p className="text-sm text-gray-700 italic leading-snug">&ldquo;{note}&rdquo;</p>}
      </div>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#8a6a3a] bg-[#FBF7EE] border border-[#C9A96E]/40 rounded-full px-2 py-0.5">
      <Star className="w-3 h-3 fill-[#C9A96E] text-[#C9A96E]" />
      Recommended
    </span>
  );
}

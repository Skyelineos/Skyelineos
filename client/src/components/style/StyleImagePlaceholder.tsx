// Branded placeholder shown wherever a Style Quiz rendering hasn't been uploaded
// yet — so the gallery feels complete (and premium) before real images exist.
// Used by both the admin editor and the client-facing quiz/gallery.

import { ImageIcon } from 'lucide-react';
import { placeholderText } from '@/data/standardStyleQuiz';

interface Props {
  label?: string;        // the option label, e.g. "Modern Farmhouse"
  slotTitle?: string;    // e.g. "Hero View" / "Detail View"
  imageType?: string;    // drives the "coming soon" vs "pending" copy
  className?: string;
  compact?: boolean;     // smaller text for tiny admin thumbnails
}

export function StyleImagePlaceholder({ label, slotTitle, imageType = 'hero', className = '', compact = false }: Props) {
  return (
    <div
      className={`w-full h-full flex flex-col items-center justify-center text-center px-2 ${className}`}
      style={{ background: 'linear-gradient(135deg, #1c1c1c 0%, #141414 100%)' }}
    >
      <ImageIcon className={`${compact ? 'h-3.5 w-3.5 mb-1' : 'h-6 w-6 mb-2'}`} style={{ color: '#C9A96E' }} />
      {label && (
        <p className={`font-semibold leading-tight ${compact ? 'text-[9px]' : 'text-sm'}`} style={{ color: '#C9A96E' }}>
          {label}
        </p>
      )}
      {slotTitle && (
        <p className={`text-white/80 leading-tight ${compact ? 'text-[8px]' : 'text-xs mt-0.5'}`}>{slotTitle}</p>
      )}
      <span
        className={`mt-1 inline-block rounded-full border ${compact ? 'text-[7px] px-1 py-0' : 'text-[10px] px-2 py-0.5 mt-2'}`}
        style={{ borderColor: '#C9A96E55', color: '#C9A96E', letterSpacing: '0.04em' }}
      >
        {placeholderText(imageType)}
      </span>
    </div>
  );
}

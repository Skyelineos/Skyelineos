// 1–5 star rating. Read-only by default; pass onChange to make it editable
// (click a star to set, click the same star again to clear).

import { Star } from 'lucide-react';

interface Props {
  value: number;
  onChange?: (value: number) => void;
  size?: number;
  className?: string;
}

export function StarRating({ value, onChange, size = 14, className }: Props) {
  const editable = !!onChange;
  return (
    <div className={`inline-flex items-center gap-0.5 ${className || ''}`}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          disabled={!editable}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          onClick={editable ? (e) => { e.preventDefault(); e.stopPropagation(); onChange!(n === value ? 0 : n); } : undefined}
          className={editable ? 'cursor-pointer' : 'cursor-default'}
          title={editable ? `${n} star${n > 1 ? 's' : ''}` : (value ? `${value} / 5` : 'Not rated')}
        >
          <Star
            style={{ width: size, height: size }}
            className={n <= value ? 'fill-[#C9A96E] text-[#C9A96E]' : 'text-gray-300'}
          />
        </button>
      ))}
    </div>
  );
}

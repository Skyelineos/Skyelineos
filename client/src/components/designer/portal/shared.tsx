// Designer Portal — shared presentational primitives.
import React, { useRef, useState } from 'react';
import { AlertTriangle, Inbox, Loader2, UploadCloud } from 'lucide-react';

export const GOLD = '#C9A96E';
export const BRAND_BLACK = '#141414';

// ── Status badges ────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  // mood board
  Draft: 'bg-gray-100 text-gray-700',
  'Ready For Review': 'bg-blue-100 text-blue-700',
  'Client Review': 'bg-amber-100 text-amber-700',
  Approved: 'bg-emerald-100 text-emerald-700',
  'Revision Requested': 'bg-red-100 text-red-700',
  'Revision Required': 'bg-red-100 text-red-700',
  // project design status
  'Not Started': 'bg-gray-100 text-gray-700',
  'In Progress': 'bg-blue-100 text-blue-700',
  // selection design status
  notStarted: 'bg-gray-100 text-gray-700',
  inReview: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  ordered: 'bg-indigo-100 text-indigo-700',
  installed: 'bg-emerald-100 text-emerald-800',
  // decision / item status
  pending: 'bg-amber-100 text-amber-700',
  rejected: 'bg-red-100 text-red-700',
  needsRevision: 'bg-orange-100 text-orange-700',
};

const STATUS_LABELS: Record<string, string> = {
  notStarted: 'Not Started',
  inReview: 'In Review',
  approved: 'Approved',
  ordered: 'Ordered',
  installed: 'Installed',
  pending: 'Pending',
  rejected: 'Rejected',
  needsRevision: 'Needs Revision',
};

export function StatusBadge({
  status,
  className = '',
}: {
  status: string;
  className?: string;
}) {
  const color = STATUS_COLORS[status] || 'bg-gray-100 text-gray-700';
  const label = STATUS_LABELS[status] || status;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color} ${className}`}
    >
      {label}
    </span>
  );
}

// ── State helpers ────────────────────────────────────────────────────────────
export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-gray-400">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-red-500">
      <AlertTriangle className="w-5 h-5" />
      <span className="text-sm">{message}</span>
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  hint,
  action,
}: {
  icon?: React.ElementType;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center">
      <Icon className="w-9 h-9 text-gray-300 mx-auto mb-3" />
      <p className="text-gray-600 font-medium">{title}</p>
      {hint && <p className="text-sm text-gray-400 mt-1">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

// ── Drag-and-drop upload dropzone ────────────────────────────────────────────
export function Dropzone({
  onFiles,
  disabled,
  hint = 'Drag & drop files here, or click to browse',
  accept,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  hint?: string;
  accept?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !disabled)
          inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (disabled) return;
        const files = Array.from(e.dataTransfer.files || []);
        if (files.length) onFiles(files);
      }}
      className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors cursor-pointer focus:outline-none ${
        disabled
          ? 'opacity-50 cursor-not-allowed border-gray-200'
          : over
            ? 'border-[#C9A96E] bg-[#C9A96E11]'
            : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <UploadCloud className="w-7 h-7 text-gray-300 mx-auto mb-2" />
      <p className="text-sm text-gray-500">{hint}</p>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length) onFiles(files);
          e.target.value = '';
        }}
      />
    </div>
  );
}

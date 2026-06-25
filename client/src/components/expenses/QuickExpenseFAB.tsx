// QuickExpenseFAB — a floating action button that opens the QuickExpenseCapture
// modal. Only renders on mobile breakpoints (the GC + sub on-site case).
// Brand gold (#C9A96E) circle, camera icon, fixed bottom-right.

import { useState } from 'react';
import { Camera } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { QuickExpenseCapture } from './QuickExpenseCapture';

export function QuickExpenseFAB() {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (!isMobile) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Capture expense"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 bg-[#C9A96E] hover:bg-[#A8864A] text-white rounded-full w-14 h-14 shadow-lg flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-[#C9A96E] focus:ring-offset-2"
      >
        <Camera className="w-6 h-6" />
      </button>
      <QuickExpenseCapture open={open} onOpenChange={setOpen} />
    </>
  );
}

export default QuickExpenseFAB;

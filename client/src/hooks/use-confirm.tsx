/**
 * useConfirm — a Promise-returning replacement for `window.confirm()`.
 *
 * Call site:
 *   const confirm = useConfirm();
 *   const ok = await confirm({ title: 'Delete this task?', confirmText: 'Delete', variant: 'destructive' });
 *   if (!ok) return;
 *
 * Renders a shadcn AlertDialog so destructive prompts get the same brand
 * treatment as the rest of the app — no jarring browser-chrome popup that
 * blocks the whole window and can't be themed.
 *
 * Mount `<ConfirmProvider>` once near the root (alongside Toaster). The
 * hook resolves to a function that opens the dialog and returns a
 * Promise<boolean> — true on confirm, false on cancel / dismiss.
 */

import { createContext, useCallback, useContext, useRef, useState, ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface ConfirmOptions {
  /** Headline of the dialog — keep it short, ~6 words max. */
  title: string;
  /** Optional body text. Used for "this cannot be undone" notes and cascade
   *  warnings. Newlines OK. */
  description?: string;
  /** Label on the confirm button. Default "Confirm". For deletes, use
   *  "Delete" / "Remove" / "Discard" etc. */
  confirmText?: string;
  /** Label on the cancel button. Default "Cancel". */
  cancelText?: string;
  /** Visual tone — destructive paints the confirm button red. */
  variant?: 'default' | 'destructive';
}

interface ConfirmResolver {
  options: ConfirmOptions;
  resolve: (ok: boolean) => void;
}

const ConfirmContext = createContext<
  ((opts: ConfirmOptions) => Promise<boolean>) | null
>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmResolver | null>(null);
  // Keep the latest resolver in a ref too so async race conditions (rapid
  // open/close) can't drop a pending Promise on the floor.
  const pendingRef = useRef<ConfirmResolver | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>(resolve => {
      const next: ConfirmResolver = { options: opts, resolve };
      pendingRef.current = next;
      setState(next);
    });
  }, []);

  const handleCancel = () => {
    pendingRef.current?.resolve(false);
    pendingRef.current = null;
    setState(null);
  };

  const handleConfirm = () => {
    pendingRef.current?.resolve(true);
    pendingRef.current = null;
    setState(null);
  };

  const open = state !== null;
  const opts = state?.options;
  const isDestructive = opts?.variant === 'destructive';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={open} onOpenChange={(o) => { if (!o) handleCancel(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{opts?.title || ''}</AlertDialogTitle>
            {opts?.description && (
              // whitespace-pre-line so callers can use \n for paragraph breaks
              // (cascade warnings often want a structured body).
              <AlertDialogDescription className="whitespace-pre-line">
                {opts.description}
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>
              {opts?.cancelText || 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className={isDestructive
                ? 'bg-red-600 hover:bg-red-700 text-white border-red-600'
                : ''
              }
            >
              {opts?.confirmText || 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within ConfirmProvider — mount <ConfirmProvider> near the App root.');
  }
  return ctx;
}

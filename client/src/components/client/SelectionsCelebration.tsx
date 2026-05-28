import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, PartyPopper } from 'lucide-react';

/**
 * Mini "you finished every selection" celebration. Fires once when the
 * homeowner crosses 100% completion. Auto-dismisses after a few seconds —
 * a confetti burst, a gold-toned banner, and a soft brand fade-out.
 *
 * Implementation: 24 small "particles" (gold + ivory) tumble downward
 * from the top of the viewport via framer-motion staggered animation, with
 * a centered banner card. No canvas-confetti dependency — pure framer.
 *
 * The host component is responsible for one-shot semantics — once the
 * homeowner has seen the celebration we should NOT re-fire it on every
 * re-render of the parent. The pattern in ClientSelectionsTimeline uses a
 * sessionStorage key per-project so it shows once per session.
 */

interface Props {
  show: boolean;
  onDismiss: () => void;
}

// Branded particle palette — gold + ivory + a touch of cream. Matches the
// rest of the Skyeline brand. No magenta/blue cartoon confetti.
const PARTICLE_COLORS = ['#C9A96E', '#B8935A', '#FAFAF6', '#F5F0E8', '#A8864A'];
const PARTICLE_COUNT = 24;

export function SelectionsCelebration({ show, onDismiss }: Props) {
  // Auto-dismiss after 4.5s so the banner doesn't linger if the user
  // doesn't click. Long enough to read, short enough to not block work.
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(onDismiss, 4500);
    return () => clearTimeout(t);
  }, [show, onDismiss]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          // Top-layer overlay; pointer-events-none on the wrapper so the
          // user can still interact with the page underneath while particles
          // tumble. The banner itself re-enables pointer events.
          className="fixed inset-0 z-[60] pointer-events-none flex items-start justify-center pt-24"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.4 } }}
        >
          {/* Particles — generated up front so they tumble independently. */}
          {Array.from({ length: PARTICLE_COUNT }).map((_, i) => {
            const left = `${(i / PARTICLE_COUNT) * 100 + Math.random() * 6 - 3}%`;
            const color = PARTICLE_COLORS[i % PARTICLE_COLORS.length];
            const size = 6 + Math.random() * 8;
            const delay = Math.random() * 0.3;
            const duration = 2.2 + Math.random() * 0.9;
            const rotate = (Math.random() - 0.5) * 720;
            return (
              <motion.span
                key={i}
                aria-hidden="true"
                className="absolute top-0 rounded-sm"
                style={{ left, width: size, height: size * 0.45, backgroundColor: color }}
                initial={{ y: -20, opacity: 0, rotate: 0 }}
                animate={{ y: '110vh', opacity: [0, 1, 1, 0.7, 0], rotate }}
                transition={{ duration, delay, ease: 'easeIn' }}
              />
            );
          })}

          {/* Banner card */}
          <motion.div
            className="pointer-events-auto bg-white border border-[#C9A96E]/40 shadow-xl rounded-xl px-6 py-4 flex items-center gap-3 max-w-md"
            initial={{ y: -20, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -20, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 220, damping: 22 }}
          >
            <motion.div
              animate={{ rotate: [0, -12, 12, -6, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 0.6, ease: 'easeInOut' }}
              className="text-[#C9A96E]"
            >
              <PartyPopper className="w-7 h-7" />
            </motion.div>
            <div className="min-w-0">
              <p className="text-base font-heading font-semibold text-[#141414]">
                Every selection is in!
              </p>
              <p className="text-sm text-gray-600 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-[#C9A96E]" />
                Nice work — your designer + contractor have everything they need to move on.
              </p>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss celebration"
              className="ml-2 text-gray-400 hover:text-gray-700 text-xl leading-none px-1"
            >
              ×
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

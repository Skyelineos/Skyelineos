// In-app push opt-in banner. Shows once per device for any signed-in
// portal/staff user who hasn't been asked yet. After "Maybe Later" the
// dismiss flag is persisted in localStorage so we don't badger users.
//
// The Settings → Notifications card is the canonical place to re-enable
// later; this banner is purely the friendly first-touch nudge.

import { useState } from 'react';
import { Bell, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth/AuthContext';
import { useFcmToken } from '@/hooks/useFcmToken';

// Roles that get the prompt. Internal admin/gc/designer get it too because
// they also benefit from push reminders for tasks/bids/milestones.
const PROMPT_ROLES = new Set(['sub', 'client', 'designer', 'gc', 'admin']);

export function PushNotificationPrompt() {
  const { user } = useAuth();
  const { permission, requestPermission, isDismissed, dismiss } = useFcmToken();
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);

  // Bail early if rendering would never make sense.
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return null;
  if (!user) return null;
  if (!PROMPT_ROLES.has((user.role || '').toLowerCase())) return null;
  if (permission !== 'default') return null;
  if (hidden) return null;
  if (isDismissed()) return null;

  const handleEnable = async () => {
    setBusy(true);
    try {
      await requestPermission();
    } finally {
      setBusy(false);
      setHidden(true);
    }
  };

  const handleDismiss = () => {
    dismiss();
    setHidden(true);
  };

  return (
    <div
      className="fixed bottom-4 right-4 z-50 max-w-sm w-[calc(100vw-2rem)] sm:w-96 rounded-lg shadow-xl border border-gray-200 bg-white p-4 animate-in slide-in-from-bottom-5 fade-in"
      role="dialog"
      aria-live="polite"
      aria-label="Enable push notifications"
    >
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute top-2 right-2 p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
        onClick={handleDismiss}
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <div
          className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
          style={{ backgroundColor: '#FAF3E5' }}
        >
          <Bell className="h-5 w-5" style={{ color: '#C9A96E' }} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">Stay in the loop</h3>
          <p className="mt-1 text-sm text-gray-600">
            Enable push notifications to get instant updates on tasks, bids, and project milestones.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleEnable}
              disabled={busy}
              className="text-white gap-1.5"
              style={{ backgroundColor: '#C9A96E' }}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
              Enable Notifications
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDismiss} disabled={busy}>
              Maybe Later
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PushNotificationPrompt;

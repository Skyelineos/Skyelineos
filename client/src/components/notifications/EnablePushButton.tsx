import { useEffect, useState } from 'react';
import { Bell, BellOff, Smartphone, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import {
  enablePushForUser, disablePushForUser, hasActivePushTokens, pushStatus,
} from '@/lib/push-notifications';

interface Props {
  /**
   * Optional override — the Firestore doc path to store the FCM token on.
   * Defaults to `users/{authUid}`. Pass a `contacts/{id}` path when a sub
   * doesn't yet have a Firebase Auth user but has been added as a contact.
   */
  userDocPath?: string;
  /** Small variant — used inside table rows / dialogs. */
  size?: 'sm' | 'default';
  className?: string;
}

/**
 * "Enable phone notifications" — opt-in button for FCM web push. Used in the
 * sub portal so subs without email/SMS can still receive bid invites and
 * reminders via their phone's notification tray. Detects iOS PWA requirement
 * and surfaces the workaround inline.
 */
export function EnablePushButton({ userDocPath, size = 'sm', className }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState<Awaited<ReturnType<typeof pushStatus>> | null>(null);
  const [tokens, setTokens] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  const effectivePath = userDocPath
    || (user ? `users/${user.firebaseUid || user.id}` : null);

  useEffect(() => {
    (async () => {
      setStatus(await pushStatus());
      if (effectivePath) setTokens(await hasActivePushTokens(effectivePath));
    })();
  }, [effectivePath]);

  if (!status) return null;
  if (!effectivePath) return null;

  // iOS Safari before 16.4 — and Android browsers without push — don't
  // support FCM. Show a helpful hint so the user knows what's going on.
  if (!status.supported) {
    return (
      <div className={`text-xs text-gray-500 flex items-center gap-1.5 ${className || ''}`} title="Web push isn't available on this device">
        <BellOff className="w-3.5 h-3.5" />
        Phone notifications not supported here
      </div>
    );
  }

  if (!status.configured) {
    return (
      <div className={`text-xs text-gray-500 flex items-center gap-1.5 ${className || ''}`} title="Admin needs to set the VAPID key in Firebase Console">
        <BellOff className="w-3.5 h-3.5" />
        Phone notifications not configured yet
      </div>
    );
  }

  const enabled = tokens > 0 && status.permission === 'granted';

  const handleEnable = async () => {
    if (!effectivePath) return;
    setBusy(true);
    try {
      await enablePushForUser(effectivePath);
      setTokens(await hasActivePushTokens(effectivePath));
      setStatus(await pushStatus());
      toast({
        title: 'Phone notifications enabled',
        description: 'Bid invites and reminders will appear on this device.',
      });
    } catch (e: any) {
      toast({
        title: 'Could not enable',
        description: e?.message || String(e),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    if (!effectivePath) return;
    setBusy(true);
    try {
      await disablePushForUser(effectivePath);
      setTokens(await hasActivePushTokens(effectivePath));
      toast({ title: 'Phone notifications disabled on this device' });
    } catch (e: any) {
      toast({ title: 'Could not disable', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      size={size}
      variant={enabled ? 'outline' : 'default'}
      onClick={enabled ? handleDisable : handleEnable}
      disabled={busy}
      className={`gap-1.5 ${className || ''} ${enabled ? '' : 'text-white'}`}
      style={enabled ? undefined : { backgroundColor: '#C9A96E' }}
      title={enabled
        ? `Push enabled on ${tokens} device${tokens === 1 ? '' : 's'} — click to disable on this one`
        : 'Get bid invites and reminders directly on this phone'}
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : (enabled ? <Bell className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />)}
      {enabled
        ? `Phone alerts on${tokens > 1 ? ` (${tokens})` : ''}`
        : 'Enable phone notifications'}
    </Button>
  );
}

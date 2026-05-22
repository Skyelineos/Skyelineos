import React, { useEffect, useState } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Bell, Mail, MessageSquare, Smartphone } from 'lucide-react';

/**
 * User-facing toggles for selection reminders.
 *
 * Stored under users/{uid}.notificationPreferences:
 *   selectionsInApp:  boolean   (default true)
 *   selectionsEmail:  boolean   (default true)
 *   selectionsSms:    boolean   (default true)
 *   digestFrequency:  'daily' | 'weekly' | 'off'
 *
 * Drop this into a "Notifications" settings page or surface it from the
 * SelectionsHub kebab menu.
 */
export default function NotificationPreferences() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [prefs, setPrefs] = useState({
    selectionsInApp: true,
    selectionsEmail: true,
    selectionsSms: true,
    digestFrequency: 'daily' as 'daily' | 'weekly' | 'off',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (!user?.firebaseUid) { setLoading(false); return; }
      const snap = await getDoc(doc(db, `users/${user.firebaseUid}`));
      const existing = snap.data()?.notificationPreferences;
      if (existing) {
        setPrefs({
          selectionsInApp: existing.selectionsInApp !== false,
          selectionsEmail: existing.selectionsEmail !== false,
          selectionsSms: existing.selectionsSms !== false,
          digestFrequency: existing.digestFrequency || 'daily',
        });
      }
      setLoading(false);
    })();
  }, [user?.firebaseUid]);

  const save = async () => {
    if (!user?.firebaseUid) return;
    setSaving(true);
    try {
      await setDoc(
        doc(db, `users/${user.firebaseUid}`),
        { notificationPreferences: { ...prefs, updatedAt: serverTimestamp() } },
        { merge: true },
      );
      toast({ title: 'Preferences saved' });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading preferences…</div>;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="flex items-center gap-2 mb-4">
        <Bell className="w-5 h-5 text-gray-700" />
        <h3 className="text-base font-semibold text-gray-900">Selection reminders</h3>
      </div>
      <p className="text-sm text-gray-600 mb-6">
        Decide how Skyeline reaches out when a design selection needs your input.
      </p>
      <div className="space-y-4">
        <Toggle
          icon={<Bell className="w-4 h-4" />}
          label="In-app notifications"
          desc="Show the bell badge + dashboard banner."
          value={prefs.selectionsInApp}
          onChange={(v) => setPrefs({ ...prefs, selectionsInApp: v })}
        />
        <Toggle
          icon={<Mail className="w-4 h-4" />}
          label="Email digest"
          desc="One email per project per day, only when something needs you."
          value={prefs.selectionsEmail}
          onChange={(v) => setPrefs({ ...prefs, selectionsEmail: v })}
        />
        <Toggle
          icon={<Smartphone className="w-4 h-4" />}
          label="SMS (overdue only)"
          desc="Text you only when a selection is already past its deadline."
          value={prefs.selectionsSms}
          onChange={(v) => setPrefs({ ...prefs, selectionsSms: v })}
        />
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
            <MessageSquare className="w-3.5 h-3.5" /> Digest frequency
          </label>
          <select
            value={prefs.digestFrequency}
            onChange={(e) => setPrefs({ ...prefs, digestFrequency: e.target.value as any })}
            className="w-full text-sm rounded-md border border-gray-200 px-3 py-2 bg-white"
          >
            <option value="daily">Daily (8am MT)</option>
            <option value="weekly">Weekly (Monday morning)</option>
            <option value="off">Off — only urgent items</option>
          </select>
        </div>
      </div>
      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="text-sm px-4 py-2 rounded-md bg-[#1F3864] text-white hover:bg-[#162a4d] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function Toggle({
  icon, label, desc, value, onChange,
}: { icon: React.ReactNode; label: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <div className="mt-0.5 flex-shrink-0 text-gray-600">{icon}</div>
      <div className="flex-1">
        <div className="text-sm font-medium text-gray-900">{label}</div>
        <div className="text-xs text-gray-500 mt-0.5">{desc}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors ${
          value ? 'bg-[#C9A96E]' : 'bg-gray-200'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            value ? 'translate-x-5' : ''
          }`}
        />
      </button>
    </label>
  );
}

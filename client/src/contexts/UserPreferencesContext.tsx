import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/auth/AuthContext';

// Notification prefs that the backend dispatcher (functions/src/notifications/
// dispatch.ts) actually reads live on `users/{uid}.notificationPrefs`. The two
// global switches below map UI toggles → those backend fields so the toggle is
// real, not localStorage-only. Per-kind overrides aren't surfaced here yet.
const NOTIFICATION_PREF_FIELD: Partial<Record<keyof UserPreferences, 'email' | 'sms'>> = {
  emailNotifications: 'email',
  smsNotifications: 'sms',
};

export interface UserPreferences {
  // Display preferences
  sidebarCollapsed: boolean;
  compactMode: boolean;
  showNotifications: boolean;
  autoRefresh: boolean;
  
  // Table/List preferences
  itemsPerPage: number;
  defaultView: 'card' | 'table' | 'list';
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  
  // Dashboard preferences
  dashboardLayout: string[];
  showWeather: boolean;
  show7DayForecast: boolean;
  
  // Accessibility preferences
  reducedMotion: boolean;
  highContrast: boolean;
  fontSize: 'small' | 'medium' | 'large';
  
  // Construction-specific preferences
  defaultProjectView: 'gantt' | 'calendar' | 'list';
  showCriticalPath: boolean;
  showWeekends: boolean;
  businessHoursStart: number;
  businessHoursEnd: number;
  
  // Notification preferences
  emailNotifications: boolean;
  smsNotifications: boolean;
  projectUpdates: boolean;
  bidAlerts: boolean;
  scheduleChanges: boolean;
}

const defaultPreferences: UserPreferences = {
  sidebarCollapsed: false,
  compactMode: false,
  showNotifications: true,
  autoRefresh: true,
  itemsPerPage: 25,
  defaultView: 'table',
  sortBy: 'createdAt',
  sortOrder: 'desc',
  dashboardLayout: ['urgent', 'weather', 'projects', 'recent'],
  showWeather: true,
  show7DayForecast: true,
  reducedMotion: false,
  highContrast: false,
  fontSize: 'medium',
  defaultProjectView: 'gantt',
  showCriticalPath: true,
  showWeekends: false,
  businessHoursStart: 8,
  businessHoursEnd: 17,
  emailNotifications: true,
  smsNotifications: false,
  projectUpdates: true,
  bidAlerts: true,
  scheduleChanges: true,
};

interface UserPreferencesContextType {
  preferences: UserPreferences;
  updatePreference: <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ) => void;
  resetPreferences: () => void;
  isLoading: boolean;
}

const UserPreferencesContext = createContext<UserPreferencesContextType | undefined>(undefined);

export function UserPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences);
  const [isLoading, setIsLoading] = useState(true);
  const { firebaseUser } = useAuth();

  // Load preferences on mount
  useEffect(() => {
    const loadPreferences = () => {
      try {
        const stored = localStorage.getItem('userPreferences');
        if (stored) {
          const parsed = JSON.parse(stored);
          setPreferences({ ...defaultPreferences, ...parsed });
        }
      } catch (error) {
        console.error('Failed to load user preferences:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadPreferences();
  }, []);

  // Once authenticated, let Firestore be the source of truth for the two
  // notification toggles the backend actually honors. This keeps the switch
  // in sync across devices (localStorage is per-browser) and reflects values
  // set by other flows (e.g. the push opt-in button).
  useEffect(() => {
    if (!firebaseUser?.uid) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
        const prefs = snap.data()?.notificationPrefs as
          | { email?: boolean; sms?: boolean }
          | undefined;
        if (cancelled || !prefs) return;
        setPreferences(prev => ({
          ...prev,
          ...(typeof prefs.email === 'boolean' ? { emailNotifications: prefs.email } : {}),
          ...(typeof prefs.sms === 'boolean' ? { smsNotifications: prefs.sms } : {}),
        }));
      } catch (e) {
        console.warn('[prefs] failed to load notificationPrefs from Firestore', e);
      }
    })();
    return () => { cancelled = true; };
  }, [firebaseUser?.uid]);

  // Save preferences when they change
  useEffect(() => {
    if (!isLoading) {
      localStorage.setItem('userPreferences', JSON.stringify(preferences));
    }
  }, [preferences, isLoading]);

  const updatePreference = useCallback(<K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ) => {
    setPreferences(prev => ({
      ...prev,
      [key]: value,
    }));

    // Mirror the backend-relevant notification toggles to Firestore so the
    // dispatcher (which reads users/{uid}.notificationPrefs) honors them.
    // Fire-and-forget — the local state update above is the UX; the sync is
    // best-effort and never blocks the toggle.
    const field = NOTIFICATION_PREF_FIELD[key];
    if (field && firebaseUser?.uid && typeof value === 'boolean') {
      const payload: Record<string, any> = { [field]: value };
      // Stamp a consent record when the user turns SMS ON themselves. This is
      // the auditable proof-of-opt-in carriers / TCPA expect for the account
      // owner; subs consent separately at onboarding.
      if (field === 'sms' && value === true) {
        payload.smsConsentAt = serverTimestamp();
        payload.smsConsentSource = 'self_settings';
      }
      setDoc(
        doc(db, 'users', firebaseUser.uid),
        { notificationPrefs: payload },
        { merge: true },
      ).catch(e => console.warn('[prefs] failed to sync notificationPref to Firestore', e));
    }
  }, [firebaseUser?.uid]);

  const resetPreferences = useCallback(() => {
    setPreferences(defaultPreferences);
    localStorage.removeItem('userPreferences');
  }, []);

  const value = useMemo(() => ({
    preferences,
    updatePreference,
    resetPreferences,
    isLoading,
  }), [preferences, updatePreference, resetPreferences, isLoading]);

  return (
    <UserPreferencesContext.Provider value={value}>
      {children}
    </UserPreferencesContext.Provider>
  );
}

export function useUserPreferences() {
  const context = useContext(UserPreferencesContext);
  if (context === undefined) {
    throw new Error('useUserPreferences must be used within a UserPreferencesProvider');
  }
  return context;
}
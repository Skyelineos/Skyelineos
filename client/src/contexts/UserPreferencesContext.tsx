import React, { createContext, useContext, useState, useEffect } from 'react';

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

  // Save preferences when they change
  useEffect(() => {
    if (!isLoading) {
      localStorage.setItem('userPreferences', JSON.stringify(preferences));
    }
  }, [preferences, isLoading]);

  const updatePreference = <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ) => {
    setPreferences(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const resetPreferences = () => {
    setPreferences(defaultPreferences);
    localStorage.removeItem('userPreferences');
  };

  return (
    <UserPreferencesContext.Provider 
      value={{ 
        preferences, 
        updatePreference, 
        resetPreferences, 
        isLoading 
      }}
    >
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
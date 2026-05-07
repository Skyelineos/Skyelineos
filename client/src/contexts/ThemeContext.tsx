import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

interface ThemeContextType {
  accentColor: string;
  setAccentColor: (color: string) => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
  isLoading: boolean;
  hasCloudSync: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [accentColor, setAccentColorState] = useState<string>(() => {
    return localStorage.getItem('accentColor') || '#2F80ED';
  });

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('darkMode') === 'true';
  });

  useEffect(() => {
    document.documentElement.style.setProperty('--accent-color', accentColor);
    localStorage.setItem('accentColor', accentColor);
  }, [accentColor]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode]);

  const setAccentColor = (color: string) => {
    setAccentColorState(color);
  };

  const toggleDarkMode = () => {
    setDarkMode(d => !d);
  };

  return (
    <ThemeContext.Provider value={{
      accentColor,
      setAccentColor,
      darkMode,
      toggleDarkMode,
      isLoading: false,
      hasCloudSync: false,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

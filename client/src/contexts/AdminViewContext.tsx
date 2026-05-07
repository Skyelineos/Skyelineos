import { createContext, useContext, useState, ReactNode } from 'react';

export interface AdminViewUser {
  id: string;
  name: string;
  email?: string;
  company?: string;
  role: 'client' | 'subcontractor' | 'designer';
}

interface AdminViewContextType {
  isAdminView: boolean;
  portalType: 'client' | 'subcontractor' | 'designer' | null;
  viewedUser: AdminViewUser | null;
  setIsAdminView: (value: boolean) => void;
  setPortalType: (type: 'client' | 'subcontractor' | 'designer' | null) => void;
  setViewedUser: (user: AdminViewUser | null) => void;
  enterAdminView: (portalType: 'client' | 'subcontractor' | 'designer', user: AdminViewUser) => void;
  exitAdminView: () => void;
}

const AdminViewContext = createContext<AdminViewContextType | undefined>(undefined);

export const AdminViewProvider = ({ children }: { children: ReactNode }) => {
  const [isAdminView, setIsAdminView] = useState(false);
  const [portalType, setPortalType] = useState<'client' | 'subcontractor' | 'designer' | null>(null);
  const [viewedUser, setViewedUser] = useState<AdminViewUser | null>(null);

  const enterAdminView = (type: 'client' | 'subcontractor' | 'designer', user: AdminViewUser) => {
    setIsAdminView(true);
    setPortalType(type);
    setViewedUser(user);
  };

  const exitAdminView = () => {
    setIsAdminView(false);
    setPortalType(null);
    setViewedUser(null);
  };

  return (
    <AdminViewContext.Provider
      value={{
        isAdminView,
        portalType,
        viewedUser,
        setIsAdminView,
        setPortalType,
        setViewedUser,
        enterAdminView,
        exitAdminView,
      }}
    >
      {children}
    </AdminViewContext.Provider>
  );
};

export const useAdminView = () => {
  const context = useContext(AdminViewContext);
  if (context === undefined) {
    throw new Error('useAdminView must be used within an AdminViewProvider');
  }
  return context;
};
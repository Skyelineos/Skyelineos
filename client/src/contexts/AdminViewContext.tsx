import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

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
  isReadOnly: boolean;
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

  // We expose this flag for components that want to disable specific actions
  // when in admin view, but we DON'T globally intercept clicks/submits — the
  // visible banner is the warning and writes are allowed so the admin can walk
  // through full role workflows (create selection, file site log, submit bid)
  // and verify the system end-to-end.
  const isReadOnly = false;
  useEffect(() => {
    if (isAdminView) {
      document.body.setAttribute('data-admin-view', 'true');
    } else {
      document.body.removeAttribute('data-admin-view');
    }
    return () => document.body.removeAttribute('data-admin-view');
  }, [isAdminView]);

  return (
    <AdminViewContext.Provider
      value={{
        isAdminView,
        portalType,
        viewedUser,
        isReadOnly,
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
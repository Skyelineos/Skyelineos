import { useAuth as useAuthContext } from '@/auth/AuthContext';

// Legacy User interface for backward compatibility.
//
// NOTE (T0-3): `id` is still typed `number` for backward compatibility with
// older callers that do arithmetic on it (e.g. `createdBy: user?.id || 1`).
// At runtime after the T0-3 fix below it is actually the Firebase Auth UID
// (a string). All new code should use `.toString()` and treat it as opaque.
interface User {
  id: number;
  email: string;
  role: string;
  name: string;
  firstName?: string;
  lastName?: string;
  permissions: string[];
}

// Legacy AuthContextType interface for backward compatibility
interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: string | string[]) => boolean;
}

/**
 * Legacy useAuth hook that maps the new unified auth system 
 * to the old interface for backward compatibility with existing components.
 * 
 * This hook consumes the real AuthContext and provides a consistent interface
 * that existing components expect while using the unified auth system under the hood.
 */
export function useAuth(): AuthContextType {
  const auth = useAuthContext();

  // Map the new AuthContext user to the legacy User interface.
  //
  // T0-3 FIX (Skyelineos_CTO_Audit_2026-06-16.md Workflow 6): `auth.user.id`
  // is a Drizzle-era SQL serial hardcoded to 0 in AuthContext.loadUserProfile
  // (BackendUser.id: number is a historical type — the system migrated to
  // Firebase Auth string UIDs but the field is still typed `number`).
  // Mapping `id: auth.user.id` here meant every downstream
  // `user.id?.toString()` site read literal "0" — silently breaking the
  // walkthrough notification chain (sub never sees Tyler's assignments),
  // bid `subUserId` writes, and every `createdBy` / `actorUid` audit field.
  //
  // Fix: prefer `firebaseUid` so callers get the real Firebase auth uid via
  // the legacy interface. TS allows the `string | undefined` to flow into a
  // `number`-typed field because we widen at the call sites with
  // `.toString()`. The `BackendUser.id: number` type itself stays wrong on
  // paper — tighten it in a follow-up sweep (T0 cleanup).
  const legacyUser: User | null = auth.user ? {
    id: (auth.user.firebaseUid || auth.user.id) as any,
    email: auth.user.email,
    role: auth.user.role,
    name: auth.user.name,
    firstName: auth.user.name?.split(' ')[0],
    lastName: auth.user.name?.split(' ').slice(1).join(' ') || undefined,
    permissions: auth.user.permissions || []
  } : null;

  // Note: login method not directly implemented as Firebase handles authentication
  // Components should use the SignIn page or Firebase auth directly for login
  const login = async (email: string, password: string): Promise<boolean> => {
    console.warn('Direct login through useAuth is not supported. Use the SignIn page or Firebase auth directly.');
    return false;
  };

  return {
    user: legacyUser,
    login,
    logout: auth.logout,
    isAuthenticated: auth.isAuthenticated,
    isLoading: auth.loading || auth.authLoading,
    hasPermission: auth.hasPermission,
    hasRole: auth.hasRole,
  };
}

/**
 * @deprecated Use useAuth() instead. This function is kept for backward compatibility.
 */
export function useAuthProvider(): AuthContextType {
  console.warn('useAuthProvider is deprecated. Use useAuth() instead.');
  return useAuth();
}

export async function authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...options,
    credentials: 'include'
  });
}
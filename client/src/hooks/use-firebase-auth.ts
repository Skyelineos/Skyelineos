import { useState, useEffect } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { signIn, register, logout, UserProfile } from '../lib/firebase-auth';

interface AuthState {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  error: string | null;
}

export const useFirebaseAuth = () => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    userProfile: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Fetch user profile from Firestore
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          const userProfile = userDoc.exists() 
            ? { id: user.uid, ...userDoc.data() } as UserProfile
            : null;

          setAuthState({
            user,
            userProfile,
            loading: false,
            error: null,
          });
        } catch (error) {
          console.error('Error fetching user profile:', error);
          setAuthState({
            user,
            userProfile: null,
            loading: false,
            error: 'Failed to load user profile',
          });
        }
      } else {
        setAuthState({
          user: null,
          userProfile: null,
          loading: false,
          error: null,
        });
      }
    });

    return unsubscribe;
  }, []);

  const login = async (email: string, password: string) => {
    try {
      setAuthState(prev => ({ ...prev, loading: true, error: null }));
      await signIn(email, password);
      // Auth state will be updated by the listener
    } catch (error: any) {
      setAuthState(prev => ({ 
        ...prev, 
        loading: false, 
        error: error.message || 'Login failed' 
      }));
      throw error;
    }
  };

  const registerUser = async (email: string, password: string, fullName: string, role?: string) => {
    try {
      setAuthState(prev => ({ ...prev, loading: true, error: null }));
      await register(email, password, fullName, role);
      // Auth state will be updated by the listener
    } catch (error: any) {
      setAuthState(prev => ({ 
        ...prev, 
        loading: false, 
        error: error.message || 'Registration failed' 
      }));
      throw error;
    }
  };

  const logoutUser = async () => {
    try {
      await logout();
      // Auth state will be updated by the listener
    } catch (error: any) {
      setAuthState(prev => ({ 
        ...prev, 
        error: error.message || 'Logout failed' 
      }));
      throw error;
    }
  };

  return {
    ...authState,
    login,
    register: registerUser,
    logout: logoutUser,
    isAuthenticated: !!authState.user,
    isAdmin: authState.userProfile?.role === 'admin',
    hasRole: (role: string) => authState.userProfile?.role === role,
  };
};
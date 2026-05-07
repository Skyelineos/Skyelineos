import { initializeAppCheck, ReCaptchaV3Provider, getToken } from 'firebase/app-check';
import { getApp } from 'firebase/app';

/**
 * Initialize Firebase App Check for production security
 * This should only be called in production environments
 */
export function initializeFirebaseAppCheck() {
  // Only initialize App Check in production
  if (import.meta.env.PROD && import.meta.env.VITE_FIREBASE_APP_CHECK_KEY) {
    try {
      const app = getApp();
      
      // Initialize App Check with reCAPTCHA v3
      const appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(import.meta.env.VITE_FIREBASE_APP_CHECK_KEY),
        
        // Optional: Enable debug mode in development
        // isTokenAutoRefreshEnabled: true
      });

      // Get an initial App Check token
      getToken(appCheck)
        .then((token) => {
          // App Check token retrieved successfully
          // Token will be automatically included in Firebase requests
        })
        .catch((error) => {
          console.warn('Firebase App Check token retrieval failed:', error);
          // App may still work but with reduced security
        });

      return appCheck;
    } catch (error) {
      console.error('Failed to initialize Firebase App Check:', error);
      return null;
    }
  }
  
  return null;
}

/**
 * Configure App Check debug mode for development
 * This allows testing App Check features in development
 */
export function configureAppCheckDebugMode() {
  if (import.meta.env.DEV) {
    // Enable debug mode in development
    // You need to add your debug token to the Firebase console
    // under Project Settings > App Check
    (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN || true;
  }
}
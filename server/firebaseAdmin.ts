import * as admin from "firebase-admin";
import * as crypto from "crypto";

// Real Firebase Admin interface with development support
interface AdminAuth {
  verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken>;
  createUser(properties: admin.auth.CreateRequest): Promise<admin.auth.UserRecord>;
  setCustomUserClaims(uid: string, claims: object): Promise<void>;
  deleteUser(uid: string): Promise<void>;
}

// Development mock implementation
class MockFirebaseAdmin implements AdminAuth {
  async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    console.warn('⚠️  Using mock Firebase Admin verification in development');
    
    // Create a mock decoded token for development
    const mockToken: admin.auth.DecodedIdToken = {
      uid: `mock_${crypto.randomBytes(8).toString('hex')}`,
      email: 'info@skyelinehomes.com',
      email_verified: true,
      name: 'Admin User',
      iss: 'https://securetoken.google.com/mock-project',
      aud: 'mock-project',
      auth_time: Math.floor(Date.now() / 1000),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      sub: `mock_${crypto.randomBytes(8).toString('hex')}`,
      firebase: {
        identities: {
          email: ['info@skyelinehomes.com']
        },
        sign_in_provider: 'password'
      }
    };
    
    return mockToken;
  }

  async createUser(properties: admin.auth.CreateRequest): Promise<admin.auth.UserRecord> {
    const uid = `mock_${crypto.randomBytes(16).toString('hex')}`;
    
    if (!properties.email || !properties.email.includes('@')) {
      throw { code: 'auth/invalid-email', message: 'Invalid email address' };
    }
    
    console.log(`Mock Firebase Admin: Created user ${properties.email} with UID ${uid}`);
    
    return {
      uid,
      email: properties.email!,
      emailVerified: properties.emailVerified || false,
      displayName: properties.displayName || null,
      photoURL: null,
      phoneNumber: null,
      disabled: false,
      metadata: {
        creationTime: new Date().toISOString(),
        lastSignInTime: new Date().toISOString(),
        lastRefreshTime: null,
        toJSON: () => ({})
      },
      customClaims: {},
      providerData: [],
      tokensValidAfterTime: new Date().toISOString(),
      tenantId: null,
      toJSON: () => ({})
    } as admin.auth.UserRecord;
  }

  async setCustomUserClaims(uid: string, claims: object): Promise<void> {
    console.log(`Mock Firebase Admin: Set custom claims for ${uid}:`, claims);
  }

  async deleteUser(uid: string): Promise<void> {
    console.log(`Mock Firebase Admin: Deleted user with UID ${uid}`);
  }
}

// Cache the initialized auth instance to prevent re-initialization
let cachedAuth: AdminAuth | null = null;

// Initialize Firebase Admin SDK with strict security controls
function initializeFirebaseAdmin(): AdminAuth {
  // Return cached instance if already initialized
  if (cachedAuth) {
    return cachedAuth;
  }
  
  const isProduction = process.env.NODE_ENV === 'production';
  const isDevelopment = process.env.NODE_ENV === 'development';
  const allowMockFirebase = process.env.ENABLE_FIREBASE_ADMIN_MOCK === 'true';
  
  console.log('🔍 Firebase Admin initialization:', { 
    NODE_ENV: process.env.NODE_ENV, 
    isDevelopment, 
    isProduction, 
    allowMockFirebase 
  });
  
  // CRITICAL: Prevent MockFirebaseAdmin in production under ANY circumstances
  if (isProduction && allowMockFirebase) {
    console.error('🚨 FATAL SECURITY ERROR: Mock Firebase Admin is NEVER allowed in production!');
    console.error('Environment variables:');
    console.error(`  NODE_ENV: ${process.env.NODE_ENV}`);
    console.error(`  ENABLE_FIREBASE_ADMIN_MOCK: ${process.env.ENABLE_FIREBASE_ADMIN_MOCK}`);
    console.error('🚨 SERVER STARTUP TERMINATED - Security violation detected');
    process.exit(1);
  }
  
  // CRITICAL: Production startup enforcement - NEVER use mock in production
  if (isProduction) {
    console.log('🔒 PRODUCTION MODE: Enforcing real Firebase Admin SDK...');
    
    try {
      // Production Firebase Admin initialization with enhanced validation
      const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
      const projectId = process.env.FIREBASE_PROJECT_ID;
      
      // Enhanced credential validation for production
      if (!serviceAccountKey || !projectId) {
        console.error('🚨 FATAL: Firebase service account credentials missing in production!');
        console.error('Required environment variables:');
        console.error('  - FIREBASE_SERVICE_ACCOUNT_KEY (JSON string)');
        console.error('  - FIREBASE_PROJECT_ID (project identifier)');
        throw new Error('PRODUCTION FATAL: Firebase credentials required but not found');
      }

      // Validate service account key format
      let serviceAccount: any;
      try {
        serviceAccount = JSON.parse(serviceAccountKey);
      } catch (parseError) {
        console.error('🚨 FATAL: Invalid Firebase service account JSON format');
        throw new Error('PRODUCTION FATAL: Firebase service account key is not valid JSON');
      }

      // Validate required fields in service account
      const requiredFields = ['type', 'project_id', 'private_key_id', 'private_key', 'client_email'];
      for (const field of requiredFields) {
        if (!serviceAccount[field]) {
          console.error(`🚨 FATAL: Missing required field '${field}' in Firebase service account`);
          throw new Error(`PRODUCTION FATAL: Invalid Firebase service account - missing ${field}`);
        }
      }

      // Ensure project ID matches
      if (serviceAccount.project_id !== projectId) {
        console.error('🚨 FATAL: Firebase project ID mismatch');
        console.error(`Service account project: ${serviceAccount.project_id}`);
        console.error(`Environment variable project: ${projectId}`);
        throw new Error('PRODUCTION FATAL: Firebase project ID mismatch between service account and environment');
      }
      
      // Initialize Firebase Admin if not already initialized
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: projectId
        });
      }
      
      // Additional production validation - test the connection
      const auth = admin.auth();
      
      console.log('✅ Firebase Admin SDK successfully initialized for production');
      console.log(`📋 Project ID: ${projectId}`);
      console.log(`📋 Service Account: ${serviceAccount.client_email}`);
      console.log('🔒 Mock Firebase Admin is DISABLED in production');
      
      cachedAuth = auth;
      return auth;
      
    } catch (error) {
      console.error('❌ CRITICAL FAILURE: Firebase Admin SDK initialization failed in production');
      console.error('Error details:', error);
      console.error('🚨 SERVER STARTUP TERMINATED - Firebase Admin required for production');
      
      // CRITICAL: Fail hard in production - don't start server without proper Firebase
      process.exit(1);
    }
  } 
  
  // Development mode - require explicit flag to enable mock
  if (isDevelopment) {
    if (!allowMockFirebase) {
      console.error('🚨 DEVELOPMENT ERROR: Mock Firebase Admin not enabled');
      console.error('To use mock Firebase Admin in development, set: ENABLE_FIREBASE_ADMIN_MOCK=true');
      console.error('🚨 SERVER STARTUP TERMINATED - Enable mock flag required for development');
      process.exit(1);
    }
    
    console.warn('⚠️  DEVELOPMENT MODE: Using mock Firebase Admin implementation');
    console.warn('⚠️  This should NEVER appear in production logs!');
    console.warn('⚠️  Mock provides: verifyIdToken, createUser, setCustomUserClaims, deleteUser');
    console.warn(`⚠️  Environment: NODE_ENV=${process.env.NODE_ENV}, ENABLE_FIREBASE_ADMIN_MOCK=${process.env.ENABLE_FIREBASE_ADMIN_MOCK}`);
    
    cachedAuth = new MockFirebaseAdmin();
    return cachedAuth;
  }
  
  // Unknown environment - NEVER allow mock without explicit flag
  console.error('🚨 FATAL: Unknown NODE_ENV detected');
  console.error('Environment variables:');
  console.error(`  NODE_ENV: ${process.env.NODE_ENV}`);
  console.error(`  ENABLE_FIREBASE_ADMIN_MOCK: ${process.env.ENABLE_FIREBASE_ADMIN_MOCK}`);
  console.error('🚨 Valid NODE_ENV values: "production", "development"');
  console.error('🚨 SERVER STARTUP TERMINATED - Unknown environment not allowed');
  process.exit(1);
}

// Export the initialized auth instance
export const auth = initializeFirebaseAdmin();
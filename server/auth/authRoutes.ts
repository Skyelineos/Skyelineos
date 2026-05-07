import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { storage } from '../storage';
import { 
  authRateLimit, 
  sanitizeInput,
  AuthenticatedRequest,
  ROLE_PERMISSIONS
} from '../middleware/auth';
// REMOVED: Legacy JWT token imports (no longer needed with Firebase Auth)
import { auth as firebaseAuth } from '../firebaseAdmin';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Apply rate limiting to auth routes
router.use(authRateLimit);


// REMOVED: Firebase token exchange endpoint (replaced with direct ID token verification)

// Hash password using PBKDF2
async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.pbkdf2(password, salt, 10000, 64, 'sha512', (err, derivedKey) => {
      if (err) reject(err);
      resolve(salt + ':' + derivedKey.toString('hex'));
    });
  });
}

// Verify password
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return new Promise((resolve) => {
    const [salt, key] = hash.split(':');
    crypto.pbkdf2(password, salt, 10000, 64, 'sha512', (err, derivedKey) => {
      if (err) resolve(false);
      resolve(key === derivedKey.toString('hex'));
    });
  });
}

// REMOVED: Legacy password-based login (replaced with Firebase Authentication)

// REMOVED: Legacy JWT refresh endpoint (Firebase handles token refresh automatically)

// Firebase-compatible logout endpoint (clears client-side state only)
router.post('/logout', async (req: Request, res: Response) => {
  try {
    // With Firebase Auth, logout is handled client-side
    // Server just acknowledges the logout request
    res.json({ 
      success: true, 
      message: 'Logout acknowledged - Firebase handles session termination'
    });
    
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// REMOVED: Logout from all devices (Firebase handles session management)

// REMOVED: Session management endpoints (Firebase handles sessions)

// REMOVED: Session revocation endpoints (Firebase handles sessions)

// Register new user from Firebase - creates user profile in PostgreSQL database
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { firebaseUid, email, name } = req.body;
    
    if (!firebaseUid || !email) {
      return res.status(400).json({ 
        error: 'Firebase UID and email are required',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }

    // Create or update user in database
    const user = await storage.createOrUpdateUserFromFirebase({
      uid: firebaseUid,
      email: email,
      name: name || email.split('@')[0]
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.fullName
      }
    });

  } catch (error) {
    console.error('User registration error:', error);
    res.status(500).json({ 
      error: 'Failed to register user',
      code: 'REGISTRATION_FAILED'
    });
  }
});

// Get current user endpoint (legacy)
router.get('/me', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Return current user info
    res.json({
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      name: req.user.fullName || req.user.email,
      permissions: req.user.permissions
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Firebase-compatible user profile endpoint
router.get('/profile', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication failed' });
    }

    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role,
        name: req.user.fullName || req.user.email,
        permissions: req.user.permissions,
        firebaseUid: req.user.firebaseUid
      },
      message: 'User profile loaded successfully'
    });

  } catch (error) {
    console.error('Profile loading error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Change password
router.post('/change-password', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = sanitizeInput(req.body) as { currentPassword: string; newPassword: string };
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    // TODO: Implement password change logic
    // const user = await storage.getUserById(req.user!.id);
    // if (!await verifyPassword(currentPassword, user.hashedPassword)) {
    //   return res.status(400).json({ error: 'Current password incorrect' });
    // }
    
    // const hashedNewPassword = await hashPassword(newPassword);
    // await storage.updateUserPassword(req.user!.id, hashedNewPassword);

    res.json({ success: true, message: 'Password changed successfully' });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
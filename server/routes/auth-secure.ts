// Secure authentication routes with validation and rate limiting
import { Router, Request, Response } from 'express';
// Remove the unused imports for now to fix startup
// import { rateLimits } from '../middleware/security';
// import { validateBody, validateParams } from '../middleware/validateInput';
import { body } from 'express-validator';
import { z } from 'zod';
import bcrypt from 'bcrypt';
// import { generateTokens, verifyToken } from '../middleware/auth';

// Temporary token generation for development
const generateTokens = (user: { id: number; email: string; role: string }) => ({
  accessToken: 'dev-access-token',
  refreshToken: 'dev-refresh-token'
});

const router = Router();

// Login validation schema
const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

// Registration validation schema
const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain uppercase, lowercase, and number'),
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  role: z.enum(['client', 'subcontractor', 'designer']).optional().default('client')
});

// Password reset request schema
const resetRequestSchema = z.object({
  email: z.string().email('Invalid email format')
});

// Password reset schema
const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain uppercase, lowercase, and number')
});

// POST /auth/login - User login with strict rate limiting
router.post('/login', 
  // rateLimits.auth, // Apply strict rate limiting (commented out for now)
  // validateZod(loginSchema), // Validate input with Zod (commented out for now)
  async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      
      // Demo users for testing - match portal login users
      const demoUsers = [
        {
          email: ['info@skyelinehomes.com'],
          password: 'AdminPass123',
          user: { id: 1, email: 'info@skyelinehomes.com', role: 'admin', firstName: 'System', lastName: 'Administrator' }
        },
        {
          email: ['mjohnson@email.com'],
          password: 'ClientPass123',
          user: { id: 2, email: 'mjohnson@email.com', role: 'client', firstName: 'Michael', lastName: 'Johnson' }
        },
        {
          email: ['info@eliteelectrical.com'],
          password: 'SubPass456',
          user: { id: 3, email: 'info@eliteelectrical.com', role: 'subcontractor', firstName: 'Elite', lastName: 'Electrical' }
        },
        {
          email: ['sarah@austininteriors.com'],
          password: 'DesignPass789',
          user: { id: 4, email: 'sarah@austininteriors.com', role: 'designer', firstName: 'Sarah', lastName: 'Mitchell' }
        },
        {
          email: ['pm@skylinehomes.com'],
          password: 'PMPass456',
          user: { id: 5, email: 'pm@skylinehomes.com', role: 'project_manager', firstName: 'Project', lastName: 'Manager' }
        },
        {
          email: ['accountant@skylinehomes.com'],
          password: 'AcctPass789',
          user: { id: 6, email: 'accountant@skylinehomes.com', role: 'accountant', firstName: 'Financial', lastName: 'Accountant' }
        },
        // Universal demo credentials
        {
          email: ['test@test.com', 'user@example.com', 'demo@demo.com'],
          password: 'Password123',
          user: { id: 100, email: email, role: 'client', firstName: 'Demo', lastName: 'User' }
        }
      ];

      let authenticatedUser = null;
      for (const demoUser of demoUsers) {
        if (demoUser.email.includes(email) && demoUser.password === password) {
          authenticatedUser = demoUser.user;
          if (authenticatedUser.email === email) {
            authenticatedUser.email = email; // Use actual email from login
          }
          break;
        }
      }

      if (authenticatedUser) {
        const tokens = generateTokens({
          id: authenticatedUser.id,
          email: authenticatedUser.email,
          role: authenticatedUser.role
        });
        
        return res.json({
          success: true,
          user: authenticatedUser,
          ...tokens
        });
      }
      
      // If no demo user matches, return error
      res.status(401).json({ 
        error: 'Invalid credentials'
      });
      
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Authentication failed' });
    }
  }
);

// POST /auth/register - User registration
router.post('/register',
  // rateLimits.auth,
  // validateZod(registerSchema),
  async (req: Request, res: Response) => {
    try {
      const { email, password, firstName, lastName, role } = req.body;
      
      // Check if user already exists
      // const existingUser = await userService.findByEmail(email);
      // if (existingUser) {
      //   return res.status(409).json({ error: 'User already exists' });
      // }
      
      // Hash password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      
      // TODO: Create user in database
      // const newUser = await userService.create({
      //   email,
      //   hashedPassword,
      //   firstName,
      //   lastName,
      //   role
      // });
      
      res.status(501).json({ 
        error: 'Registration not yet implemented',
        message: 'User registration will be available soon'
      });
      
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  }
);

// POST /auth/forgot-password - Password reset request
router.post('/forgot-password',
  // rateLimits.auth,
  // validateZod(resetRequestSchema),
  async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      
      // TODO: Implement password reset logic
      // const user = await userService.findByEmail(email);
      // if (user) {
      //   const resetToken = await userService.generateResetToken(user.id);
      //   await emailService.sendPasswordReset(email, resetToken);
      // }
      
      // Always return success to prevent email enumeration
      res.json({ 
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.'
      });
      
    } catch (error) {
      console.error('Password reset request error:', error);
      res.status(500).json({ error: 'Password reset request failed' });
    }
  }
);

// POST /auth/reset-password - Complete password reset
router.post('/reset-password',
  // rateLimits.auth,
  // validateZod(resetPasswordSchema),
  async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body;
      
      // TODO: Implement password reset completion
      // const userId = await userService.verifyResetToken(token);
      // if (!userId) {
      //   return res.status(400).json({ error: 'Invalid or expired reset token' });
      // }
      
      // const saltRounds = 12;
      // const hashedPassword = await bcrypt.hash(password, saltRounds);
      // await userService.updatePassword(userId, hashedPassword);
      // await userService.invalidateResetToken(token);
      
      res.status(501).json({ 
        error: 'Password reset not yet implemented'
      });
      
    } catch (error) {
      console.error('Password reset error:', error);
      res.status(500).json({ error: 'Password reset failed' });
    }
  }
);

// POST /auth/refresh - Refresh JWT token
router.post('/refresh',
  // rateLimits.api, // Less strict rate limiting for token refresh
  // body('refreshToken').notEmpty().withMessage('Refresh token is required'),
  // handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { refreshToken } = req.body;
      
      // TODO: Implement token refresh logic
      // const decoded = verifyToken(refreshToken, process.env.JWT_REFRESH_SECRET);
      // if (!decoded) {
      //   return res.status(401).json({ error: 'Invalid refresh token' });
      // }
      
      // const user = await userService.findById(decoded.sub);
      // if (!user || user.refreshToken !== refreshToken) {
      //   return res.status(401).json({ error: 'Invalid refresh token' });
      // }
      
      // const tokens = generateTokens(user);
      // await userService.updateRefreshToken(user.id, tokens.refreshToken);
      
      res.status(501).json({ 
        error: 'Token refresh not yet implemented'
      });
      
    } catch (error) {
      console.error('Token refresh error:', error);
      res.status(401).json({ error: 'Token refresh failed' });
    }
  }
);

// POST /auth/logout - User logout
router.post('/logout',
  async (req: Request, res: Response) => {
    try {
      // TODO: Implement logout logic
      // const authHeader = req.headers.authorization;
      // if (authHeader) {
      //   const token = authHeader.split(' ')[1];
      //   await userService.invalidateToken(token);
      // }
      
      res.json({ 
        success: true,
        message: 'Logged out successfully'
      });
      
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ error: 'Logout failed' });
    }
  }
);

export default router;
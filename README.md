# Skyelineos - Construction Management System

> A comprehensive construction management platform designed for Skyeline Homes, featuring advanced project scheduling, timeline management, financial tracking, collaborative portals, robust authentication, and enterprise-grade security.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- PostgreSQL 14+
- Git

### Installation
```bash
# Clone the repository
git clone <repository-url>
cd skyelineos

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration (see Environment Variables section)

# Initialize database
npm run db:push

# Start development servers
npm run dev
```

The application will be available at `http://localhost:5000`

### Environment Variables (Required)
```bash
# Core Configuration
NODE_ENV="development"                    # Environment mode
PORT="5000"                              # Server port
DATABASE_URL="postgresql://..."          # PostgreSQL connection string

# Authentication & Security
JWT_SECRET="your-jwt-secret-32-chars+"   # JWT signing secret
REFRESH_SECRET="your-refresh-secret+"    # Refresh token secret
CORS_ORIGIN="http://localhost:3000"      # Allowed CORS origins

# Firebase Configuration (if using Firebase features)
VITE_FIREBASE_API_KEY="your-api-key"
VITE_FIREBASE_AUTH_DOMAIN="project.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="your-project-id"
VITE_FIREBASE_STORAGE_BUCKET="project.appspot.com"
VITE_FIREBASE_MESSAGING_SENDER_ID="123456789"
VITE_FIREBASE_APP_ID="1:123:web:abc123"
```

📝 **Complete environment variable reference in [Environment Variables](#environment-variables) section below.**

### Firebase Configuration (Required for Production)

1. **Create Firebase Project**:
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Create a new project or use existing
   - Enable Authentication, Firestore, and Storage

2. **Configure Environment Variables**:
   ```bash
   # Add to your .env file
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   
   # For production security (App Check)
   VITE_FIREBASE_APP_CHECK_KEY=your_recaptcha_site_key
   ```

3. **Deploy Security Rules**:
   ```bash
   # Install Firebase CLI
   npm install -g firebase-tools
   
   # Deploy Firestore and Storage rules
   firebase deploy --only firestore:rules,storage
   
   # Deploy indexes for optimized queries
   firebase deploy --only firestore:indexes
   ```

📖 **See [Firebase Deployment Guide](README_FIREBASE_DEPLOYMENT.md) for complete setup instructions.**

## 🏗️ System Architecture

### Tech Stack
- **Frontend**: React 18 + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Express.js + FastAPI (Python) + JWT Authentication
- **Database**: PostgreSQL + Drizzle ORM + Firebase Firestore
- **Storage**: Firebase Storage with security rules
- **Security**: Firebase App Check + reCAPTCHA v3
- **State Management**: TanStack Query (React Query)
- **Build Tools**: Vite + ESBuild

### Project Structure
```
/src
  /client          # React frontend components & pages
    /components    # Reusable UI components
    /pages         # Route-based page components
    /hooks         # Custom React hooks
    /lib           # Utility functions & configurations
  /server          # Express.js backend
    /routes        # API endpoint definitions
    /middleware    # Authentication, validation, etc.
    /controllers   # Business logic handlers
  /shared          # Types & utilities used by both client/server
  /db              # Database schemas & migrations
```

## 🔑 Key Features

### Project Management
- **Multi-client Support**: Handle multiple clients per project
- **Timeline Builder**: Advanced Gantt chart with dependency management
- **Task Management**: Drag-and-drop scheduling with auto-dependency detection
- **Progress Tracking**: Real-time status updates and milestone tracking

### Financial Management  
- **Estimate & Bid System**: Multi-category estimates with automated bid comparison
- **Budget Tracking**: Real-time budget vs. actual cost analysis
- **Invoice Generation**: Automated invoice creation from approved estimates
- **Cash Flow Forecasting**: Predictive financial planning tools

### Communication & Collaboration
- **User Portals**: Dedicated interfaces for Clients, Subcontractors, Designers
- **Real-time Messaging**: Cross-portal communication with file attachments
- **Document Management**: Centralized document storage with version control
- **Photo Management**: Project photo organization with role-based visibility

### Advanced Scheduling
- **Auto-scheduling**: Intelligent task sequencing based on trade dependencies
- **CSV Import**: Bulk task import from existing project schedules  
- **Weather Integration**: Weather-dependent task scheduling
- **Resource Management**: Subcontractor availability and conflict detection

## 🔐 Authentication & Security

### Authentication System

#### JWT-Based Authentication
- **Access Tokens**: Short-lived (15 minutes) tokens for API access
- **Refresh Tokens**: Long-lived (7 days) tokens for renewing access tokens
- **Secure Cookies**: HttpOnly, Secure, SameSite cookies for token storage
- **Automatic Rotation**: Refresh token rotation on each use

#### Authentication Endpoints
```bash
# Login with username/password
POST /api/auth/login
Content-Type: application/json
{
  "username": "user@example.com",
  "password": "password123"
}

# Refresh access token
POST /api/auth/refresh
# Uses refresh token from httpOnly cookie automatically

# Logout (invalidates tokens)
POST /api/auth/logout
# Clears authentication cookies
```

#### CSRF Protection
All state-changing requests (POST, PUT, DELETE) require CSRF token:
```bash
# Include CSRF token in header
X-CSRF-Token: <csrf-token-from-cookie>

# CSRF token automatically set in cookie on first request
# Frontend should read from cookie and include in headers
```

#### Socket.IO Authentication
WebSocket connections require JWT authentication:
```javascript
// Client-side connection with auth
const socket = io('http://localhost:5000', {
  auth: {
    token: 'jwt-access-token'
  }
});

// Server validates JWT before allowing connection
```

### File Upload Security

#### Access Control
- **Authentication Required**: All file uploads require valid JWT token
- **Signed URLs**: Temporary URLs for secure file access
- **Role-Based Access**: Files accessible based on user permissions
- **Content Validation**: File type and size restrictions

#### Upload Process
```bash
# 1. Request signed upload URL
POST /api/uploads/signed-url
Authorization: Bearer <jwt-token>
{
  "filename": "document.pdf",
  "contentType": "application/pdf"
}

# 2. Upload file to signed URL
PUT <signed-url>
Content-Type: application/pdf
# File content

# 3. Access uploaded file
GET /api/uploads/<file-id>
Authorization: Bearer <jwt-token>
```

### Rate Limiting
- **Default Limit**: 100 requests per 15 minutes per IP
- **Authentication Endpoints**: 5 requests per 15 minutes
- **File Uploads**: 10 uploads per hour
- **Configurable**: Adjust limits via environment variables

### User Roles & Permissions
- **Admin**: Full system access and configuration
- **Project Manager**: Project oversight and team coordination
- **Client**: Project visibility and approval workflows
- **Subcontractor**: Task management and progress reporting
- **Designer**: Design asset management and client collaboration
- **Accountant**: Financial data access and reporting

### Additional Security Features
- **CORS Protection**: Configurable cross-origin request policies
- **Input Validation**: Strict request validation with Zod schemas
- **SQL Injection Prevention**: Parameterized queries via Drizzle ORM
- **XSS Protection**: Content Security Policy headers
- **Secure Headers**: Helmet.js security headers in production

## 📊 API Documentation

### Core Endpoints
```bash
# Authentication
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout

# Projects
GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PUT    /api/projects/:id
DELETE /api/projects/:id

# Tasks & Scheduling
GET    /api/projects/:id/tasks
POST   /api/projects/:id/tasks
PUT    /api/tasks/:id
DELETE /api/tasks/:id

# Financial
GET    /api/projects/:id/estimates
POST   /api/projects/:id/estimates
GET    /api/transactions
POST   /api/transactions

# Messaging
GET    /api/messages/threads
POST   /api/messages/threads
GET    /api/messages/threads/:id
POST   /api/messages/threads/:id/messages
```

## 🧪 Development & Testing

### Running Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- --testPathPattern=auth.spec.ts
```

### Test Coverage
The test suite includes comprehensive coverage for:

#### Authentication Tests (`server/__tests__/auth.spec.ts`)
- JWT token generation and validation
- Login endpoint with valid/invalid credentials
- Refresh token rotation and validation
- Protected route access control
- Token expiration handling

#### CSRF Protection Tests (`server/__tests__/csrf.spec.ts`)
- CSRF token generation and validation
- POST request protection without CSRF token
- Header-based CSRF token validation
- CSRF token cookie management

#### File Upload Tests (`server/__tests__/uploads.spec.ts`)
- Authentication requirements for uploads
- Signed URL generation and expiration
- File access control based on user permissions
- Content type and size validation

#### Socket.IO Tests (`server/__tests__/socket.spec.ts`)
- JWT-based WebSocket connection authentication
- Connection rejection for invalid tokens
- Real-time message authentication

### Test Setup & Troubleshooting

#### Known Issues & Fixes
The test suite has comprehensive test files but may require Jest configuration updates:

1. **Jest Configuration Fix**: If tests fail to run, update `jest.config.js`:
   ```javascript
   // Fix moduleNameMapping typo and update configuration
   module.exports = {
     preset: 'ts-jest',
     testEnvironment: 'node',
     moduleNameMapping: {  // Fixed from moduleNameMapping
       '^@/(.*)$': '<rootDir>/src/$1',
       '^@shared/(.*)$': '<rootDir>/shared/$1'
     },
     setupFilesAfterEnv: ['<rootDir>/jest.setup.js']
   };
   ```

2. **TextEncoder Error Fix**: Add to `jest.setup.js`:
   ```javascript
   // Add Node.js globals for test environment
   global.TextEncoder = require('util').TextEncoder;
   global.TextDecoder = require('util').TextDecoder;
   ```

3. **Environment Variables**: Ensure test environment variables are set:
   ```bash
   # Required for tests
   TEST_DATABASE_URL="postgresql://user:pass@localhost:5432/skyelineos_test"
   TEST_JWT_SECRET="test-jwt-secret-32-chars"
   TEST_REFRESH_SECRET="test-refresh-secret-32-chars"
   ```

### Code Quality
```bash
# Type checking
npm run check

# Linting
npm run lint
npm run lint:fix

# Formatting
npm run format
npm run format:check
```

### Database Management
```bash
# Push schema changes
npm run db:push

# Generate migrations
npm run db:generate

# Run migrations
npm run db:migrate

# Reset database (development only)
npm run db:reset
```

## 🚀 Deployment

### Environment Variables

#### Required Variables
```bash
# Core Configuration
NODE_ENV="production"                     # Environment mode
PORT="5000"                              # Server port
DATABASE_URL="postgresql://..."          # PostgreSQL connection

# Authentication & Security (REQUIRED)
JWT_SECRET="your-jwt-secret-32-chars+"   # JWT signing secret
REFRESH_SECRET="your-refresh-secret+"    # Refresh token secret
CORS_ORIGIN="https://yourdomain.com"     # Allowed CORS origins
```

#### Firebase Variables (If Using Firebase)
```bash
# Firebase Web App Configuration
VITE_FIREBASE_API_KEY="your-api-key"
VITE_FIREBASE_AUTH_DOMAIN="project.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="your-project-id"
VITE_FIREBASE_STORAGE_BUCKET="project.appspot.com"
VITE_FIREBASE_MESSAGING_SENDER_ID="123456789"
VITE_FIREBASE_APP_ID="1:123:web:abc123"
VITE_FIREBASE_MEASUREMENT_ID="G-XXXXXXXXXX"

# Firebase App Check (Production Security)
VITE_FIREBASE_APP_CHECK_KEY="your-recaptcha-site-key"
```

#### Optional Variables
```bash
# Rate Limiting
RATE_LIMIT_MAX="100"                     # Requests per window
RATE_LIMIT_WINDOW="900000"               # Window in milliseconds (15 min)

# File Upload Configuration
MAX_FILE_SIZE="10485760"                 # Max file size (10MB)
UPLOAD_DIR="./uploads"                   # Upload directory

# Database Connection Pool
DATABASE_MAX_CONNECTIONS="10"            # Max DB connections
DATABASE_SSL="true"                      # Enable SSL for DB

# Logging
LOG_LEVEL="info"                         # Logging level (debug, info, warn, error)
LOG_FILE="./logs/app.log"               # Log file path

# External Integrations
SMTP_HOST=""                            # Email server
SMTP_PORT="587"                         # Email port
STRIPE_SECRET_KEY=""                    # Payment processing
TWILIO_ACCOUNT_SID=""                   # SMS notifications
```

### Production Setup
1. Set `NODE_ENV=production`
2. Configure PostgreSQL connection with SSL
3. Generate secure JWT secrets (32+ characters)
4. Set up CORS origins for your domain
5. Configure rate limiting appropriate for your traffic
6. Set up reverse proxy (nginx) with SSL
7. Configure monitoring and structured logging
8. Set up automated database backups

## 🛠️ Troubleshooting

### Common Issues

**Database Connection Issues**
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Test database connection
psql -h localhost -U postgres -d buildflow
```

**File Upload Problems**
- Verify `UPLOAD_DIR` permissions
- Check `MAX_FILE_SIZE` configuration
- Ensure disk space availability

**Authentication Errors**
- Verify JWT secrets are set
- Check token expiration settings
- Validate user permissions

### Performance Optimization
- Enable database query logging in development
- Use React.memo for expensive components
- Implement proper caching strategies
- Monitor bundle size with webpack-bundle-analyzer

## 📈 Monitoring & Logging

### Recommended Tools
- **Error Tracking**: Sentry integration
- **Performance**: New Relic or DataDog
- **Logging**: Winston with structured JSON output
- **Database**: pganalyze for PostgreSQL monitoring

## 🤝 Contributing

### Development Workflow
1. Create feature branch from `main`
2. Make changes with appropriate tests
3. Run linting and type checking
4. Submit pull request with detailed description
5. Ensure CI passes before merging

### Code Standards
- Use TypeScript for all new code
- Follow the established component patterns
- Write meaningful commit messages
- Update documentation for API changes

## 📝 License

This project is proprietary software developed for Skyeline Homes.

---

**Support**: For technical issues or feature requests, contact the development team.
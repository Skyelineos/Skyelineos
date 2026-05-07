// Comprehensive type definitions for BuildFlow
import { z } from 'zod';

// Project Types
export interface DatabaseProject {
  id: string;
  name: string;
  clientName: string;
  clientIds?: string;
  clientEmail?: string;
  clientPhone?: string;
  address?: string;
  squareFootage?: number;
  estimatedBudget?: number;
  actualCost?: number;
  status?: string;
  startDate?: string;
  targetCompletion?: string;
  actualCompletion?: string;
  projectManagerId?: number;
  notes?: string;
  projectMetadata?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TransformedProject extends DatabaseProject {
  projectManagerName?: string;
  projectManagerEmail?: string;
  formattedBudget?: string;
  statusColor?: string;
  daysRemaining?: number;
}

// Contact Types
export interface Contact {
  id: string; // Firebase document ID - string type for Firebase
  name: string;
  email?: string;
  phone?: string;
  role: string;
  type?: string; // Firebase API compatibility 
  company?: string;
  trade?: string; // Legacy single trade for backwards compatibility
  trades?: string[]; // Array of trades for subcontractors
  associatedProjects?: string[]; // Array of project IDs
  notes?: string;
  avatarUrl?: string;
  rating?: number;
  tags?: string[];
  isActive?: boolean;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  lastContact?: string;
  // Insurance fields for subcontractors
  insuranceProvider?: string;
  insurancePolicyNumber?: string;
  insuranceExpirationDate?: string;
  insuranceFileUrl?: string;
  w9FileUrl?: string;
  // Portal access fields
  hasPortalAccess?: boolean;
  portalEmail?: string;
  portalPassword?: string;
  portalRole?: string;
  lastPortalLogin?: string;
  portalAccessGrantedAt?: string;
  // Timestamps - Firebase format
  createdAt?: any; // Firebase Timestamp
  updatedAt?: any; // Firebase Timestamp
}

// Estimate Types
export interface EstimateItem {
  id: string;
  title?: string;
  trade: string;
  vendor?: string;
  description?: string;
  estimatedCost: number;
  markup?: number;
  contingency?: number;
  duration?: number;
  status: string;
  costType?: string;
  orderIndex?: number;
  attachments?: string[];
}

export interface EstimateCategory {
  id: string;
  name: string;
  items: EstimateItem[];
  orderIndex?: number;
}

export interface Estimate {
  id: number;
  projectId: number;
  name: string;
  description?: string;
  categories: EstimateCategory[];
  totalCost: number;
  totalDuration?: number;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

// Bid Types
export interface BidResponse {
  subId: string;
  subName: string;
  subCompany?: string;
  trade: string;
  bidAmount: number;
  status: string;
  bidSentAt: string;
  timeline?: number;
  notes?: string;
}

export interface BidItem {
  id: string;
  projectId: string;
  trade: string;
  description: string;
  estimatedCost: number;
  bids: BidResponse[];
  status: string;
}

// Purchase Order Types
export interface PurchaseOrder {
  id: string;
  projectId: number;
  estimateId?: number;
  estimateItemId?: string;
  trade: string;
  subcontractorId: number;
  poId: string;
  amount: number;
  durationDays: number;
  description: string;
  files?: string[];
  status: string;
  createdAt: string;
  createdBy?: string;
  sentToSubAt?: string;
  approvedForSend?: boolean;
}

// WebSocket Types
export interface WebSocketMessage {
  type: string;
  channel?: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export interface WebSocketProjectUpdate {
  projectId: number;
  updateType: string;
  data: Record<string, unknown>;
}

export interface WebSocketNotification {
  id: string;
  userId: number;
  type: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  data?: Record<string, unknown>;
}

// API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Form Input Types
export interface ProjectFormData {
  name: string;
  clientName: string;
  address: string;
  estimatedBudget?: number;
  squareFootage?: number;
  description?: string;
  notes?: string;
}

export interface ContactFormData {
  name: string;
  email: string;
  phone: string;
  role: string;
  company?: string;
  trade?: string;
  notes?: string;
}

// File Upload Types
export interface FileUpload {
  filename: string;
  originalName: string;
  size: number;
  path: string;
  mimeType: string;
}

export interface BidUploadData {
  bidProcessId: number;
  contactId: number;
  bidAmount: number;
  timeline: number;
  notes?: string;
  attachments: FileUpload[];
}

// Utility Types
export type SortDirection = 'asc' | 'desc';
export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled';
export type EstimateStatus = 'Estimating' | 'Bidding' | 'Waiting Approval' | 'Approved' | 'Rejected' | 'Client Signed';
export type UserRole = 'admin' | 'project_manager' | 'accountant' | 'client' | 'subcontractor' | 'designer';

// Validation Schemas
export const projectFormSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  clientName: z.string().min(1, 'Client name is required'),
  address: z.string().min(1, 'Address is required'),
  estimatedBudget: z.number().positive().optional(),
  squareFootage: z.number().positive().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
});

export const contactFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().min(1, 'Phone number is required'),
  role: z.string().min(1, 'Role is required'),
  company: z.string().optional(),
  trade: z.string().optional(),
  notes: z.string().optional(),
});

export const bidResponseSchema = z.object({
  bidProcessId: z.number(),
  contactId: z.number(),
  bidAmount: z.number().positive(),
  timeline: z.number().positive(),
  notes: z.string().optional(),
});
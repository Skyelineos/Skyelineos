import { pgTable, serial, text, integer, real, timestamp, boolean, json, varchar, decimal } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// Users table for authentication
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  username: text('username'),
  fullName: text('full_name'),
  firebaseUid: text('firebase_uid').unique(), // Firebase UID for integration
  hashedPassword: text('hashed_password'), // Nullable since Firebase handles auth
  role: text('role').notNull().default('client'), // admin, project_manager, accountant, client, subcontractor
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Note: Using stateless JWT authentication - no session storage needed

// System audit log for security  
export const auditLog = pgTable('audit_log', {
  id: serial('id').primaryKey(),
  userId: integer('user_id'),
  action: text('action').notNull(),
  resource: text('resource'),
  resourceId: text('resource_id'),
  oldValues: json('old_values'),
  newValues: json('new_values'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  timestamp: timestamp('timestamp').defaultNow(),
});

// Comprehensive audit logs table for detailed tracking
export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  action: text('action').notNull(),
  projectId: integer('project_id'),
  timestamp: text('timestamp').notNull(),
  endpoint: text('endpoint'),
  method: text('method'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  meta: text('meta'), // JSON string of additional metadata
  createdAt: timestamp('created_at').defaultNow(),
});

// System settings for admin configuration
export const systemSettings = pgTable('system_settings', {
  id: serial('id').primaryKey(),
  settingKey: text('setting_key').notNull().unique(),
  settingValue: text('setting_value'),
  settingType: text('setting_type').default('text'), // text, file_url, boolean, json
  description: text('description'),
  updatedBy: integer('updated_by'), // userId who made the change
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  clientName: text('client_name').notNull(), // Keep for backward compatibility
  clientIds: text('client_ids'), // JSON array of client contact IDs
  clientEmail: text('client_email'),
  clientPhone: text('client_phone'),
  address: text('address'),
  location: text('location'), // Project location field
  squareFootage: real('square_footage'),
  estimatedBudget: real('estimated_budget'),
  budget: real('budget'), // Additional budget field for calculations
  actualCost: real('actual_cost').default(0),
  spent: real('spent').default(0), // Amount spent so far
  progress: real('progress').default(0), // Project progress percentage
  status: text('status').default('planning'),
  startDate: timestamp('start_date'),
  endDate: timestamp('end_date'), // Project end date
  targetCompletion: timestamp('target_completion'),
  actualCompletion: timestamp('actual_completion'),
  projectManagerId: integer('project_manager_id'),
  notes: text('notes'),
  projectMetadata: text('project_metadata'), // JSON as text
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const estimates = pgTable('estimates', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  categories: text('categories'), // JSON array of estimate categories
  totalCost: real('total_cost').default(0),
  totalDuration: integer('total_duration').default(0), // in days
  status: text('status').default('draft'), // draft, sent, approved, rejected
  sentAt: timestamp('sent_at'),
  approvedAt: timestamp('approved_at'),
  approvedBy: integer('approved_by'), // userId who approved
  rejectedAt: timestamp('rejected_at'),
  rejectedBy: integer('rejected_by'), // userId who rejected
  rejectionReason: text('rejection_reason'),
  clientMessage: text('client_message'), // Message from client when approving/rejecting
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const estimateCategories = pgTable('estimate_categories', {
  id: serial('id').primaryKey(),
  estimateId: integer('estimate_id').notNull(),
  name: text('name').notNull(),
  orderIndex: integer('order_index').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

export const estimateItems = pgTable('estimate_items', {
  id: serial('id').primaryKey(),
  categoryId: integer('category_id').notNull(),
  title: text('title'), // New field for item titles
  trade: text('trade').notNull(),
  vendor: text('vendor'),
  description: text('description'),
  estimatedCost: real('estimated_cost').notNull().default(0),
  markup: real('markup').default(0), // percentage
  contingency: real('contingency').default(0), // percentage
  duration: integer('duration').default(0), // in days
  status: text('status').default('Estimating'), // Estimating, Bidding, Waiting Approval, Approved, Rejected
  costType: text('cost_type'), // subcontractor, materials, labor, equipment, permits, other
  requiresBid: boolean('requires_bid').notNull().default(true), // Flag to control bidding workflow
  orderIndex: integer('order_index').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// New bidding process table - one per estimate item
export const bidProcesses = pgTable('bid_processes', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  estimateItemId: integer('estimate_item_id').notNull(),
  trade: text('trade').notNull(),
  invitedSubcontractors: text('invited_subcontractors'), // JSON array of contactId references
  selectedEstimateSnapshot: text('selected_estimate_snapshot'), // JSON snapshot of the estimate item
  status: text('status').default('Bidding'), // Bidding, Evaluating, Awarded
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Project Documents
export const projectDocuments = pgTable('project_documents', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  fileName: text('filename').notNull(),
  originalFileName: text('original_filename').notNull(),
  fileUrl: text('file_path').notNull(),
  documentType: text('file_type'), // build_plan, purchase_order, change_order, invoice
  fileSize: integer('file_size'),
  uploadedBy: integer('uploaded_by'), // userId
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow(),
  targetId: integer('target_id'), // Optional reference to PO, Change Order, or Invoice ID
});

// Purchase Orders
export const purchaseOrders = pgTable('purchase_orders', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  contactId: integer('contact_id').notNull(), // subcontractor
  estimateItemId: integer('estimate_item_id'), // linked to approved estimate item
  poNumber: text('po_number').notNull(),
  trade: text('trade').notNull(),
  description: text('description'),
  amount: real('amount').notNull(),
  duration: integer('duration').default(0), // in days
  startDate: timestamp('start_date'),
  endDate: timestamp('end_date'),
  status: text('status').default('draft'), // draft, sent, signed, completed, cancelled
  statusHistory: text('status_history'), // JSON array of status changes
  signedBy: integer('signed_by'), // contactId of who signed
  signedAt: timestamp('signed_at'),
  signature: text('signature'), // base64 encoded signature or signature method
  cancellationReason: text('cancellation_reason'),
  signedDocumentId: integer('signed_document_id'), // references project_documents
  // Payment tracking fields
  appliedInvoices: text('applied_invoices'), // JSON array of invoice IDs and amounts
  totalPaid: decimal('total_paid', { precision: 10, scale: 2 }).default('0'),
  balanceRemaining: decimal('balance_remaining', { precision: 10, scale: 2 }).default('0'),
  poStatus: text('po_status').default('unpaid'), // unpaid, partial, paid
  createdBy: integer('created_by'), // userId
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Project Photos
export const projectPhotos = pgTable('project_photos', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  url: text('url').notNull(), // Firebase Storage URL
  uploadedBy: integer('uploaded_by').notNull(), // userId
  role: text('role').notNull(), // Admin, ProjectManager, Client, Subcontractor
  caption: text('caption'),
  category: text('category'), // Framing, Punchlist, etc.
  visibleToClient: boolean('visible_to_client').default(true),
  approvedByAdmin: boolean('approved_by_admin').default(false),
  fileName: text('file_name').notNull(),
  fileSize: integer('file_size'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Change Orders
export const changeOrders = pgTable('change_orders', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  purchaseOrderId: integer('purchase_order_id'), // optional reference
  contactId: integer('contact_id').notNull(), // subcontractor
  changeOrderNumber: text('change_order_number').notNull(),
  description: text('description').notNull(),
  costImpact: real('cost_impact').notNull(), // positive or negative
  timeImpact: integer('time_impact').default(0), // days added/subtracted
  status: text('status').default('pending'), // pending, approved, rejected
  signedDocumentId: integer('signed_document_id'), // references project_documents
  submittedBy: integer('submitted_by'), // userId
  approvedBy: integer('approved_by'), // userId
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Individual subcontractor responses to bid invitations
export const bidResponses = pgTable('bid_responses', {
  id: serial('id').primaryKey(),
  bidProcessId: integer('bid_process_id').notNull(),
  contactId: integer('contact_id').notNull(), // Reference to contacts table (subcontractor)
  bidAmount: real('bid_amount').notNull(),
  timeline: integer('timeline').notNull(), // in days
  notes: text('notes'),
  attachments: text('attachments'), // JSON array of file info
  status: text('status').default('submitted'), // submitted, selected, rejected
  submittedAt: timestamp('submitted_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Legacy bids table - keeping for backward compatibility
export const bids = pgTable('bids', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  estimateId: integer('estimate_id'),
  contractorName: text('contractor_name').notNull(),
  contractorEmail: text('contractor_email'),
  contractorPhone: text('contractor_phone'),
  bidAmount: real('bid_amount').notNull(),
  timeline: text('timeline'),
  status: text('status').default('pending'), // pending, accepted, rejected
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const bidItems = pgTable('bid_items', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  estimateId: integer('estimate_id').notNull(),
  estimateItemId: text('estimate_item_id').notNull(), // references item ID within estimate JSON
  contactId: integer('contact_id').notNull(), // Reference to contacts table (subcontractor)
  bidAmount: real('bid_amount').notNull(),
  timeline: integer('timeline').notNull(), // in days
  notes: text('notes'),
  status: text('status').default('pending'), // pending, accepted, rejected
  trade: text('trade').notNull(),
  category: text('category').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const contacts = pgTable('contacts', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  phone: text('phone').notNull(),
  role: text('role').notNull(), // client, subcontractor, designer, pm
  company: text('company'),
  trade: text('trade'), // Legacy single trade for backwards compatibility
  trades: text('trades'), // JSON array of trades for subcontractors
  associatedProjects: text('associated_projects'), // JSON array as text
  notes: text('notes'),
  avatarUrl: text('avatar_url'),
  rating: integer('rating').default(0),
  tags: text('tags'), // JSON array as text
  isActive: boolean('is_active').default(true),
  address: text('address'),
  city: text('city'),
  state: text('state'),
  zipCode: text('zip_code'),
  lastContact: timestamp('last_contact'),
  // Insurance fields for subcontractors
  insuranceProvider: text('insurance_provider'),
  insurancePolicyNumber: text('insurance_policy_number'),
  insuranceExpirationDate: timestamp('insurance_expiration_date'),
  insuranceFileUrl: text('insurance_file_url'),
  w9FileUrl: text('w9_file_url'),
  // Subcontractor documentation compliance
  w9Uploaded: boolean('w9_uploaded').default(false),
  insuranceUploaded: boolean('insurance_uploaded').default(false),
  agreementSigned: boolean('agreement_signed').default(false),
  customAgreementUrl: text('custom_agreement_url'), // Custom agreement per subcontractor
  documentationCompletedAt: timestamp('documentation_completed_at'),
  // Portal access fields
  hasPortalAccess: boolean('has_portal_access').default(false),
  portalEmail: text('portal_email'), // Email used for portal login (can be different from contact email)
  portalPassword: text('portal_password'), // Hashed password for portal access
  lastPortalLogin: timestamp('last_portal_login'),
  isFirstLogin: boolean('is_first_login').default(true), // Trigger setup page
  portalAccessGrantedAt: timestamp('portal_access_granted_at'),
  portalAccessGrantedBy: integer('portal_access_granted_by'), // ID of admin who granted access
  // Compliance tracking fields for subcontractors
  isCompliant: boolean('is_compliant').default(false), // Must be true for PO/invoice actions
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});



// Enhanced Invoices from subcontractors with automated creation and payment tracking
export const invoices = pgTable('invoices', {
  id: serial('id').primaryKey(),
  invoiceId: text('invoice_id').notNull().unique(), // Auto-generated invoice ID
  projectId: integer('project_id').notNull(),
  contactId: integer('contact_id').notNull(), // Reference to subcontractor in contacts table
  poId: integer('po_id'), // Optional reference to related PO
  invoiceNumber: text('invoice_number').notNull(),
  description: text('description'),
  amount: real('amount').notNull(),
  trade: text('trade').notNull(),
  workPeriod: text('work_period'), // e.g., "Week of Jan 1-7, 2025"
  materials: text('materials'), // JSON array of material line items
  labor: text('labor'), // JSON array of labor line items
  attachments: text('attachments'), // JSON array of photo/document URLs
  submittedDate: timestamp('submitted_date').defaultNow(),
  dueDate: timestamp('due_date'),
  status: text('status').default('pending_approval'), // pending_approval, approved, partial_paid, paid_in_full
  approvedBy: integer('approved_by'), // Admin/PM who approved
  approvedAt: timestamp('approved_at'),
  approvedByAdminAt: timestamp('approved_by_admin_at'),
  // Enhanced payment tracking fields
  payments: text('payments'), // JSON array of payment records
  totalPaid: decimal('total_paid', { precision: 10, scale: 2 }).default('0'),
  remainingBalance: decimal('remaining_balance', { precision: 10, scale: 2 }),
  isAutoGenerated: boolean('is_auto_generated').default(false), // Track if auto-created from PO
  linkedJobId: integer('linked_job_id'), // Reference to completed job/task that triggered auto-creation
  paidAt: timestamp('paid_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Payment records for invoices - separate table for better tracking
export const invoicePayments = pgTable('invoice_payments', {
  id: serial('id').primaryKey(),
  invoiceId: integer('invoice_id').notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  paymentDate: timestamp('payment_date').notNull(),
  paymentMethod: text('payment_method').notNull(), // 'Bank Transfer', 'Check', 'ACH', 'Wire', 'Cash'
  checkNumber: text('check_number'),
  referenceNumber: text('reference_number'),
  notes: text('notes'),
  recordedBy: integer('recorded_by'), // Admin/PM who recorded payment
  createdAt: timestamp('created_at').defaultNow(),
});

// Client payments from project owners
export const clientPayments = pgTable('client_payments', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  amount: real('amount').notNull(),
  paymentDate: timestamp('payment_date').notNull(),
  paymentMethod: text('payment_method').notNull(), // check, wire, ach, credit_card
  checkNumber: text('check_number'),
  description: text('description'),
  notes: text('notes'),
  createdBy: integer('created_by'), // Admin/Accountant who recorded payment
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Project budget summary cache for performance
export const projectBudgetSummary = pgTable('project_budget_summary', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().unique(),
  totalEstimate: real('total_estimate').default(0),
  totalClientPayments: real('total_client_payments').default(0),
  totalSubInvoices: real('total_sub_invoices').default(0),
  remainingToInvoiceClient: real('remaining_to_invoice_client').default(0),
  remainingToPaySubs: real('remaining_to_pay_subs').default(0),
  projectedMargin: real('projected_margin').default(0),
  lastUpdated: timestamp('last_updated').defaultNow(),
});

// Advanced Financial Management Tables
export const costCategories = pgTable('cost_categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  color: text('color').default('#3B82F6'),
  orderIndex: integer('order_index').default(0),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

export const actualCosts = pgTable('actual_costs', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  categoryId: integer('category_id'),
  trade: text('trade'),
  description: text('description').notNull(),
  amount: real('amount').notNull(),
  costDate: timestamp('cost_date').notNull(),
  costType: text('cost_type').notNull(), // labor, materials, equipment, overhead
  vendorId: integer('vendor_id'), // Reference to contacts
  invoiceNumber: text('invoice_number'),
  purchaseOrderId: integer('purchase_order_id'),
  isApproved: boolean('is_approved').default(false),
  approvedBy: integer('approved_by'),
  approvedAt: timestamp('approved_at'),
  notes: text('notes'),
  createdBy: integer('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const budgetVariances = pgTable('budget_variances', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  trade: text('trade'),
  categoryId: integer('category_id'),
  budgetedAmount: real('budgeted_amount').notNull(),
  actualAmount: real('actual_amount').notNull(),
  varianceAmount: real('variance_amount').notNull(),
  variancePercentage: real('variance_percentage').notNull(),
  status: text('status').default('tracking'), // tracking, flagged, critical
  notes: text('notes'),
  calculatedAt: timestamp('calculated_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const cashFlowForecasts = pgTable('cash_flow_forecasts', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  forecastDate: timestamp('forecast_date').notNull(),
  forecastType: text('forecast_type').notNull(), // payment_in, payment_out, milestone
  description: text('description').notNull(),
  amount: real('amount').notNull(),
  probability: real('probability').default(1.0), // 0.0 to 1.0
  isActual: boolean('is_actual').default(false),
  actualDate: timestamp('actual_date'),
  actualAmount: real('actual_amount'),
  notes: text('notes'),
  createdBy: integer('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const profitMarginAnalysis = pgTable('profit_margin_analysis', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  trade: text('trade'),
  categoryId: integer('category_id'),
  revenue: real('revenue').notNull(),
  directCosts: real('direct_costs').notNull(),
  indirectCosts: real('indirect_costs').default(0),
  grossProfit: real('gross_profit').notNull(),
  grossMarginPercentage: real('gross_margin_percentage').notNull(),
  netProfit: real('net_profit').notNull(),
  netMarginPercentage: real('net_margin_percentage').notNull(),
  analysisDate: timestamp('analysis_date').notNull(),
  notes: text('notes'),
  createdBy: integer('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const automatedPOs = pgTable('automated_pos', {
  id: serial('id').primaryKey(),
  bidResponseId: integer('bid_response_id').notNull(),
  purchaseOrderId: integer('purchase_order_id'),
  projectId: integer('project_id').notNull(),
  estimateItemId: integer('estimate_item_id').notNull(),
  contactId: integer('contact_id').notNull(),
  amount: real('amount').notNull(),
  autoGeneratedAt: timestamp('auto_generated_at').defaultNow(),
  status: text('status').default('pending'), // pending, generated, sent, accepted
  approvedBy: integer('approved_by'),
  approvedAt: timestamp('approved_at'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const invoiceMatching = pgTable('invoice_matching', {
  id: serial('id').primaryKey(),
  invoiceId: integer('invoice_id').notNull(),
  purchaseOrderId: integer('purchase_order_id'),
  projectId: integer('project_id').notNull(),
  matchingScore: real('matching_score').notNull(),
  matchingStatus: text('matching_status').notNull(), // auto_matched, requires_review, manual_match
  discrepancies: text('discrepancies'), // JSON array of discrepancy details
  autoMatchedAt: timestamp('auto_matched_at'),
  reviewedBy: integer('reviewed_by'),
  reviewedAt: timestamp('reviewed_at'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const paymentProcessing = pgTable('payment_processing', {
  id: serial('id').primaryKey(),
  invoiceId: integer('invoice_id').notNull(),
  purchaseOrderId: integer('purchase_order_id'),
  projectId: integer('project_id').notNull(),
  vendorId: integer('vendor_id').notNull(),
  amount: real('amount').notNull(),
  paymentMethod: text('payment_method').notNull(), // check, ach, wire, credit_card
  scheduledDate: timestamp('scheduled_date').notNull(),
  processedDate: timestamp('processed_date'),
  status: text('status').default('scheduled'), // scheduled, processing, completed, failed
  paymentReference: text('payment_reference'),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  failureReason: text('failure_reason'),
  notes: text('notes'),
  createdBy: integer('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Project Schedule/Tasks for Gantt chart and calendar view
export const projectTasks = pgTable('project_tasks', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  sectionId: integer('section_id'), // FK to schedule_sections table for organization
  name: text('name').notNull(), // Task name field
  title: text('title').notNull(),
  trade: text('trade').notNull(),
  category: text('category'), // Task category field
  priority: text('priority').default('medium'), // Task priority field
  isMilestone: boolean('is_milestone').default(false), // Milestone flag
  contactId: integer('contact_id'), // Reference to subcontractor in contacts table
  estimateItemId: integer('estimate_item_id'), // Reference to original estimate item if auto-generated
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
  duration: integer('duration').notNull(), // in days
  status: text('status').default('Scheduled'), // Scheduled, In Progress, Completed, Cancelled, Delayed
  description: text('description'),
  notes: text('notes'),
  dependsOn: text('depends_on'), // JSON array of task IDs this task depends on
  isAutoGenerated: boolean('is_auto_generated').default(false),
  color: text('color'), // hex color code for timeline visualization
  orderIndex: integer('order_index').default(0), // For ordering within sections
  weatherDependent: boolean('weather_dependent').default(false),
  inspectorRequired: boolean('inspector_required').default(false),
  createdBy: integer('created_by'), // Admin/PM who created the task
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Schedule sections for organizing tasks into groups
export const scheduleSections = pgTable('schedule_sections', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  orderIndex: integer('order_index').default(0),
  isCollapsed: boolean('is_collapsed').default(false),
  color: text('color'), // Section header color
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Task dependencies for Gantt chart dependency management
export const taskDependencies = pgTable('task_dependencies', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  fromTaskId: integer('from_task_id').notNull(),
  toTaskId: integer('to_task_id').notNull(),
  dependencyType: text('dependency_type').notNull().default('FS'), // FS (Finish-to-Start), SS (Start-to-Start), FF (Finish-to-Finish), SF (Start-to-Finish)
  lagDays: integer('lag_days').default(0), // Number of days lag (can be negative for lead time)
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Schedule Templates table
export const scheduleTemplates = pgTable('schedule_templates', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  projectId: integer('project_id'), // Optional: template can be created from a specific project
  tasksData: json('tasks_data').notNull(), // JSON serialized array of task data
  dependenciesData: json('dependencies_data').notNull(), // JSON serialized array of dependency data
  createdBy: integer('created_by').notNull(), // User who created the template
  isPublic: boolean('is_public').default(false), // Whether template can be used by others
  usageCount: integer('usage_count').default(0), // Track how many times template has been used
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Financial tracking table for project expenses and income (matches Firebase collection structure)
export const financials = pgTable('financials', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  lineItem: text('line_item').notNull(),
  category: text('category').notNull(),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  paidToDate: decimal('paid_to_date', { precision: 12, scale: 2 }).default('0.00').notNull(),
  dateIncurred: text('date_incurred').notNull(), // Format: YYYY-MM-DD
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEstimateSchema = createInsertSchema(estimates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEstimateCategorySchema = createInsertSchema(estimateCategories).omit({
  id: true,
  createdAt: true,
});

export const insertEstimateItemSchema = createInsertSchema(estimateItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBidSchema = createInsertSchema(bids).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBidItemSchema = createInsertSchema(bidItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertClientPaymentSchema = createInsertSchema(clientPayments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProjectTaskSchema = createInsertSchema(projectTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertScheduleSectionSchema = createInsertSchema(scheduleSections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTaskDependencySchema = createInsertSchema(taskDependencies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertScheduleTemplateSchema = createInsertSchema(scheduleTemplates).omit({
  id: true,
  usageCount: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFinancialSchema = createInsertSchema(financials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProjectPhotoSchema = createInsertSchema(projectPhotos).omit({
  id: true,
  createdAt: true,
});

export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertEstimate = z.infer<typeof insertEstimateSchema>;
export type Estimate = typeof estimates.$inferSelect;
export type InsertEstimateCategory = z.infer<typeof insertEstimateCategorySchema>;
export type EstimateCategory = typeof estimateCategories.$inferSelect;
export type InsertEstimateItem = z.infer<typeof insertEstimateItemSchema>;
export type EstimateItem = typeof estimateItems.$inferSelect;
export type InsertBid = z.infer<typeof insertBidSchema>;
export type Bid = typeof bids.$inferSelect;
export type InsertBidItem = z.infer<typeof insertBidItemSchema>;
export type BidItem = typeof bidItems.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contacts.$inferSelect;
export type BidProcess = typeof bidProcesses.$inferSelect;
export type InsertBidProcess = typeof bidProcesses.$inferInsert;
export type BidResponse = typeof bidResponses.$inferSelect;
export type InsertBidResponse = typeof bidResponses.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;

// Document types
export type ProjectDocument = typeof projectDocuments.$inferSelect;
export type InsertProjectDocument = typeof projectDocuments.$inferInsert;
export type ProjectPhoto = typeof projectPhotos.$inferSelect;
export type InsertProjectPhoto = typeof projectPhotos.$inferInsert;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrder = typeof purchaseOrders.$inferInsert;
export type ChangeOrder = typeof changeOrders.$inferSelect;
export type InsertChangeOrder = typeof changeOrders.$inferInsert;
export type InsertInvoice = typeof invoices.$inferInsert;
export type InvoicePayment = typeof invoicePayments.$inferSelect;
export type InsertInvoicePayment = typeof invoicePayments.$inferInsert;
export type ProjectTask = typeof projectTasks.$inferSelect;
export type InsertProjectTask = z.infer<typeof insertProjectTaskSchema>;
export type ClientPayment = typeof clientPayments.$inferSelect;
export type InsertClientPayment = z.infer<typeof insertClientPaymentSchema>;
export type ProjectBudgetSummary = typeof projectBudgetSummary.$inferSelect;
export type InsertProjectBudgetSummary = typeof projectBudgetSummary.$inferInsert;

// Advanced Financial Management Types
export type CostCategory = typeof costCategories.$inferSelect;
export type InsertCostCategory = typeof costCategories.$inferInsert;
export type ActualCost = typeof actualCosts.$inferSelect;
export type InsertActualCost = typeof actualCosts.$inferInsert;
export type BudgetVariance = typeof budgetVariances.$inferSelect;
export type InsertBudgetVariance = typeof budgetVariances.$inferInsert;
export type CashFlowForecast = typeof cashFlowForecasts.$inferSelect;
export type InsertCashFlowForecast = typeof cashFlowForecasts.$inferInsert;
export type ProfitMarginAnalysis = typeof profitMarginAnalysis.$inferSelect;
export type InsertProfitMarginAnalysis = typeof profitMarginAnalysis.$inferInsert;
export type AutomatedPO = typeof automatedPOs.$inferSelect;
export type InsertAutomatedPO = typeof automatedPOs.$inferInsert;
export type InvoiceMatching = typeof invoiceMatching.$inferSelect;
export type InsertInvoiceMatching = typeof invoiceMatching.$inferInsert;
export type PaymentProcessing = typeof paymentProcessing.$inferSelect;
export type InsertPaymentProcessing = typeof paymentProcessing.$inferInsert;

// Schedule types
export type ScheduleSection = typeof scheduleSections.$inferSelect;
export type InsertScheduleSection = z.infer<typeof insertScheduleSectionSchema>;
export type TaskDependency = typeof taskDependencies.$inferSelect;
export type InsertTaskDependency = z.infer<typeof insertTaskDependencySchema>;
export type ScheduleTemplate = typeof scheduleTemplates.$inferSelect;
export type InsertScheduleTemplate = z.infer<typeof insertScheduleTemplateSchema>;

// User authentication types
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
// Note: UserSession types removed - using stateless JWT authentication
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type InsertAuditLogEntry = typeof auditLog.$inferInsert;

// System settings types
export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = typeof systemSettings.$inferInsert;



// Firebase Financial Document interface (matches Firestore structure)
export interface FirebaseFinancial {
  id: string;
  projectId: number;
  lineItem: string;
  category: string;
  amount: number;
  paidToDate: number;
  dateIncurred: string; // YYYY-MM-DD format
}

// Financial types
export type Financial = typeof financials.$inferSelect;
export type InsertFinancial = z.infer<typeof insertFinancialSchema>;

// Task interface for scheduling
export interface Task {
  id: number;
  projectId: number;
  title: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  isCompleted: boolean;
  progress: number;
  index: number;
}

// Audit logs types
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

// Designer Portal Tables
export const designSelections = pgTable("design_selections", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  roomType: varchar("room_type", { length: 50 }).notNull(),
  item: varchar("item", { length: 200 }).notNull(),
  brand: varchar("brand", { length: 100 }),
  color: varchar("color", { length: 100 }),
  model: varchar("model", { length: 100 }),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  designerNotes: text("designer_notes"),
  clientApproval: boolean("client_approval").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const designFiles = pgTable("design_files", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  originalName: varchar("original_name", { length: 255 }).notNull(),
  filePath: varchar("file_path", { length: 500 }).notNull(),
  fileType: varchar("file_type", { length: 50 }).notNull(),
  fileSize: integer("file_size"),
  description: text("description"),
  uploadedBy: integer("uploaded_by").references(() => users.id),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});

export const designSelectionsRelations = relations(designSelections, ({ one }) => ({
  project: one(projects, {
    fields: [designSelections.projectId],
    references: [projects.id],
  }),
}));

export const designFilesRelations = relations(designFiles, ({ one }) => ({
  project: one(projects, {
    fields: [designFiles.projectId],
    references: [projects.id],
  }),
  uploader: one(users, {
    fields: [designFiles.uploadedBy],
    references: [users.id],
  }),
}));

// Design schemas for forms and validation
export const insertDesignSelectionSchema = createInsertSchema(designSelections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDesignFileSchema = createInsertSchema(designFiles).omit({
  id: true,
  uploadedAt: true,
});

// Design types
export type DesignSelection = typeof designSelections.$inferSelect;
export type InsertDesignSelection = z.infer<typeof insertDesignSelectionSchema>;
export type DesignFile = typeof designFiles.$inferSelect;
export type InsertDesignFile = z.infer<typeof insertDesignFileSchema>;

// Weather location settings table
export const weatherLocations = pgTable("weather_locations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zipCode: text("zipcode").notNull(),
  isDefault: boolean("isdefault").default(false),
  latitude: text("latitude"),
  longitude: text("longitude"),
  createdAt: timestamp("createdat").defaultNow(),
  updatedAt: timestamp("updatedat").defaultNow(),
});

export const insertWeatherLocationSchema = createInsertSchema(weatherLocations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Weather location types
export type WeatherLocation = typeof weatherLocations.$inferSelect;
export type InsertWeatherLocation = z.infer<typeof insertWeatherLocationSchema>;

// Chat tables
export const threads = pgTable('threads', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  createdBy: integer('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  isArchived: boolean('is_archived').default(false).notNull(),
});

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  threadId: integer('thread_id').notNull(),
  senderId: integer('sender_id').notNull(),
  content: text('content').notNull(),
  messageType: varchar('message_type', { length: 50 }).default('text').notNull(),
  attachments: json('attachments'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  isEdited: boolean('is_edited').default(false).notNull(),
});

export const threadParticipants = pgTable('thread_participants', {
  id: serial('id').primaryKey(),
  threadId: integer('thread_id').notNull(),
  userId: integer('user_id').notNull(),
  role: varchar('role', { length: 50 }).default('participant').notNull(),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
  lastReadAt: timestamp('last_read_at'),
  isActive: boolean('is_active').default(true).notNull(),
});

// Chat relations
export const threadRelations = relations(threads, ({ one, many }) => ({
  project: one(projects, {
    fields: [threads.projectId],
    references: [projects.id],
  }),
  creator: one(users, {
    fields: [threads.createdBy],
    references: [users.id],
  }),
  messages: many(messages),
  participants: many(threadParticipants),
}));

export const messageRelations = relations(messages, ({ one }) => ({
  thread: one(threads, {
    fields: [messages.threadId],
    references: [threads.id],
  }),
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
  }),
}));

export const threadParticipantRelations = relations(threadParticipants, ({ one }) => ({
  thread: one(threads, {
    fields: [threadParticipants.threadId],
    references: [threads.id],
  }),
  user: one(users, {
    fields: [threadParticipants.userId],
    references: [users.id],
  }),
}));

// Chat schemas
export const insertThreadSchema = createInsertSchema(threads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertThreadParticipantSchema = createInsertSchema(threadParticipants).omit({
  id: true,
  joinedAt: true,
});

// Chat types
export type Thread = typeof threads.$inferSelect;
export type InsertThread = z.infer<typeof insertThreadSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type ThreadParticipant = typeof threadParticipants.$inferSelect;
export type InsertThreadParticipant = z.infer<typeof insertThreadParticipantSchema>;

// User authentication schemas
export const insertUserSchema = createInsertSchema(users);
// Note: insertUserSessionSchema removed - using stateless JWT authentication
export const insertAuditLogSchema = createInsertSchema(auditLog);
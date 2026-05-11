// Modern Firestore-direct bid request + bid submission schema.
// Lives at:
//   projects/{projectId}/bidRequests/{requestId}
//   bids/{bidId}            (top-level for sub-portal access; bidRequestId links back)

export interface BidRequestPlan {
  name: string;
  url: string;       // Firebase Storage download URL
  storagePath: string;
}

export interface BidRequest {
  id: string;
  projectId: string;
  projectName?: string;
  trade: string;             // e.g. "Framing", "Plumbing"
  scope: string;             // free-text scope of work
  callouts?: string;         // important notes / markup
  plans: BidRequestPlan[];   // PDFs the sub should review
  designBoardId?: string;    // optional link to design selections
  designSelectionsRoom?: string;
  dueDate: string;           // YYYY-MM-DD
  invitedSubIds: string[];   // contact IDs of subs invited
  invitedByUserId: string;
  invitedByName?: string;
  status: 'open' | 'closed' | 'awarded';
  awardedBidId?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface BidLineItem {
  id: string;
  description: string;
  qty: number;
  unit: string;            // 'lump sum', 'sq ft', 'hr', etc.
  unitCost: number;
  total: number;
  notes?: string;
}

export interface BidInsurance {
  carrier: string;
  policyNumber: string;
  expiration: string;        // YYYY-MM-DD
  certificateUrl?: string;   // Storage URL for COI upload (optional)
  certificateStoragePath?: string;
}

export interface ContractorLicense {
  number: string;
  state: string;
  type?: string;             // 'general', 'plumbing', etc.
  expiration?: string;
}

export interface PortalBid {
  id: string;
  bidRequestId?: string;       // links back to BidRequest if portal-submitted
  projectId: string;
  projectName?: string;
  trade?: string;
  // Sub identity
  subContactId?: string;
  subUserId?: string;
  subName: string;
  subCompany?: string;
  subEmail?: string;
  subPhone?: string;
  // Bid contents
  lineItems: BidLineItem[];
  subtotal: number;
  taxAmount?: number;
  totalAmount: number;
  notes?: string;
  attachments?: { name: string; url: string; storagePath: string }[];
  // Compliance
  insurance: BidInsurance;
  contractorLicense?: ContractorLicense;
  agreementAcknowledged: boolean;
  agreementAcknowledgedAt?: any;
  // Lifecycle
  status: 'received' | 'awarded' | 'declined' | 'expired';
  submittedViaPortal: true;
  submittedAt: any;
  awardedAt?: any;
  declinedAt?: any;
  declinedReason?: string;
}

// Estimate conversion config for the Award flow
export interface MarkupConfig {
  type: 'percent' | 'flat';
  value: number;
  label: string;             // e.g. "Project Coordination & Material Management"
  description?: string;
  // Apply to all lines or specific ones
  appliesTo: 'all' | 'specific';
  appliedToLineItemIds?: string[];
  // Display: separate line on client view, OR rolled into base
  displayMode: 'separateLine' | 'rolledIn';
}

// Saved markup template for re-use
export interface MarkupTemplate {
  id: string;
  name: string;
  config: MarkupConfig;
  createdBy: string;
  createdAt?: any;
}

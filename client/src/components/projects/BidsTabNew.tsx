import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEstimates } from '@/hooks/useEstimates';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { BidItemDetailView } from './BidItemDetailView';
import { BidItemDetailViewSimple } from './BidItemDetailViewSimple';

import { BidComparisonView } from './BidComparisonView';
import { BidSubmissionDetailsModal } from './BidSubmissionDetailsModal';
import { ManualBidForm } from '../bids/ManualBidForm';
import { AwardedJobView } from './AwardedJobView';
import BidInviteModal from './BidInviteModal';
import {
  ChevronDown,
  ChevronRight,
  Zap,
  Users,
  FileText,
  Trash2,
  Edit,
  Plus,
  DollarSign,
  Clock,
  Building2,
  Mail,
  Phone,
  CheckCircle,
  CheckCircle2,
  XCircle,
  AlertCircle,
  PlayCircle,
  Award,
  Eye,
  Send,
  Target,
  BarChart3,
  RefreshCw,
  Bell,
  Download,
  ExternalLink,
  CheckSquare,
  Truck,
  Wrench,
  MoreVertical,
  Calendar,
  AlertTriangle,
  X
} from 'lucide-react';

// Enhanced interfaces based on existing system
interface EstimateItem {
  id: number;
  trade: string;
  vendor: string;
  estimatedCost: number;
  duration: number;
  description: string;
  title?: string;
  status: 'Estimating' | 'Bidding' | 'Job Awarded' | 'Waiting Approval' | 'Approved' | 'Rejected';
  hasBeenBidOut?: boolean;
}

interface EstimateCategory {
  name: string;
  items: EstimateItem[];
}

interface EstimateData {
  id: number;
  name: string;
  description: string;
  categories: EstimateCategory[];
  totalCost: number;
  status: string;
  projectId: number;
}

interface BidProcess {
  id: number;
  estimateItemId: number;
  projectId: number;
  trade: string;
  description: string;
  estimatedCost: number;
  invitedSubcontractors: number[];
  status: 'active' | 'completed' | 'cancelled';
  createdAt: string;
  dueDate?: string;
}

interface BidResponse {
  id: number;
  bidProcessId: number;
  contactId: number;
  bidAmount: number;
  timeline: number;
  notes: string;
  status: 'submitted' | 'selected' | 'rejected';
  submittedAt: string;
  estimateItemId: number;
  contact?: {
    id: number;
    name: string;
    company: string;
    email: string;
    phone: string;
    trade: string;
  };
}

interface Contact {
  id: number;
  name: string;
  company: string;
  email: string;
  phone: string;
  role: string;
  trade: string;
}

interface BidsTabNewProps {
  projectId: string;
  userRole?: string;
}

// Status configuration for estimate workflow
// Original bid management status configuration (for bid processes)
const bidStatusConfig = {
  'Not Started': { label: 'Not Started', color: 'bg-slate-500', description: '' },
  'Actively Bidding': { label: 'Actively Bidding', color: 'bg-yellow-500', description: 'Subcontractors invited, bids pending' },
  'Bids Received': { label: 'Bids Received', color: 'bg-blue-500', description: 'Received responses, reviewing bids' },
  'Jobs Awarded': { label: 'Jobs Awarded', color: 'bg-green-500', description: 'Winning bid selected and awarded' }
};

// Separate estimate workflow status configuration (for estimate items)
const estimateStatusConfig = {
  'Estimating': { label: 'Estimating', color: 'bg-slate-500', description: 'Internal scoping and cost estimation' },
  'Bidding': { label: 'Bidding', color: 'bg-yellow-500', description: 'Out for bid with subcontractors' },
  'Job Awarded': { label: 'Job Awarded', color: 'bg-orange-500', description: 'Subcontractor selected for this trade' },
  'Waiting Approval': { label: 'Waiting Approval', color: 'bg-amber-500', description: 'Ready for client approval' },
  'Approved': { label: 'Approved', color: 'bg-green-500', description: 'Client approved the selected bid' },
  'Rejected': { label: 'Rejected', color: 'bg-red-500', description: 'Client rejected the bid' }
};

// Form schemas
const bidInvitationSchema = z.object({
  selectedSubs: z.array(z.union([z.number(), z.string()])).min(1, 'Select at least one subcontractor'),
  notes: z.string().optional(),
  dueDate: z.string().optional(),
  attachments: z.array(z.any()).optional()
});

const editItemSchema = z.object({
  trade: z.string().min(1, 'Trade is required'),
  vendor: z.string().optional(),
  estimatedCost: z.number().min(0, 'Cost must be positive'),
  duration: z.number().min(1, 'Duration must be at least 1 day'),
  description: z.string().min(1, 'Description is required')
});

// Edit Item Form Component
function EditItemForm({ item, onSave, onCancel }: { 
  item: EstimateItem; 
  onSave: (item: EstimateItem) => void; 
  onCancel: () => void; 
}) {
  const form = useForm<z.infer<typeof editItemSchema>>({
    resolver: zodResolver(editItemSchema),
    defaultValues: {
      trade: item.trade,
      vendor: item.vendor || '',
      estimatedCost: item.estimatedCost,
      duration: item.duration,
      description: item.description
    }
  });

  const onSubmit = (values: z.infer<typeof editItemSchema>) => {
    const updatedItem = {
      ...item,
      ...values
    };
    onSave(updatedItem);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="trade"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Trade</FormLabel>
              <FormControl>
                <Input {...field} placeholder="e.g. Electrical, Plumbing" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="vendor"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Vendor (Optional)</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Vendor or contractor name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="estimatedCost"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Estimated Cost</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    type="number" 
                    step="0.01"
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="duration"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Duration (Days)</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    type="number"
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea {...field} placeholder="Describe the work to be done" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit">Save Changes</Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

export default function BidsTabNew({ projectId, userRole = 'admin' }: BidsTabNewProps) {
  // Basic state management
  const [manualBidFormOpen, setManualBidFormOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [selectedEstimate, setSelectedEstimate] = useState<EstimateData | null>(null);
  const [bidDialogOpen, setBidDialogOpen] = useState(false);
  const [selectedItemForBid, setSelectedItemForBid] = useState<EstimateItem | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | number | null>(null);
  const [showAllItems, setShowAllItems] = useState(true);
  const [selectedBidItem, setSelectedBidItem] = useState<any>(null);
  const [bidDetailModalOpen, setBidDetailModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<EstimateItem | null>(null);
  const [bidComparisonItem, setBidComparisonItem] = useState<EstimateItem | null>(null);
  const [showBidComparison, setShowBidComparison] = useState(false);
  const [viewDetailsOpen, setViewDetailsOpen] = useState(false);
  const [selectedBidResponseId, setSelectedBidResponseId] = useState<number | null>(null);
  const [bidInviteModalOpen, setBidInviteModalOpen] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Use existing estimates hook
  const { estimates = [], isLoading: estimatesLoading = false, getProjectEstimates, forceRefresh } = useEstimates() || {};

  // Get project estimates safely
  const projectEstimates = getProjectEstimates ? getProjectEstimates(projectId) : [];

  // Fetch bid processes for this project
  const { data: bidProcesses = [], isLoading: bidProcessesLoading, refetch: refetchBidProcesses } = useQuery({
    queryKey: ['/api/bid-processes/project', projectId],
    queryFn: async () => {
      const response = await fetch(`/api/bid-processes/project?projectId=${projectId}`);
      return response.json();
    },
    select: data => Array.isArray(data) ? data : []
  });

  // Fetch bid responses for this project
  const { data: rawBidResponses, isLoading: bidResponsesLoading } = useQuery({
    queryKey: ['/api/bid-responses/project', projectId],
    queryFn: async () => {
      const response = await fetch(`/api/bid-responses/project/${projectId}`);
      return response.json();
    },
    select: data => Array.isArray(data) ? data : []
  });
  
  // Ensure bidResponses is always an array
  const bidResponses = Array.isArray(rawBidResponses) ? rawBidResponses : [];

  // Fetch bid invitations for this project
  const { data: bidInvitations = [], isLoading: bidInvitationsLoading } = useQuery({
    queryKey: ['/api/bid-invitations/project', projectId],
    queryFn: async () => {
      const response = await fetch(`/api/bid-invitations/project/${projectId}`);
      return response.json();
    },
    select: data => Array.isArray(data) ? data : []
  });

  // Fetch all contacts (for subcontractors)
  const { data: contacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: ['/api/contacts'],
    queryFn: async () => {
      const response = await fetch('/api/contacts');
      return response.json();
    },
    select: data => Array.isArray(data) ? data : []
  });

  // Filter subcontractors with safe array handling
  const contactsArray = Array.isArray(contacts) ? contacts : [];
  const subcontractors = contactsArray.filter((contact: Contact) => contact.role === 'subcontractor');

  // Calculate total cost for an estimate item (base cost + markup + contingency)
  const calculateItemTotal = (item: any) => {
    const baseCost = item.estimatedCost || item.cost || item.estimatedAmount || 0;
    const markup = item.markup || 0;
    const contingency = item.contingency || 0;
    
    // Calculate with markup and contingency percentages
    const withMarkup = baseCost * (1 + markup / 100);
    const total = withMarkup * (1 + contingency / 100);
    
    return total;
  };

  // Form for bid invitation
  const bidForm = useForm({
    resolver: zodResolver(bidInvitationSchema),
    defaultValues: {
      selectedSubs: [] as (number | string)[],
      notes: '',
      dueDate: '',
      attachments: []
    }
  });

  // Auto bid mutation (enhanced with duplicate prevention)
  const autoBidMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/auto-bid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: parseInt(projectId) })
      });
      return response.json();
    },
    onSuccess: async (data) => {
      // Processing operation
      
      // Clear all related caches first
      await queryClient.removeQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return key === '/api/estimates' || 
                 key === '/api/bid-processes/project' ||
                 key === '/api/bid-responses/project';
        }
      });
      
      // Immediate refresh for instant UI updates
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/estimates'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/bid-processes/project'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/bid-responses/project'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/bid-invitations/project'] }),
        queryClient.refetchQueries({ queryKey: ['/api/estimates'] })
      ]);
      
      // Follow-up refresh with slight delay to catch any backend delays
      setTimeout(async () => {
        await Promise.all([
          forceRefresh(),
          refetchBidProcesses(),
          queryClient.refetchQueries({ queryKey: ['/api/bid-processes/project'] }),
          queryClient.refetchQueries({ queryKey: ['/api/bid-invitations/project', projectId] })
        ]);
        // Success operation completed
      }, 200);
      
      toast({
        title: 'Auto Bid Complete',
        description: `Created ${data.created || 0} bid processes and sent ${data.invitations || 0} invitations. ${data.warnings || 0} items already in bidding.`
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Auto Bid Failed',
        description: error.message || 'Failed to process auto bid',
        variant: 'destructive'
      });
    }
  });

  // Manual bid invitation mutation
  const bidInvitationMutation = useMutation({
    mutationFn: async (data: { estimateItem: EstimateItem; selectedSubs: number[]; notes?: string; dueDate?: string }) => {
      const response = await fetch('/api/bid-invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: parseInt(projectId),
          estimateId: selectedEstimate?.id,
          estimateItemId: data.estimateItem.id,
          trade: data.estimateItem.trade,
          description: data.estimateItem.description,
          estimatedCost: data.estimateItem.estimatedCost,
          invitedSubs: data.selectedSubs,
          notes: data.notes || `Manual invitation for ${data.estimateItem.trade} work`,
          dueDate: data.dueDate,
          status: 'sent',
          createdAt: new Date().toISOString()
        })
      });
      return response.json();
    },
    onSuccess: async (data) => {
      // Processing operation
      
      // Clear all related caches first
      await queryClient.removeQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return key === '/api/estimates' || 
                 key === '/api/bid-processes/project' ||
                 key === '/api/bid-responses/project';
        }
      });
      
      // Immediate refresh for instant UI updates
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/estimates'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/bid-processes/project'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/bid-responses/project'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/bid-invitations/project'] }),
        queryClient.refetchQueries({ queryKey: ['/api/estimates'] })
      ]);
      
      // Follow-up refresh with slight delay to catch any backend delays  
      setTimeout(async () => {
        await Promise.all([
          forceRefresh(),
          refetchBidProcesses(),
          queryClient.refetchQueries({ queryKey: ['/api/bid-processes/project'] }),
          queryClient.refetchQueries({ queryKey: ['/api/bid-invitations/project', projectId] })
        ]);
        // Success operation completed
      }, 200);
      
      setBidDialogOpen(false);
      setSelectedItemForBid(null);
      bidForm.reset();
      toast({
        title: 'Bid Invitations Sent',
        description: data.message || 'Bid invitations sent successfully'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to Send Invitations',
        description: error.message || 'Failed to send bid invitations',
        variant: 'destructive'
      });
    }
  });

  // Delete bid process mutation (with status reset)
  const deleteBidMutation = useMutation({
    mutationFn: async (estimateItemId: string | number) => {
      const response = await fetch(`/api/estimate-items/${estimateItemId}/delete-bid`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete bid process');
      }
      return response.json();
    },
    onSuccess: async () => {
      // Comprehensive refresh to ensure UI updates
      await Promise.all([
        forceRefresh(),
        refetchBidProcesses(),
        queryClient.refetchQueries({ queryKey: ['/api/estimates'] }),
        queryClient.refetchQueries({ queryKey: ['/api/bid-processes/project'] }),
        queryClient.refetchQueries({ queryKey: ['/api/bid-responses/project', projectId] })
      ]);
      
      // Follow-up refresh with delay
      setTimeout(async () => {
        await Promise.all([
          forceRefresh(),
          refetchBidProcesses(),
          queryClient.refetchQueries({ queryKey: ['/api/estimates'] })
        ]);
        // Success operation completed
      }, 200);
      
      toast({
        title: 'Bid Process Deleted',
        description: 'Item status reset to Not Started'
      });
    },
    onError: (error: any) => {
      console.error('Delete bid error:', error);
      toast({
        title: 'Delete Failed',
        description: error.message || 'Failed to delete bid process',
        variant: 'destructive'
      });
    }
  });

  // Helper functions
  const getAllEstimateItems = (): EstimateItem[] => {
    const allItems: EstimateItem[] = [];
    let itemCounter = 1;
    
    projectEstimates.forEach((estimate: any) => {
      estimate.categories.forEach((category: EstimateCategory) => {
        category.items.forEach((item: any) => {
          // Ensure each item has required fields
          const processedItem: EstimateItem = {
            id: item.id || itemCounter++,
            trade: item.trade || 'Unknown Trade',
            vendor: item.vendor || '',
            estimatedCost: Number(item.estimatedCost) || 0,
            duration: Number(item.duration) || 1,
            description: item.description || '',
            title: item.title || item.trade || `Item ${item.id || itemCounter}`,
            status: item.status as any || 'Estimating',
            hasBeenBidOut: item.hasBeenBidOut || false
          };
          allItems.push(processedItem);
        });
      });
    });
    return allItems;
  };

  const getEstimateItemsBidProcess = (itemId: string | number) => {
    const process = bidProcesses.find((bp: BidProcess) => 
      bp.estimateItemId === itemId ||
      bp.estimateItemId === String(itemId) ||
      String(bp.estimateItemId) === String(itemId)
    );
    // Search/lookup operation
    return process;
  };

  const getBidResponsesForItem = (itemId: string | number) => {
    const allItems = getAllEstimateItems();
    const currentItem = allItems.find(item => item.id === itemId);
    
    // Search/lookup operation
    const allResponsesArray = Array.isArray(bidResponses) ? bidResponses : [];
    // Search/lookup operation));
    
    const matchedResponses = allResponsesArray.filter((br: any) => {
      // Direct ID matches (both string and numeric)
      if (br.estimateItemId === itemId || 
          br.itemId === itemId ||
          br.estimateItemId === String(itemId) ||
          br.itemId === String(itemId) ||
          String(br.estimateItemId) === String(itemId) ||
          String(br.itemId) === String(itemId)) {
        // Success operation completed
        return true;
      }
      
      // Handle legacy manual bids: match by trade name when numeric ID doesn't match string ID
      if (currentItem && br.trade && 
          br.trade === currentItem.trade && 
          typeof br.estimateItemId === 'number' && 
          typeof itemId === 'string') {
        // Development logging removed
        return true;
      }
      
      return false;
    });
    
    // Search/lookup operation
    return matchedResponses;
  };

  const getBidInvitationsForItem = (itemId: string | number) => {
    const invitationsArray = Array.isArray(bidInvitations) ? bidInvitations : [];
    return invitationsArray.filter((bi: any) => 
      bi.estimateItemId === itemId || 
      bi.estimateItemId === String(itemId) ||
      String(bi.estimateItemId) === String(itemId)
    );
  };

  // Get estimate status - now directly from the item's status field
  // Function for determining bid management status (separate from estimate status)
  const getBidManagementStatus = (item: EstimateItem) => {
    const bidProcess = getEstimateItemsBidProcess(item.id);
    const itemBidResponses = getBidResponsesForItem(item.id);
    const bidInvitationsForItem = getBidInvitationsForItem(item.id);
    
    // Check if job is awarded (any bid response is marked as awarded/selected)
    const hasAwardedBid = itemBidResponses.some((response: any) => 
      response.status === 'awarded' || response.status === 'selected'
    );
    if (hasAwardedBid || bidProcess?.status === 'awarded' || bidProcess?.winnerSubcontractorId) {
      return 'Jobs Awarded';
    }
    
    // Check if we have any bid responses (manual bids or submitted responses)
    // This includes both manual bids and responses to invitations
    if (itemBidResponses.length > 0) {
      return 'Bids Received';
    }
    
    // Check if bid invitations have been sent OR there's an active bid process
    // This handles cases where invitations are sent but no responses yet
    if (bidInvitationsForItem.length > 0 || bidProcess || item.hasBeenBidOut) {
      return 'Actively Bidding';
    }
    
    // Default status - no activity yet
    return 'Not Started';
  };

  // Function for getting estimate workflow status (completely separate from bid status)
  const getEstimateStatus = (item: EstimateItem) => {
    return item.status || 'Estimating';
  };

  // Legacy function - no longer used since we have getBidManagementStatus
  // Kept for compatibility but getBidManagementStatus is the new standard

  const handleAutoBid = () => {
    autoBidMutation.mutate();
  };

  // Handle opening bid comparison view for items with responses
  const handleOpenBidComparison = (item: EstimateItem) => {
    // Search/lookup operation
    // Search/lookup operation
    setBidComparisonItem(item);
    setShowBidComparison(true);
    // Search/lookup operation
  };

  // Handle closing bid comparison view
  const handleCloseBidComparison = () => {
    setShowBidComparison(false);
    setBidComparisonItem(null);
  };

  // Handle award job from bid comparison
  const handleAwardJobFromComparison = async (bidResponseId: number, contactId: number) => {
    try {
      // Development logging removed
      
      // Award the job using existing logic
      const response = await apiRequest(`/api/bid-responses/${bidResponseId}/select`, 'POST', {});
      // Development logging removed
      
      // Close the bid comparison modal first
      setShowBidComparison(false);
      setBidComparisonItem(null);
      
      // Wait a moment for backend to complete processing
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Clear all cached data first
      await queryClient.removeQueries({ 
        predicate: () => true // Remove everything
      });
      
      // Force fresh data fetch
      await Promise.all([
        forceRefresh(),
        refetchBidProcesses(),
        queryClient.refetchQueries({ queryKey: ['/api/estimates'] }),
        queryClient.refetchQueries({ queryKey: ['/api/bid-responses/project', projectId] }),
        queryClient.refetchQueries({ queryKey: ['/api/bid-processes/project', projectId] }),
        queryClient.refetchQueries({ queryKey: ['/api/bid-invitations/project', projectId] })
      ]);
      
      // Find contact info for notification
      const contact = contacts.find(c => c.id === contactId);
      
      toast({
        title: 'Job Awarded Successfully',
        description: `Job awarded to ${contact?.company || contact?.name || 'subcontractor'}. Estimate updated with bid details.`
      });
      
      return response;
    } catch (error) {
      console.error('🚨 Award job error:', error);
      toast({
        title: 'Award Failed',
        description: 'Failed to award job. Please try again.',
        variant: 'destructive'
      });
      throw error;
    }
  };

  const handleManualBidInvitation = (item: EstimateItem) => {
    // First select an estimate that contains this item
    const estimate = projectEstimates.find((est: any) => 
      est.categories?.some((cat: any) => 
        cat.items?.some((i: any) => i.id === item.id)
      )
    );
    setSelectedEstimate(estimate || null);
    setSelectedItemForBid(item);
    
    // Automatically pre-select subcontractors that match this trade
    const matchingSubcontractors = getSubcontractorsByTrade(item.trade);
    const defaultDueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 3 days from now
    
    bidForm.reset({
      selectedSubs: matchingSubcontractors.map((sub: any) => sub.id), // Auto-select matching subs
      notes: `Bid invitation for ${item.trade} work: ${item.description}`,
      dueDate: defaultDueDate, // Default to 3 business days
      attachments: []
    });
    
    setBidDialogOpen(true);
  };

  const handleBidSubmit = (data: any) => {
    if (!selectedItemForBid) return;
    
    bidInvitationMutation.mutate({
      estimateItem: selectedItemForBid,
      selectedSubs: data.selectedSubs,
      notes: data.notes,
      dueDate: data.dueDate,
      // attachments: data.attachments // Removed - not part of the interface
    });
  };

  const handleDeleteBid = (itemId: string | number) => {
    setDeleteConfirmId(itemId);
  };

  const confirmDelete = () => {
    if (deleteConfirmId) {
      deleteBidMutation.mutate(deleteConfirmId);
      setDeleteConfirmId(null);
    }
  };

  const handleSendReminder = (itemId: string | number) => {
    const item = getAllEstimateItems().find(i => i.id === itemId);
    if (!item) return;

    toast({
      title: "Reminder Sent",
      description: `Reminder sent to all bidders for "${item.trade}" trade.`,
    });
  };

  // Award bid mutation
  const awardBidMutation = useMutation({
    mutationFn: async ({ itemId, winningBidResponse }: { itemId: number, winningBidResponse: any }) => {
      // Development logging removed
      
      // Use the working bid response selection endpoint
      const response = await apiRequest(`/api/bid-responses/${winningBidResponse.id}/select`, 'POST', {});
      
      // Success operation completed
      return response;
    },
    onSuccess: async (data) => {
      // Development logging removed
      
      // Close the modal first
      setBidDetailModalOpen(false);
      
      // Clear ALL cached data first
      await queryClient.removeQueries({ 
        predicate: () => true // Remove everything
      });
      
      // Development logging removed
      
      // Wait a moment for backend to complete all writes
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Force fresh data fetch
      await Promise.all([
        forceRefresh(),
        refetchBidProcesses(),
        queryClient.refetchQueries({ queryKey: ['/api/estimates'] }),
        queryClient.refetchQueries({ queryKey: ['/api/bid-responses/project', projectId] }),
        queryClient.refetchQueries({ queryKey: ['/api/bid-processes/project', projectId] }),
        queryClient.refetchQueries({ queryKey: ['/api/bid-invitations/project', projectId] })
      ]);
      
      // Processing operation
      
      toast({
        title: 'Bid Awarded and Estimate Updated',
        description: `Job awarded successfully. Estimate item automatically updated with bid amount, duration, and attachments. Other bids declined.`
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Award Failed',
        description: error.message || 'Failed to award bid',
        variant: 'destructive'
      });
    }
  });

  const handleAwardBid = (subcontractorId: number, bidData: any) => {
    // Development logging removed
    // Development logging removed
    // Development logging removed);
    // Development logging removed);
    
    // Try multiple ways to get the estimate item ID
    const possibleIds = [
      bidData.itemId,
      bidData.estimateItemId, 
      selectedBidItem?.estimateItemId,
      selectedBidItem?.id
    ];
    
    // Development logging removed
    
    // Use the first valid ID (prioritize estimateItemId)
    const itemId = possibleIds.find(id => id != null && id !== undefined);
    
    // Development logging removed
    
    if (!itemId) {
      console.error('🚨 === NO ITEM ID FOUND ===');
      console.error('🚨 All possible IDs were null/undefined:', possibleIds);
      toast({
        title: 'Error',
        description: `Unable to identify the estimate item. Debug: ${JSON.stringify(possibleIds)}`,
        variant: 'destructive'
      });
      return;
    }

    // Find the matching bid response using the correct itemId
    // Development logging removed
    
    const winningBidResponse = bidResponses?.find((br: any) => 
      br.subcontractorId === subcontractorId && br.estimateItemId === itemId
    );
    
    // Development logging removed
    
    if (!winningBidResponse) {
      // Development logging removed
      const syntheticResponse = {
        id: `synthetic-${Date.now()}`,
        subcontractorId: subcontractorId,
        proposedCost: bidData.bidAmount || 0,
        proposedDuration: bidData.durationDays || 0,
        duration: bidData.durationDays || 0,
        status: 'submitted',
        estimateItemId: itemId
      };
      // Development logging removed
      
      awardBidMutation.mutate({
        itemId,
        winningBidResponse: syntheticResponse
      });
    } else {
      // Development logging removed
      awardBidMutation.mutate({
        itemId,
        winningBidResponse
      });
    }
    // Development logging removed
  };

  const handleEditItem = (item: EstimateItem) => {
    toast({
      title: "Edit Item",
      description: `Edit dialog would open for "${item.trade}" - ${item.description}`,
    });
  };

  const toggleExpanded = (itemId: number) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };

  const getSubcontractorsByTrade = (trade: string) => {
    // Development logging removed
    // Search/lookup operation
    // Search/lookup operation));
    
    const filtered = subcontractors.filter((sub: Contact) => 
      sub.trade?.toLowerCase().includes(trade.toLowerCase()) ||
      trade.toLowerCase().includes(sub.trade?.toLowerCase())
    );
    
    // Development logging removed));
    return filtered;
  };

  if (estimatesLoading || bidProcessesLoading || contactsLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-theme-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p>Loading bid data...</p>
        </div>
      </div>
    );
  }

  const allEstimateItems = getAllEstimateItems();
  const eligibleItems = showAllItems ? allEstimateItems : allEstimateItems.filter(item => getBidManagementStatus(item) === 'Not Started');

  return (
    <div className="space-y-6">
      {/* Header with controls */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold">Bid Process</h2>
          <p className="text-gray-600 mt-1">
            Manage subcontractor bidding for this project
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => window.location.reload()}
            variant="outline"
            size="sm"
            className="whitespace-nowrap"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            onClick={() => {
              // Component lifecycle tracked
              // Component lifecycle tracked
              // Component lifecycle tracked
              setManualBidFormOpen(true);
            }}
            variant="outline"
            size="sm"
            className="whitespace-nowrap"
          >
            <Plus className="h-4 w-4 mr-2" />
            Manual Bid
          </Button>
          <Button 
            onClick={() => setBidInviteModalOpen(true)}
            className="bg-theme-primary hover:bg-theme-primary-hover whitespace-nowrap"
          >
            <Zap className="h-4 w-4 mr-2" />
            Auto-Generate Bids
          </Button>
        </div>
      </div>

      {/* Summary statistics - Bid Management Status (separate from estimate workflow) */}
      {allEstimateItems.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Object.entries(bidStatusConfig).map(([status, config]) => {
            const count = allEstimateItems.filter(item => getBidManagementStatus(item) === status).length;
            return (
              <Card key={status} className="text-center">
                <CardContent className="p-4">
                  <div className={`inline-flex px-2 py-1 rounded text-white text-sm mb-2 ${config.color}`}>
                    {config.label}
                  </div>
                  <div className="text-2xl font-bold">{count}</div>
                </CardContent>
              </Card>
            );
          })}
          <Card className="text-center">
            <CardContent className="p-4">
              <div className="inline-flex px-2 py-1 rounded text-white text-sm mb-2 bg-purple-500">
                Total Items
              </div>
              <div className="text-2xl font-bold">{allEstimateItems.length}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Estimate items list */}
      <div className="space-y-4">
        {eligibleItems.length > 0 ? eligibleItems.map((item: EstimateItem) => {
          const bidProcess = getEstimateItemsBidProcess(item.id);
          const itemBidResponses = getBidResponsesForItem(item.id);
          const isExpanded = expandedItems.has(item.id);
          




          return (
            <Card key={item.id} className="overflow-hidden">
              <div 
                className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  
                  // Search/lookup operation
                  
                  try {
                    // Search/lookup operation
                    // Search/lookup operation
                    // Search/lookup operation
                    
                    // Validate item data first
                    if (!item || !item.id) {
                      console.error('❌ Invalid item data:', item);
                      toast({
                        title: "Invalid Item",
                        description: "Item data is incomplete. Please refresh and try again.",
                        variant: "destructive"
                      });
                      return;
                    }
                    
                    // Check if this item has any bid responses (regardless of status)
                    const itemBidResponses = getBidResponsesForItem(item.id);
                    const hasAnyBids = itemBidResponses.length > 0;
                    
                    // Search/lookup operation
                    // Search/lookup operation
                    // Search/lookup operation
                    // Search/lookup operation
                    
                    // Force comprehensive view for all items with "Concrete: Flatwork" or any bid responses
                    if (item.trade === 'Concrete: Flatwork' || itemBidResponses.length > 0) {
                      // Search/lookup operation
                      // Search/lookup operation
                      handleOpenBidComparison(item);
                      return;
                    }
                    
                    // If there are any bid responses, open the comprehensive comparison view
                    if (hasAnyBids) {
                      // Search/lookup operation
                      handleOpenBidComparison(item);
                      return;
                    }
                    
                    // Create safe item data to prevent React errors
                    const safeItem = {
                      id: item?.id || null,
                      trade: String(item?.trade || ''),
                      description: String(item?.description || ''),
                      estimatedCost: Number(item?.estimatedCost || 0),
                      status: String(item?.status || ''),
                      title: String(item?.title || item?.trade || ''),
                      projectId: String(projectId || '')
                    };
                    
                    // Search/lookup operation
                    setSelectedBidItem(safeItem);
                    
                    // For items without bid processes, open bid invitation modal
                    const bidStatus = getBidManagementStatus(item);
                    // Search/lookup operation
                    
                    if (bidStatus === 'Not Started') {
                      // Search/lookup operation
                      handleManualBidInvitation(item);
                    } else {
                      // Search/lookup operation
                      setBidDetailModalOpen(true);
                    }
                  } catch (error: any) {
                    console.error('❌ Error in bid item click handler:', error);
                    console.error('❌ Error details:', error?.message || 'Unknown error');
                    console.error('❌ Error stack:', error?.stack);
                    toast({
                      title: "Navigation Error",
                      description: `Click handler failed: ${error?.message || 'Unknown error'}. Please try refreshing the page.`,
                      variant: "destructive"
                    });
                  }
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-medium text-lg">{item.title || item.trade || `Item ${item.id}`}</h3>
                        <Badge variant="outline" className="text-xs">
                          {item.trade}
                        </Badge>
                        {(() => {
                          const bidStatus = getBidManagementStatus(item);
                          const bidConfig = bidStatusConfig[bidStatus as keyof typeof bidStatusConfig];
                          return (
                            <div className="flex gap-2">
                              <Badge className={`${bidConfig.color} text-white`} title={`Bid: ${bidConfig.description}`}>
                                Bid: {bidConfig.label}
                              </Badge>
                            </div>
                          );
                        })()}
                      </div>
                      
                      <p className="text-sm text-gray-600 mb-2">{item.description}</p>
                      
                      {(() => {
                        // Show calculated total amount for all items (awarded functionality moved to expanded view)
                        const itemTotal = calculateItemTotal(item);
                        if (itemTotal > 0) {
                          return (
                            <div className="text-sm text-gray-500">
                              <span>Est: ${itemTotal.toLocaleString()}</span>
                            </div>
                          );
                        }
                        
                        return null;
                      })()}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {/* Edit button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        // Component lifecycle tracked
                        // Component lifecycle tracked
                        // Component lifecycle tracked);
                        if (!item?.id) {
                          console.error('❌ Item missing ID:', item);
                          toast({
                            title: "Error",
                            description: "Cannot edit item: missing ID. Please refresh and try again.",
                            variant: "destructive"
                          });
                          return;
                        }
                        setEditingItem(item);
                      }}
                      className="h-8 w-8 p-0"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Expanded View - Shows Awarded Job View or Bid Management */}
              {isExpanded && (
                <div className="border-t bg-gray-50">
                  {(() => {
                    // Check if job is awarded (check both bid process and bid responses)
                    const awardedResponse = itemBidResponses.find((br: any) => 
                      br.status === 'awarded' || br.status === 'selected'
                    );
                    const isJobAwarded = awardedResponse || (bidProcess?.status === 'awarded' && bidProcess.winnerSubcontractorId);
                    
                    if (isJobAwarded) {
                      const winningResponse = awardedResponse || itemBidResponses.find((br: any) => br.subcontractorId === bidProcess?.winnerSubcontractorId);
                      const winnerContactId = awardedResponse?.subcontractorId || bidProcess?.winnerSubcontractorId;
                      const winnerContact = contacts.find((c: any) => c.id === winnerContactId);
                      
                      if (winnerContact && winningResponse) {
                        // Transform data for AwardedJobView
                        const jobData = {
                          id: item.id.toString(),
                          trade: item.trade || 'Unknown Trade',
                          description: item.description || 'No description',
                          estimatedCost: item.estimatedCost || 0,
                          status: 'awarded',
                          projectId: projectId.toString(),
                          awardedSubcontractor: {
                            id: winnerContact.id.toString(),
                            name: winnerContact.name || 'Unknown',
                            company: winnerContact.company || winnerContact.name || 'Unknown',
                            email: winnerContact.email,
                            phone: winnerContact.phone
                          },
                          contractTotal: winningResponse?.proposedCost || winningResponse?.bidAmount || item.estimatedCost || 0,
                          agreementSigned: false,
                          startDate: (item as any).startDate || '2025-02-15',
                          duration: winningResponse?.duration || winningResponse?.proposedDuration || item.duration || 10,
                          scheduleStatus: 'not_started' as const,
                          // Pass bid documents
                          bidDocuments: winningResponse.attachments || []
                        };
                        
                        return (
                          <AwardedJobView 
                            jobItem={jobData}
                            onClose={() => toggleExpanded(item.id)}
                          />
                        );
                      }
                    }
                    
                    // Default bid management view for non-awarded items
                    return (
                      <div className="p-4">
                        <div className="space-y-4">
                          
                          {/* Basic Item Information */}
                          <div className="bg-white rounded-lg p-4">
                            <div className="flex justify-between items-start mb-3">
                              <div>
                                <h3 className="font-semibold">{item.title || item.trade || 'Unknown Trade'}</h3>
                                <p className="text-sm text-gray-600">{item.description || 'No description'}</p>
                              </div>
                              <div className="text-right">
                                <div className="font-bold">
                                  {item.estimatedCost > 0 ? `$${item.estimatedCost.toLocaleString()}` : 'Pending'}
                                </div>
                                <Badge variant="outline" className="mt-1">
                                  {getBidManagementStatus(item)}
                                </Badge>
                              </div>
                            </div>
                            
                            {/* Simple deadline display */}
                            {bidProcess?.dueDate && (
                              <div className="text-sm text-gray-500 border-t pt-3">
                                <span>Deadline: {new Date(bidProcess.dueDate).toLocaleDateString()}</span>
                              </div>
                            )}
                          </div>
                          
                          {/* Simple Bidders Section for non-awarded items */}
                          <div className="bg-white rounded-lg p-4">
                            <h4 className="font-semibold mb-3">
                              Invited Bidders ({(getBidInvitationsForItem(item.id) || []).length})
                            </h4>
                            {(getBidInvitationsForItem(item.id) || []).length === 0 ? (
                              <div className="text-center py-4 text-gray-500">
                                <p className="text-sm">No invitations sent yet</p>
                                <Button 
                                  size="sm" 
                                  onClick={() => handleManualBidInvitation(item)}
                                  className="bg-theme-primary hover:bg-theme-primary-hover mt-2"
                                >
                                  <Plus className="h-4 w-4 mr-1" />
                                  Invite Bidders
                                </Button>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {(getBidInvitationsForItem(item.id) || []).map((invitation: any) => {
                                  if (!invitation || !invitation.id) {
                                    console.warn('Invalid invitation found:', invitation);
                                    return null;
                                  }
                                  
                                  try {
                                    const subcontractorId = invitation.subcontractorId || invitation.contactId;
                                    const subcontractor = contacts?.find((contact: any) => contact?.id === subcontractorId);
                                    const response = itemBidResponses?.find((r: any) => 
                                      r && (r.subcontractorId === subcontractorId)
                                    );
                                    
                                    return (
                                      <div key={invitation.id} className="flex justify-between items-center p-2 border rounded">
                                        <div>
                                          <div className="font-medium text-sm">
                                            {subcontractor?.name || `Contact ${subcontractorId || 'Unknown'}`}
                                          </div>
                                          <div className="text-xs text-gray-500">
                                            {subcontractor?.company || 'Unknown Company'}
                                          </div>
                                        </div>
                                        
                                        <div className="text-right">
                                          {response ? (
                                            <div>
                                              <Badge variant="outline" className="text-xs">Bid Received</Badge>
                                              <div className="text-sm font-medium">
                                                ${(response.bidAmount || response.proposedCost || 0).toLocaleString()}
                                              </div>
                                            </div>
                                          ) : (
                                            <Badge variant="outline" className="text-xs">Waiting</Badge>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  } catch (error) {
                                    console.error('Error rendering invitation:', error, invitation);
                                    return null;
                                  }
                                }).filter(Boolean)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </Card>
          );
        }) : (
          <Card>
            <CardContent className="text-center py-12">
              <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium mb-2">
                {showAllItems ? 'No Estimate Items' : 'No Items Available for Bidding'}
              </h3>
              <p className="text-gray-600">
                {showAllItems 
                  ? 'Create some estimates first, then add them to the bidding process.'
                  : 'All estimate items are already in the bidding process or completed.'
                }
              </p>
              {!showAllItems && (
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => setShowAllItems(true)}
                >
                  Show All Items
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Manual bid invitation dialog */}
      <Dialog open={bidDialogOpen} onOpenChange={setBidDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Invite Subcontractors to Bid</DialogTitle>
            <DialogDescription>
              {selectedItemForBid && `Select subcontractors to invite for: ${selectedItemForBid.trade} - ${selectedItemForBid.description}`}
            </DialogDescription>
          </DialogHeader>
          
          <Form {...bidForm}>
            <form onSubmit={bidForm.handleSubmit(handleBidSubmit)} className="space-y-4">
              {selectedItemForBid && (
                <div className="bg-gray-50 p-3 rounded">
                  <div className="font-medium">{selectedItemForBid.trade}</div>
                  <div className="text-sm text-gray-600">{selectedItemForBid.description}</div>
                  <div className="text-sm text-green-600 font-medium">
                    ${selectedItemForBid.estimatedCost.toLocaleString()}
                  </div>
                </div>
              )}

              <FormField
                control={bidForm.control}
                name="selectedSubs"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Select Subcontractors</FormLabel>
                    <FormControl>
                      <div className="space-y-2 max-h-64 overflow-y-auto border rounded p-3">
                        {getSubcontractorsByTrade(selectedItemForBid?.trade || '').map((sub: any) => (
                          <label key={sub.id} className="flex items-center space-x-2 cursor-pointer">
                            <Checkbox 
                              checked={field.value.includes(sub.id as number)}
                              onCheckedChange={(checked) => {
                                const currentValue = field.value as number[];
                                if (checked) {
                                  field.onChange([...currentValue, sub.id as number]);
                                } else {
                                  field.onChange(currentValue.filter((id: number) => id !== (sub.id as number)));
                                }
                              }}
                            />
                            <div className="flex-1">
                              <div className="font-medium">{sub.company}</div>
                              <div className="text-sm text-gray-600">{sub.name} - {sub.trade}</div>
                              <div className="text-xs text-gray-500">{sub.email}</div>
                            </div>
                          </label>
                        ))}
                        {getSubcontractorsByTrade(selectedItemForBid?.trade || '').length === 0 && (
                          <p className="text-gray-500 text-center py-4">
                            No subcontractors found for "{selectedItemForBid?.trade}" trade
                          </p>
                        )}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={bidForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Additional Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        placeholder="Add any specific instructions or requirements for this bid..." 
                        rows={3}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={bidForm.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Due Date (Optional)</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        type="date"
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* File Attachments */}
              <FormField
                control={bidForm.control}
                name="attachments"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Attach Files (Optional)</FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        <Input 
                          type="file" 
                          multiple 
                          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx"
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            field.onChange([...field.value, ...files]);
                          }}
                          className="cursor-pointer"
                        />
                        {field.value.length > 0 && (
                          <div className="border rounded p-2 bg-gray-50">
                            <div className="text-sm font-medium mb-2">Selected Files:</div>
                            {field.value.map((file: File, index: number) => (
                              <div key={index} className="flex items-center justify-between text-sm py-1">
                                <span className="flex items-center gap-1">
                                  <FileText className="h-3 w-3" />
                                  {file.name}
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    const newFiles = [...field.value];
                                    newFiles.splice(index, 1);
                                    field.onChange(newFiles);
                                  }}
                                  className="h-6 w-6 p-0 text-red-500"
                                >
                                  ×
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="text-xs text-gray-500">
                          Supported formats: PDF, Word, Excel, Images (PNG, JPG)
                        </div>
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setBidDialogOpen(false)}
                  disabled={bidInvitationMutation.isPending}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={bidInvitationMutation.isPending}
                >
                  {bidInvitationMutation.isPending ? 'Sending...' : 'Send Invitations'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bid Process</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this bid process? This will:
              <br />• Remove all bid invitations
              <br />• Reset the item status to "Not Started" 
              <br />• Allow the item to be re-added to bidding fresh
              <br /><br />
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteBidMutation.isPending}
            >
              {deleteBidMutation.isPending ? 'Deleting...' : 'Delete Bid Process'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Simplified Modal for Bid Details */}
      <Dialog open={bidDetailModalOpen} onOpenChange={setBidDetailModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bid Item Details</DialogTitle>
          </DialogHeader>
          <div className="p-4">
            {selectedBidItem && (
              <div className="space-y-2">
                <div><strong>Trade:</strong> {selectedBidItem.trade}</div>
                <div><strong>Description:</strong> {selectedBidItem.description}</div>
                <div><strong>Total Cost:</strong> {selectedBidItem.estimatedCost > 0 ? `$${selectedBidItem.estimatedCost.toLocaleString()}` : 'Pending'}</div>
                <div><strong>Status:</strong> {selectedBidItem.status}</div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Item Modal */}
      <Dialog open={!!editingItem} onOpenChange={() => setEditingItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Estimate Item</DialogTitle>
            <DialogDescription>
              Update the details for this estimate item.
            </DialogDescription>
          </DialogHeader>
          
          {editingItem && (
            <EditItemForm 
              item={editingItem}
              onSave={async (updatedItem) => {
                try {
                  // Update the estimate item via API
                  await apiRequest(`/api/estimates/items/${updatedItem.id}`, 'PUT', updatedItem);
                  
                  // Refresh estimates data
                  forceRefresh();
                  setEditingItem(null);
                  
                  toast({
                    title: "Item Updated",
                    description: "Estimate item has been updated successfully."
                  });
                } catch (error) {
                  console.error('Error updating item:', error);
                  toast({
                    title: "Update Failed",
                    description: "Failed to update estimate item. Please try again.",
                    variant: "destructive"
                  });
                }
              }}
              onCancel={() => setEditingItem(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Bid Comparison View */}
      {bidComparisonItem && (
        <BidComparisonView
          isOpen={showBidComparison}
          onClose={handleCloseBidComparison}
          bidItem={bidComparisonItem}
          bidResponses={getBidResponsesForItem(bidComparisonItem.id)}
          contacts={contacts}
          bidProcess={getEstimateItemsBidProcess(bidComparisonItem.id)}
          bidInvitations={getBidInvitationsForItem(bidComparisonItem.id)}
          onAwardJob={handleAwardJobFromComparison}
          onEditItem={(item) => {
            setEditingItem(item);
            setShowBidComparison(false);
          }}
          onDeleteItem={(itemId) => {
            setDeleteConfirmId(itemId);
            setShowBidComparison(false);
          }}
        />
      )}

      {/* View Details Modal */}
      <BidSubmissionDetailsModal
        isOpen={viewDetailsOpen}
        onClose={() => setViewDetailsOpen(false)}
        bidResponseId={selectedBidResponseId}
      />

      {/* Manual Bid Form Modal */}
      <ManualBidForm
        isOpen={manualBidFormOpen}
        onClose={() => {
          // Component lifecycle tracked
          setManualBidFormOpen(false);
        }}
        projectId={parseInt(projectId)}
        estimateItems={getAllEstimateItems()}
      />
      
      {/* Bid Invite Modal */}
      <BidInviteModal
        isOpen={bidInviteModalOpen}
        onOpenChange={setBidInviteModalOpen}
        projectId={parseInt(projectId)}
        estimateId={selectedEstimate?.id}
      />

      {/* Debug info for manual bid modal */}
      {manualBidFormOpen && (
        <div style={{ 
          position: 'fixed', 
          top: '10px', 
          right: '10px', 
          background: 'red', 
          color: 'white', 
          padding: '5px', 
          zIndex: 9999,
          fontSize: '12px'
        }}>
          Manual Bid Form OPEN
        </div>
      )}
    </div>
  );
}

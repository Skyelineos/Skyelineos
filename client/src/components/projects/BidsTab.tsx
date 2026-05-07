import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEstimates } from '@/hooks/useEstimates';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible } from '@radix-ui/react-collapsible';
import { CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest } from '@/lib/queryClient';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { BidFromEstimateModal } from './BidFromEstimateModal';
import { StartBidModal } from '../bidding/StartBidModal';
import {
  Users,
  Plus,
  Edit3,
  ChevronDown,
  ChevronRight,
  Building2,
  Check,
  X,
  FileText,
  DollarSign,
  Clock,
  User,
  Upload,
  Download,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Eye,
  Paperclip,
  Mail,
  Phone,
  ArrowUpDown,
  Target,
  AlertCircle,
  CheckCircle,
  Trash2,
  Zap,
  Bell,
  Send,
  Award,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';


interface BidsTabProps {
  projectId: string;
  userRole?: string;
}

interface EstimateItem {
  id: string;
  trade: string;
  vendor: string;
  estimatedCost: number;
  duration: number;
  description: string;
  status: 'Not Started' | 'Actively Bidding' | 'Bids Received' | 'Jobs Awarded' | 'Approved' | 'Rejected';
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
}

interface BidItem {
  id?: string;
  estimateItemId: string;
  subcontractorId?: number;
  subcontractorName: string;
  contactEmail: string;
  contactPhone: string;
  bidAmount: number;
  timeline: number;
  notes: string;
  status: 'pending' | 'accepted' | 'rejected';
  trade: string;
  category: string;
  submittedDate: string;
  attachments?: BidAttachment[];
}

interface BidAttachment {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  uploadedAt: string;
}

const bidItemSchema = z.object({
  subcontractorId: z.number().optional(),
  subcontractorName: z.string().min(1, 'Subcontractor name is required'),
  contactEmail: z.string().email('Valid email required').optional().or(z.literal('')),
  contactPhone: z.string().optional(),
  bidAmount: z.coerce.number().min(0, 'Bid amount must be positive'),
  timeline: z.coerce.number().min(0, 'Timeline must be positive'),
  notes: z.string().optional(),
});

const addSubcontractorSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  company: z.string().min(1, 'Company is required'),
  email: z.string().email('Valid email required').optional().or(z.literal('')),
  phone: z.string().optional(),
  trade: z.string().optional(),
  licenseNumber: z.string().optional(),
  insuranceExpiration: z.string().optional(),
});

export function BidsTab({ projectId, userRole = 'admin' }: BidsTabProps) {
  // State for confirmed bidding processes with localStorage persistence
  const [confirmedBiddingProcesses, setConfirmedBiddingProcesses] = useState<EstimateData[]>([]);
  const [selectedEstimateItem, setSelectedEstimateItem] = useState<any>(null);
  const [bidFromEstimateModalOpen, setBidFromEstimateModalOpen] = useState(false);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});
  const [bidDialogOpen, setBidDialogOpen] = useState(false);
  const [addSubcontractorDialogOpen, setAddSubcontractorDialogOpen] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [bidDetailModalOpen, setBidDetailModalOpen] = useState(false);
  const [selectedBidDetail, setSelectedBidDetail] = useState<any>(null);
  const [pendingBidItem, setPendingBidItem] = useState<{
    estimateItemId: string;
    trade: string;
    category: string;
    estimatedCost: number;
  } | null>(null);
  const [currentBidItem, setCurrentBidItem] = useState<{
    estimateItemId: string;
    trade: string;
    category: string;
    estimatedCost: number;
  } | null>(null);
  const [bidsData, setBidsData] = useState<Record<string, BidItem[]>>({});
  const [attachments, setAttachments] = useState<File[]>([]);

  // Load confirmed bidding processes from localStorage on component mount
  useEffect(() => {
    const storageKey = `bidding-processes-${projectId}`;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsedData = JSON.parse(saved);
        setConfirmedBiddingProcesses(parsedData);
      } catch (error) {
        console.error('Error loading bidding processes:', error);
      }
    }
  }, [projectId]);

  // Save confirmed bidding processes to localStorage whenever they change
  useEffect(() => {
    const storageKey = `bidding-processes-${projectId}`;
    localStorage.setItem(storageKey, JSON.stringify(confirmedBiddingProcesses));
  }, [confirmedBiddingProcesses, projectId]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingBid, setEditingBid] = useState<BidItem | null>(null);
  const [showEditBidModal, setShowEditBidModal] = useState(false);
  const [showAddEstimateDropdown, setShowAddEstimateDropdown] = useState(false);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{ open: boolean; type: string; data: any }>({ open: false, type: '', data: null });
  const [startBidModalOpen, setStartBidModalOpen] = useState(false);
  const [selectedEstimateForBidding, setSelectedEstimateForBidding] = useState<any>(null);
  const [selectedEstimate, setSelectedEstimate] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch project bids from database
  const { data: allBids = [], refetch: refetchBids } = useQuery({
    queryKey: ['/api/bids', projectId],
    queryFn: async () => {
      const response = await fetch(`/api/bids/${projectId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch bids');
      }
      return await response.json();
    },
  });

  // Use unified estimates hook
  const { estimates: allEstimates, isLoading: estimatesLoading, getProjectEstimates } = useEstimates();
  
  const estimates = getProjectEstimates(projectId);

  // Fetch subcontractors from contacts
  const { data: allContacts = [] } = useQuery({
    queryKey: ['/api/contacts'],
  });

  const subcontractors = (allContacts as any[]).filter((contact: any) => 
    contact.role === 'subcontractor'
  );

  // Fetch bid processes for this project
  const { data: bidProcesses = [], isLoading: bidProcessesLoading } = useQuery({
    queryKey: ['/api/bid-processes/project', projectId],
    queryFn: async () => {
      try {
        const response = await fetch(`/api/bid-processes/project?projectId=${projectId}`);
        if (!response.ok) {
          console.error('Failed to fetch bid processes');
          return [];
        }
        return await response.json();
      } catch (error) {
        console.error('Error fetching bid processes:', error);
        return [];
      }
    },
    enabled: !!projectId,
  });

  // Fetch bid responses for expanded view
  const { data: bidResponses = [], refetch: refetchBidResponses } = useQuery({
    queryKey: ['/api/bid-responses/project', projectId],
    queryFn: async () => {
      try {
        const response = await fetch(`/api/bid-responses/project/${projectId}`);
        if (!response.ok) return [];
        return await response.json();
      } catch (error) {
        console.error('Error fetching bid responses:', error);
        return [];
      }
    },
    enabled: !!projectId,
  });

  // Transform database bids into the component's expected format
  useEffect(() => {
    if (allBids.length > 0) {
      const transformedBids: Record<string, BidItem[]> = {};
      
      allBids.forEach((bid: any) => {
        const estimateItemId = bid.estimateId?.toString() || 'unknown';
        
        if (!transformedBids[estimateItemId]) {
          transformedBids[estimateItemId] = [];
        }
        
        transformedBids[estimateItemId].push({
          id: bid.id.toString(),
          estimateItemId: estimateItemId,
          subcontractorId: bid.contractorName, // Store name as ID for now
          subcontractorName: bid.contractorName,
          contactEmail: bid.contractorEmail || '',
          contactPhone: bid.contractorPhone || '',
          bidAmount: bid.bidAmount,
          timeline: parseInt(bid.timeline) || 0,
          notes: bid.notes || '',
          status: bid.status || 'pending',
          trade: 'General', // Will be populated from estimate data
          category: 'General', // Will be populated from estimate data
          submittedDate: bid.createdAt,
          attachments: [], // File attachments not implemented yet
        });
      });
      
      setBidsData(transformedBids);
    }
  }, [allBids]);

  // Form for creating bids
  const bidForm = useForm({
    resolver: zodResolver(bidItemSchema),
    defaultValues: {
      subcontractorId: undefined,
      subcontractorName: '',
      contactEmail: '',
      contactPhone: '',
      bidAmount: 0,
      timeline: 0,
      notes: '',
    },
  });

  // Form for adding new subcontractor
  const addSubcontractorForm = useForm({
    resolver: zodResolver(addSubcontractorSchema),
    defaultValues: {
      name: '',
      company: '',
      email: '',
      phone: '',
      trade: '',
      licenseNumber: '',
      insuranceExpiration: '',
    },
  });

  // Form for editing bids
  const editBidForm = useForm({
    resolver: zodResolver(bidItemSchema),
    defaultValues: {
      subcontractorId: undefined,
      subcontractorName: '',
      contactEmail: '',
      contactPhone: '',
      bidAmount: 0,
      timeline: 0,
      notes: '',
    },
  });

  // Calculate individual item total including markup and contingency
  const calculateItemTotal = (item: any) => {
    const baseCost = parseFloat(item.estimatedCost?.toString()) || 0;
    const markupAmount = baseCost * ((parseFloat(item.markup?.toString()) || 0) / 100);
    const contingencyAmount = (baseCost + markupAmount) * ((parseFloat(item.contingency?.toString()) || 0) / 100);
    return baseCost + markupAmount + contingencyAmount;
  };

  const parseEstimateData = (estimate: any): EstimateData => {
    try {
      let categories = [];
      
      // Use the categories and items from the normalized database structure
      if (estimate.categories && Array.isArray(estimate.categories)) {
        categories = estimate.categories.map((cat: any) => ({
          name: cat.categoryName || cat.name || 'Unknown Category',
          items: (cat.items || []).map((item: any) => ({
            ...item,
            estimatedCost: parseFloat(item.estimatedCost) || 0,
            markup: parseFloat(item.markup) || 0,
            contingency: parseFloat(item.contingency) || 0,
            status: item.status || 'Not Started', // Preserve actual status from database
          }))
        }));
      }
      
      // Fallback to notes field if categories are not available
      if (categories.length === 0 && estimate.notes) {
        try {
          const parsed = JSON.parse(estimate.notes);
          categories = Array.isArray(parsed) ? parsed.map((cat: any) => ({
            name: cat.categoryName || cat.name || 'Unknown Category',
            items: cat.items || []
          })) : [];
        } catch (parseError) {
          // Ignore parse errors
        }
      }
      
      // Final fallback to basic estimate structure
      if (categories.length === 0) {
        categories = [{
          name: estimate.trade || 'General',
          items: [{
            id: estimate.id,
            trade: estimate.trade || 'General',
            vendor: estimate.vendor || 'Unknown',
            estimatedCost: estimate.estimatedAmount || 0,
            duration: estimate.laborHours || 0,
            description: estimate.description || '',
            status: estimate.status || 'Not Started' as const,
            approvalStatus: 'Pending' as const,
            markup: 0,
            contingency: 0,
          }]
        }];
      }
      
      // Calculate the actual total from categories and items
      const calculatedTotal = categories.reduce((total: number, category: any) => 
        total + category.items.reduce((catTotal: number, item: any) => 
          catTotal + calculateItemTotal(item), 0), 0);
      
      return {
        id: estimate.id,
        name: estimate.name || estimate.trade,
        description: estimate.description || '',
        categories: categories,
        totalCost: calculatedTotal, // Use calculated total instead of database value
        status: estimate.status || 'pending'
      };
    } catch (e) {
      
      return {
        id: estimate.id,
        name: estimate.trade || 'Unknown',
        description: estimate.description || '',
        categories: [],
        totalCost: 0,
        status: estimate.status || 'pending'
      };
    }
  };

  const toggleCategory = (categoryName: string) => {
    setOpenCategories(prev => ({
      ...prev,
      [categoryName]: !prev[categoryName]
    }));
  };

  const openBidDialog = (item: EstimateItem, category: string) => {
    setCurrentBidItem({
      estimateItemId: item.id,
      trade: item.trade,
      category: category,
      estimatedCost: calculateItemTotal(item) // Use calculated total instead of base cost
    });
    setBidDialogOpen(true);
  };

  // Auto bid mutation - creates bid processes only for items that haven't been bid out yet
  const autoBidMutation = useMutation({
    mutationFn: async (estimateData: EstimateData) => {
      return apiRequest(`/api/bid-processes/auto-bid/${estimateData.id}`, 'POST');
    },
    onSuccess: async (result) => {
      const { bidProcessesCreated, invitationsSent, statusUpdates, errors, summary } = result;
      
      // Create detailed confirmation message
      let message = summary.message;
      if (errors && errors.length > 0) {
        message += `\n\nWarnings: ${errors.slice(0, 3).join(', ')}`;
        if (errors.length > 3) {
          message += ` and ${errors.length - 3} more...`;
        }
      }
      
      toast({
        title: "Auto Bid Complete",
        description: message,
        variant: errors && errors.length > 0 ? "default" : "default",
      });
      
      // Show detailed results if there were new invitations
      if (invitationsSent && invitationsSent.length > 0) {
        // Development logging removed
        // Development logging removed
      }
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/estimates'] });
      queryClient.invalidateQueries({ queryKey: ['/api/bid-processes/project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['/api/bid-responses/project', projectId] });
    },
    onError: (error) => {
      toast({
        title: "Auto Bid Failed", 
        description: "Failed to create automatic bid processes. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Handle subcontractor creation mutation
  const createSubcontractorMutation = useMutation({
    mutationFn: async (subcontractorData: any) => {
      return await apiRequest('/api/contacts', 'POST', {
        ...subcontractorData,
        role: 'subcontractor'
      });
    },
    onSuccess: (newSubcontractor) => {
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      
      // Auto-fill the bid form with the new subcontractor
      bidForm.setValue('subcontractorId', newSubcontractor.id);
      bidForm.setValue('subcontractorName', newSubcontractor.company || newSubcontractor.name);
      bidForm.setValue('contactEmail', newSubcontractor.email || '');
      bidForm.setValue('contactPhone', newSubcontractor.phone || '');
      
      setAddSubcontractorDialogOpen(false);
      addSubcontractorForm.reset();
      
      toast({
        title: "Subcontractor Added",
        description: `${newSubcontractor.company || newSubcontractor.name} has been added to your contacts.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to add subcontractor. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Award job mutation
  const awardJobMutation = useMutation({
    mutationFn: async ({ bidResponseId, estimateItemId }: { bidResponseId: number, estimateItemId: number }) => {
      const response = await apiRequest(`/api/bid-responses/${bidResponseId}/select`, 'PATCH', { estimateItemId });
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Job Awarded",
        description: "Successfully awarded job to subcontractor. Other bids have been declined.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/bid-responses/project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['/api/estimates'] });
      setExpandedItemId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Award Failed",
        description: error.message || "Failed to award job",
        variant: "destructive",
      });
    },
  });

  // Send reminder mutation
  const sendReminderMutation = useMutation({
    mutationFn: async ({ bidProcessId, contactId }: { bidProcessId: number, contactId: number }) => {
      const response = await apiRequest(`/api/bid-processes/${bidProcessId}/send-reminder`, 'POST', { contactId });
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Reminder Sent",
        description: "Bid reminder has been sent to the subcontractor.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Reminder Failed",
        description: error.message || "Failed to send reminder",
        variant: "destructive",
      });
    },
  });

  // Check if subcontractor exists and prompt to add if not
  const handleSubcontractorNameChange = (companyName: string) => {
    if (companyName.trim() && companyName.length > 2) {
      const existingSubcontractor = subcontractors.find(
        (sub: any) => 
          sub.company?.toLowerCase().includes(companyName.toLowerCase()) ||
          sub.name?.toLowerCase().includes(companyName.toLowerCase())
      );
      
      if (!existingSubcontractor) {
        // Pre-fill the add subcontractor form
        addSubcontractorForm.setValue('company', companyName);
        if (currentBidItem?.trade) {
          addSubcontractorForm.setValue('trade', currentBidItem.trade);
        }
        
        setPendingBidItem(currentBidItem);
        setAddSubcontractorDialogOpen(true);
      }
    }
  };

  // Handle subcontractor selection from contacts
  const handleSubcontractorSelect = (subcontractorId: string) => {
    const selectedSub = subcontractors.find(sub => sub.id.toString() === subcontractorId);
    if (selectedSub) {
      bidForm.setValue('subcontractorId', selectedSub.id);
      bidForm.setValue('subcontractorName', selectedSub.company || selectedSub.name);
      bidForm.setValue('contactEmail', selectedSub.email || '');
      bidForm.setValue('contactPhone', selectedSub.phone || '');
    }
  };

  // Handle file uploads for bid attachments
  const handleFileUpload = (files: FileList | null) => {
    if (files) {
      const newFiles = Array.from(files);
      setAttachments(prev => [...prev, ...newFiles]);
    }
  };

  // Mutation for updating bids
  const updateBidMutation = useMutation({
    mutationFn: async (data: { bidId: string; updateData: any }) => {
      const response = await apiRequest(`/api/bids/${data.bidId}`, 'PATCH', data.updateData);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bids', projectId] });
      refetchBids();
      toast({
        title: 'Success',
        description: 'Bid updated successfully',
      });
      setShowEditBidModal(false);
      setEditingBid(null);
      editBidForm.reset();
    },
    onError: (error) => {
      console.error('Error updating bid:', error);
      toast({
        title: 'Error',
        description: 'Failed to update bid. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Mutation for deleting bids
  const deleteBidMutation = useMutation({
    mutationFn: async (bidId: string) => {
      const response = await apiRequest(`/api/bids/${bidId}`, 'DELETE');
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bids', projectId] });
      refetchBids();
      toast({
        title: 'Success',
        description: 'Bid deleted successfully',
      });
    },
    onError: (error) => {
      console.error('Error deleting bid:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete bid. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Function to delete bid process for an estimate item
  const deleteBidProcessForItem = async (estimateItemId: number) => {
    try {
      const response = await apiRequest(`/api/bid-processes/item/${estimateItemId}`, 'DELETE');
      
      if (response) {
        // Refresh bid processes data
        queryClient.invalidateQueries({ queryKey: ['/api/bid-processes/project', projectId] });
        
        // Also refresh estimates to update status
        queryClient.invalidateQueries({ queryKey: ['/api/estimates'] });
        
        // Success operation completed
      }
    } catch (error) {
      console.error(`❌ Error deleting bid process for item ${estimateItemId}:`, error);
    }
  };

  // Functions for editing bids
  const openEditBidModal = (bid: BidItem) => {
    setEditingBid(bid);
    editBidForm.reset({
      subcontractorName: bid.subcontractorName,
      contactEmail: bid.contactEmail,
      contactPhone: bid.contactPhone,
      bidAmount: bid.bidAmount,
      timeline: bid.timeline,
      notes: bid.notes,
    });
    setShowEditBidModal(true);
  };

  const handleEditBidSubmit = (data: any) => {
    if (editingBid) {
      updateBidMutation.mutate({
        bidId: editingBid.id!,
        updateData: {
          contractorName: data.subcontractorName,
          contractorEmail: data.contactEmail,
          contractorPhone: data.contactPhone,
          bidAmount: data.bidAmount,
          timeline: data.timeline.toString(),
          notes: data.notes,
        },
      });
    }
  };

  const handleDeleteBid = (bidId: string) => {
    if (confirm('Are you sure you want to delete this bid? This action cannot be undone.')) {
      deleteBidMutation.mutate(bidId);
    }
  };

  // New function to open bid process modal for estimate items
  const openBidFromEstimateModal = (estimateItem: any) => {
    setSelectedEstimateItem(estimateItem);
    setBidFromEstimateModalOpen(true);
  };

  // Function to open the smart Start Bidding modal
  const openStartBidModal = (estimateItem: any) => {
    setSelectedEstimateForBidding(estimateItem);
    setStartBidModalOpen(true);
  };

  // Callback when bid invitations are sent successfully  
  const handleBidInvitesSent = async () => {
    // Processing operation
    
    // Force complete cache refresh using unified hook
    await queryClient.removeQueries({ queryKey: ['/api/estimates'] });
    await queryClient.invalidateQueries({ queryKey: ['/api/estimates'] });
    
    // Brief delay then refetch
    await new Promise(resolve => setTimeout(resolve, 200));
    await queryClient.refetchQueries({ queryKey: ['/api/estimates'] });
    
    // Success operation completed
  };

  const handleEstimateConfirmation = (estimate: EstimateData) => {
    // Directly add to confirmed bidding processes - no temporary state
    if (!confirmedBiddingProcesses.find(e => e.id === estimate.id)) {
      setConfirmedBiddingProcesses(prev => [...prev, estimate]);
      toast({
        title: "Estimate Added",
        description: `${estimate.name} is now active for bidding`,
      });
    }
  }

  // Function to remove estimate from bidding process
  const removeBiddingProcess = (estimateId: number) => {
    setConfirmedBiddingProcesses(prev => prev.filter(e => e.id !== estimateId));
    toast({
      title: "Bidding Process Removed",
      description: "Estimate removed from bidding management",
    });
  };

  // Enhanced edit functions
  const handleDeleteEstimate = (estimateId: number) => {
    setDeleteConfirmModal({
      open: true,
      type: 'estimate',
      data: { estimateId }
    });
  };

  const handleDeleteEstimateItem = (estimateId: number, categoryIndex: number, itemIndex: number) => {
    setDeleteConfirmModal({
      open: true,
      type: 'estimateItem',
      data: { estimateId, categoryIndex, itemIndex }
    });
  };

  const handleDeleteBidFromItem = (bidId: string, itemId: string) => {
    setDeleteConfirmModal({
      open: true,
      type: 'bid',
      data: { bidId, itemId }
    });
  };

  const confirmDelete = () => {
    const { type, data } = deleteConfirmModal;
    
    if (type === 'estimate') {
      // Delete entire estimate from bidding process
      setConfirmedBiddingProcesses(prev => prev.filter(e => e.id !== data.estimateId));
      toast({
        title: "Estimate Deleted",
        description: "Entire estimate removed from bidding process",
      });
    } else if (type === 'estimateItem') {
      // Delete individual estimate item and associated bid process
      setConfirmedBiddingProcesses(prev => prev.map(estimate => {
        if (estimate.id === data.estimateId) {
          const updatedCategories = [...estimate.categories];
          const deletedItem = updatedCategories[data.categoryIndex].items[data.itemIndex];
          updatedCategories[data.categoryIndex].items.splice(data.itemIndex, 1);
          
          // Delete bid process from backend if it exists
          if (deletedItem && deletedItem.id) {
            deleteBidProcessForItem(parseInt(deletedItem.id));
          }
          
          // Remove category if no items left
          if (updatedCategories[data.categoryIndex].items.length === 0) {
            updatedCategories.splice(data.categoryIndex, 1);
          }
          
          return { ...estimate, categories: updatedCategories };
        }
        return estimate;
      }));
      toast({
        title: "Item Deleted",
        description: "Estimate item and associated bid process removed completely",
      });
    } else if (type === 'bid') {
      // Delete individual bid using the existing mutation
      deleteBidMutation.mutate(data.bidId);
      
      // Also update local state immediately for UI feedback
      setBidsData(prev => {
        const updatedBidsData = { ...prev };
        Object.keys(updatedBidsData).forEach(itemId => {
          updatedBidsData[itemId] = updatedBidsData[itemId].filter(bid => bid.id !== data.bidId);
        });
        return updatedBidsData;
      });
    }
    
    setDeleteConfirmModal({ open: false, type: '', data: null });
  };

  const addAnotherEstimate = () => {
    setShowAddEstimateDropdown(true);
  };

  const removeEstimate = (estimateId: number) => {
    setSelectedEstimate(prev => prev.filter((e: any) => e.id !== estimateId));
    toast({
      title: "Estimate Removed",
      description: "Estimate removed from bidding process",
    });
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // Create bid mutation to save to database
  const createBidMutation = useMutation({
    mutationFn: async (bidData: any) => {
      return await apiRequest('/api/bids', 'POST', bidData);
    },
    onSuccess: () => {
      refetchBids(); // Refresh bids from database
      queryClient.invalidateQueries({ queryKey: ['/api/bids', projectId] });
      queryClient.invalidateQueries({ queryKey: ['/api/estimates'] });
      
      toast({
        title: "Bid Saved",
        description: "Estimate status automatically updated to 'Bidding'.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error Saving Bid",
        description: error.message || "Failed to save bid. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update estimate item status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ estimateId, itemId, status }: { estimateId: number; itemId: number; status: string }) => {
      return await apiRequest(`/api/estimates/${estimateId}/items/${itemId}/status`, 'PATCH', { status });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates'] });
      
      toast({
        title: "Status Updated",
        description: `Estimate item status updated to '${variables.status}'.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error Updating Status",
        description: error.message || "Failed to update status. Please try again.",
        variant: "destructive",
      });
    },
  });

  const saveBid = async (data: any) => {
    if (!currentBidItem || !selectedEstimate) return;
    
    try {
      // Save manual bid to database using the working API endpoint
      const manualBidData = {
        projectId: projectId,
        estimateItemId: currentBidItem.estimateItemId,
        subcontractorId: data.subcontractorId || '',
        bidAmount: data.bidAmount,
        daysToComplete: data.timeline,
        bidNotes: data.notes || '',
        submissionDate: new Date().toISOString().split('T')[0], // Today's date
        isManualBid: true
      };
      
      // Development logging removed
      const response = await apiRequest('/api/manual-bids', 'POST', manualBidData);
      // Success operation completed
      
      // Refresh data to show the new bid
      queryClient.invalidateQueries({ queryKey: ['/api/bid-responses/project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['/api/estimates'] });
      
      // Show success message
      toast({
        title: "Manual Bid Created",
        description: `Successfully recorded bid for ${data.subcontractorName || 'subcontractor'} - $${data.bidAmount.toLocaleString()}`,
      });

      setBidDialogOpen(false);
      setCurrentBidItem(null);
      setAttachments([]);
      bidForm.reset();
      
    } catch (error) {
      
      toast({
        title: "Error Saving Bid",
        description: "Failed to save bid. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Update bid status mutation
  const updateBidStatusMutation = useMutation({
    mutationFn: async ({ bidId, status }: { bidId: string; status: string }) => {
      return await apiRequest(`/api/bids/${bidId}`, 'PATCH', { status });
    },
    onSuccess: () => {
      refetchBids();
      queryClient.invalidateQueries({ queryKey: ['/api/bids', projectId] });
    },
    onError: (error: any) => {
      toast({
        title: "Error Updating Bid",
        description: error.message || "Failed to update bid status.",
        variant: "destructive",
      });
    },
  });

  // Select winning bid response mutation - auto-updates estimate item
  const selectWinningBidMutation = useMutation({
    mutationFn: async (bidResponseId: number) => {
      return await apiRequest(`/api/bid-responses/${bidResponseId}/select`, 'PATCH');
    },
    onSuccess: (data) => {
      // Refresh all relevant data
      refetchBids();
      queryClient.invalidateQueries({ queryKey: ['/api/bids', projectId] });
      queryClient.invalidateQueries({ queryKey: ['/api/estimates'] });
      queryClient.invalidateQueries({ queryKey: ['/api/bid-processes/project', projectId] });
      
      toast({
        title: "Bid Accepted Successfully",
        description: data.message || "Bid accepted and estimate item updated automatically with vendor details.",
        variant: "default",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error Accepting Bid",
        description: error.message || "Failed to accept bid and update estimate item.",
        variant: "destructive",
      });
    },
  });

  const updateBidStatus = async (estimateItemId: string, bidIndex: number, newStatus: 'accepted' | 'rejected') => {
    const itemBids = bidsData[estimateItemId] || [];
    const bidToUpdate = itemBids[bidIndex];
    
    if (!bidToUpdate) return;

    try {
      if (newStatus === 'accepted') {
        // Use the new selectWinningBid mutation for automatic estimate item updates
        // This will handle vendor, cost, duration, and status updates automatically
        if (bidToUpdate.bidResponseId) {
          await selectWinningBidMutation.mutateAsync(bidToUpdate.bidResponseId);
        } else {
          // Fallback to legacy bid acceptance for older bid records
          await updateBidStatusMutation.mutateAsync({
            bidId: bidToUpdate.id,
            status: newStatus
          });
          
          // Manual estimate item update for legacy bids
          if (selectedEstimate) {
            await updateStatusMutation.mutateAsync({
              estimateId: parseInt(selectedEstimate.id),
              itemId: parseInt(estimateItemId),
              status: 'Waiting Approval'
            });
          }
        }
      } else {
        // For rejection, use the standard mutation
        await updateBidStatusMutation.mutateAsync({
          bidId: bidToUpdate.id,
          status: newStatus
        });
      }

      // Update local state for immediate feedback
      setBidsData(prev => {
        const updatedItemBids = [...(prev[estimateItemId] || [])];
        updatedItemBids[bidIndex] = { ...updatedItemBids[bidIndex], status: newStatus };
        
        // If accepting, reject all other bids for this item
        if (newStatus === 'accepted') {
          updatedItemBids.forEach((bid, index) => {
            if (index !== bidIndex) {
              bid.status = 'rejected';
            }
          });
        }
        
        return {
          ...prev,
          [estimateItemId]: updatedItemBids
        };
      });

      // Show appropriate toast (success toast handled by mutation)
      if (newStatus === 'rejected') {
        toast({ 
          title: "Bid Rejected", 
          description: "The bid has been rejected."
        });
      }

    } catch (error) {
      
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted': return 'default';
      case 'pending': return 'secondary';
      case 'rejected': return 'destructive';
      default: return 'secondary';
    }
  };

  // Helper function to map subcontractor companies to trade types based on known mappings
  const getTradeFromCompanyName = useCallback((companyName: string): string | null => {
    const tradeMap: Record<string, string> = {
      'Jeff Dumas Concrete Construction': 'Foundation',
      'JT Digs': 'Excavation',
      'BearCo Electric': 'Electrical',
      'HVAC': 'HVAC',
      'Solar': 'Other', // Solar panels often categorized as Other
    };
    
    return tradeMap[companyName] || null;
  }, []);

  // Enhanced function to get bid responses for an item with fallback matching
  const getBidResponsesForItem = useCallback((itemId: string) => {
    const currentItemTrade = getBidItemTrade(itemId);
    // Search/lookup operation
    
    // First, try exact ID matching
    let responses = bidResponses.filter(br => {
      return br.estimateItemId === itemId || br.estimateItemId === parseInt(itemId);
    });
    // Development logging removed
    
    // If no exact matches and we have a trade, try trade-based matching for manual bids
    if (responses.length === 0 && currentItemTrade) {
      // Search/lookup operation
      // Development logging removed));
      
      responses = bidResponses.filter(br => {
        if (!br.isManualBid) {
          // Development logging removed
          return false;
        }
        
        // Map company name to trade type
        const bidTrade = getTradeFromCompanyName(br.subcontractorCompany || '');
        // Search/lookup operation
        const matched = bidTrade === currentItemTrade;
        
        if (matched) {
          // Success operation completed
        }
        
        return matched;
      });
    }
    
    // Search/lookup operation
    return responses;
  }, [bidResponses, getTradeFromCompanyName, getBidItemTrade]);

  const getBidStatus = (estimateItemId: string): 'Not Started' | 'Actively Bidding' | 'Bids Received' | 'Jobs Awarded' => {
    // Use the enhanced function that supports trade-based matching
    const itemBidResponses = getBidResponsesForItem(estimateItemId);
    const hasBidProcess = bidProcesses.some((bp: any) => 
      bp.estimateItemId === parseInt(estimateItemId) || 
      (bp.trade?.toLowerCase() === getBidItemTrade(estimateItemId)?.toLowerCase() && !bp.estimateItemId)
    );
    
    // Check if any bid is awarded/accepted
    if (itemBidResponses.some((br: any) => br.status === 'awarded' || br.status === 'accepted')) {
      return 'Jobs Awarded';
    } else if (itemBidResponses.length > 0) {
      // Has bid responses but none awarded yet
      return 'Bids Received';
    } else if (hasBidProcess) {
      // Has bid process but no responses yet
      return 'Actively Bidding';
    } else {
      // No bid process created yet
      return 'Not Started';
    }
  };

  // Helper function to get trade for an estimate item
  const getBidItemTrade = (estimateItemId: string): string | undefined => {
    for (const estimate of confirmedBiddingProcesses) {
      for (const category of estimate.categories) {
        const item = category.items.find(item => item.id === estimateItemId);
        if (item) return item.trade;
      }
    }
    return undefined;
  };



  const canEdit = userRole === 'admin' || userRole === 'projectManager';

  if (estimatesLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-theme-primary"></div>
      </div>
    );
  }

  if (estimates.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Subcontractor Bids
          </CardTitle>
          <CardDescription>Manage bids from subcontractors for individual estimate items</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No estimates available</h3>
            <p className="text-gray-500">Create estimates first to start receiving bids from subcontractors.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate bid status summary for the bidding workflow
  const bidStatusSummary = useMemo(() => {
    const allBidItems = confirmedBiddingProcesses.flatMap(estimate => 
      estimate.categories.flatMap(category => category.items)
    );
    
    // Calculate bid-specific statuses: Not Started, Actively Bidding, Bids Received, Jobs Awarded
    let notStarted = 0;
    let activelyBidding = 0;
    let bidsReceived = 0;
    let jobsAwarded = 0;
    
    allBidItems.forEach(item => {
      const itemBidResponses = getBidResponsesForItem(item.id);
      const hasBidProcess = bidProcesses.some((bp: any) => 
        bp.estimateItemId === parseInt(item.id) || 
        (bp.trade?.toLowerCase() === item.trade?.toLowerCase() && !bp.estimateItemId)
      );
      
      // Check if any bid is awarded/accepted
      if (itemBidResponses.some((br: any) => br.status === 'awarded' || br.status === 'accepted')) {
        jobsAwarded++;
      } else if (itemBidResponses.length > 0) {
        // Has bid responses but none awarded yet
        bidsReceived++;
      } else if (hasBidProcess) {
        // Has bid process but no responses yet
        activelyBidding++;
      } else {
        // No bid process created yet
        notStarted++;
      }
    });
    
    return {
      estimating: notStarted,
      activelyBidding,
      bidsReceived,
      jobsAwarded,
      totalItems: allBidItems.length
    };
  }, [confirmedBiddingProcesses, bidResponses, bidProcesses]);

  return (
    <div className="space-y-6">
      {/* Bid Status Overview Cards */}
      {confirmedBiddingProcesses.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Not Started</CardTitle>
              <div className="text-2xl font-bold text-gray-600">{bidStatusSummary.estimating}</div>
              <p className="text-xs text-gray-500">items not yet bid</p>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Actively Bidding</CardTitle>
              <div className="text-2xl font-bold text-amber-600">{bidStatusSummary.activelyBidding}</div>
              <p className="text-xs text-gray-500">invitations sent</p>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Bids Received</CardTitle>
              <div className="text-2xl font-bold text-theme-primary">{bidStatusSummary.bidsReceived}</div>
              <p className="text-xs text-gray-500">awaiting review</p>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Jobs Awarded</CardTitle>
              <div className="text-2xl font-bold text-green-600">{bidStatusSummary.jobsAwarded}</div>
              <p className="text-xs text-gray-500">contractors selected</p>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Total Items</CardTitle>
              <div className="text-2xl font-bold text-purple-600">{bidStatusSummary.totalItems}</div>
              <p className="text-xs text-gray-500">estimate items</p>
            </CardHeader>
          </Card>
        </div>
      )}
      
      {/* New Estimate-Based Bidding Interface */}
      {/* Add New Estimates Section - Only show if there are available estimates */}
      {estimates.filter((est: any) => 
        !confirmedBiddingProcesses.find(confirmed => confirmed.id === est.id)
      ).length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Add Estimate to Bidding
                </CardTitle>
                <CardDescription>
                  Select an estimate below to add it permanently to your bidding workspace
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Add More Estimates to Manage Bids</Label>
              <Select
                onValueChange={(value) => {
                  const estimate = estimates.find((est: any) => est.id.toString() === value);
                  if (estimate) {
                    handleEstimateConfirmation(parseEstimateData(estimate));
                  }
                }}
                value="select-estimate"
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Choose an estimate to add to bidding" />
                </SelectTrigger>
                <SelectContent>
                  {estimates
                    .filter((est: any) => 
                      !confirmedBiddingProcesses.find(confirmed => confirmed.id === est.id)
                    )
                    .map((estimate: any) => (
                      <SelectItem key={estimate.id.toString()} value={estimate.id.toString()}>
                        {estimate.name || estimate.trade} - ${parseEstimateData(estimate).totalCost.toLocaleString()}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Add Another Estimate Dropdown */}
      {showAddEstimateDropdown && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  Add Another Estimate
                </CardTitle>
                <CardDescription>
                  Select an additional estimate to add to your bidding workspace
                </CardDescription>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowAddEstimateDropdown(false)}
                className="flex items-center gap-2"
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Select 
                onValueChange={(value) => {
                  const selectedEstimate = estimates.find((est: any) => est.id === parseInt(value));
                  if (selectedEstimate) {
                    handleEstimateConfirmation(selectedEstimate);
                    setShowAddEstimateDropdown(false);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose an estimate to add" />
                </SelectTrigger>
                <SelectContent>
                  {estimates
                    .filter((est: any) => 
                      !confirmedBiddingProcesses.find(confirmed => confirmed.id === est.id)
                    )
                    .map((estimate: any) => (
                      <SelectItem key={estimate.id} value={estimate.id.toString()}>
                        {estimate.name || estimate.trade} - ${parseEstimateData(estimate).totalCost.toLocaleString()}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Render confirmed bidding processes - These persist permanently */}
      {confirmedBiddingProcesses.map((selectedEstimate) => (
        <Card key={`confirmed-${selectedEstimate.id}`}>
          <CardHeader className="bg-green-50">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  {selectedEstimate.name}
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    Bidding Active
                  </Badge>
                </CardTitle>
                <CardDescription>Use "Auto Bid All" to automatically invite subcontractors for all trades, or click "Add Bid" on individual items</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="default" 
                  size="sm"
                  onClick={() => autoBidMutation.mutate(selectedEstimate)}
                  disabled={autoBidMutation.isPending}
                  className="flex items-center gap-2 text-white"
                  style={{ 
                    backgroundColor: 'var(--accent-color)',
                    borderColor: 'var(--accent-color)'
                  }}
                >
                  <Zap className="h-4 w-4" />
                  {autoBidMutation.isPending ? 'Creating Bids...' : 'Auto Bid All'}
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={addAnotherEstimate}
                  className="flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Another Estimate
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setIsEditMode(!isEditMode)}
                  className="flex items-center gap-2"
                >
                  <Edit3 className="h-4 w-4" />
                  {isEditMode ? 'Exit Edit Mode' : 'Edit Bids'}
                </Button>
                {isEditMode && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleDeleteEstimate(selectedEstimate.id)}
                    className="flex items-center gap-2 text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete Entire Estimate
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {selectedEstimate.categories.map((category, categoryIndex) => {
                const isOpen = openCategories[category.name] ?? true;
                
                return (
                  <Collapsible key={categoryIndex} open={isOpen} onOpenChange={() => toggleCategory(category.name)}>
                    <Card className="border-l-4 border-l-green-500">
                      <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-gray-50 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {isOpen ? (
                                <ChevronDown className="h-5 w-5 text-gray-500" />
                              ) : (
                                <ChevronRight className="h-5 w-5 text-gray-500" />
                              )}
                              <div>
                                <CardTitle className="text-lg">{category.name}</CardTitle>
                                <CardDescription>
                                  {category.items.length} item{category.items.length !== 1 ? 's' : ''} · 
                                  ${category.items.reduce((sum, item) => sum + calculateItemTotal(item), 0).toLocaleString()}
                                </CardDescription>
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                      </CollapsibleTrigger>
                      
                      <CollapsibleContent>
                        <CardContent className="pt-0">
                          <div className="space-y-4">
                            {category.items.map((item, itemIndex) => {
                              const itemBids = bidsData[item.id] || [];
                              // Use calculated bid process status instead of estimate status
                              const bidStatus = getBidStatus(item.id);
                              const acceptedBid = itemBids.find(bid => bid.status === 'accepted');
                              
                              return (
                                <div 
                                  key={itemIndex} 
                                  className={`border rounded-lg p-4 space-y-4 transition-colors ${
                                    !isEditMode ? 'cursor-pointer hover:bg-gray-50' : 'cursor-default'
                                  }`}
                                  onClick={() => {
                                    // Don't trigger actions in edit mode
                                    if (isEditMode) return;
                                    
                                    const hasBidProcess = bidProcesses.some((bp: any) => 
                                      bp.estimateItemId === parseInt(item.id) && bp.trade?.toLowerCase() === item.trade?.toLowerCase()
                                    );
                                    if (hasBidProcess) {
                                      setExpandedItemId(expandedItemId === item.id ? null : item.id);
                                    } else {
                                      openStartBidModal(item);
                                    }
                                  }}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-6">
                                      <div className="flex items-center gap-2">
                                        <Building2 className="h-4 w-4 text-gray-500" />
                                        <span className="font-medium">{item.title || item.trade}</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <DollarSign className="h-4 w-4 text-gray-500" />
                                        <span className="text-gray-600">${calculateItemTotal(item).toLocaleString()}</span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <div className="flex items-center gap-2">
                                        <StatusBadge status={bidStatus} />
                                        {bidStatus === 'Jobs Awarded' && item.vendor && (
                                          <span className="text-sm text-green-700 font-medium">
                                            → {item.vendor}
                                          </span>
                                        )}
                                      </div>
                                      {(() => {
                                        const hasBidProcess = bidProcesses.some((bp: any) => 
                                          bp.estimateItemId === parseInt(item.id) || 
                                          (bp.trade?.toLowerCase() === item.trade?.toLowerCase() && !bp.estimateItemId)
                                        );
                                        
                                        // Check if there are any bid responses for this item
                                        const itemBidResponses = getBidResponsesForItem(item.id);
                                        
                                        // Only show interaction badge if status is not already showing received/awarded status
                                        if (bidStatus !== 'Bids Received' && bidStatus !== 'Jobs Awarded') {
                                          if (hasBidProcess) {
                                            return (
                                              <Badge variant="outline" className="text-theme-primary border-blue-600">
                                                {expandedItemId === item.id ? 'Hide Details' : 'Click to View Bids'}
                                                {itemBidResponses.length > 0 && ` (${itemBidResponses.length})`}
                                              </Badge>
                                            );
                                          } else {
                                            return (
                                              <Badge variant="outline" className="text-gray-600">
                                                Click to Start Bidding
                                              </Badge>
                                            );
                                          }
                                        } else if (hasBidProcess && itemBidResponses.length > 0) {
                                          // For submitted/awarded items, show click hint only if there are responses
                                          return (
                                            <Badge variant="outline" className="text-theme-primary border-blue-600">
                                              {expandedItemId === item.id ? 'Hide Details' : `View ${itemBidResponses.length} Bid${itemBidResponses.length !== 1 ? 's' : ''}`}
                                            </Badge>
                                          );
                                        }
                                        return null;
                                      })()}
                                      {isEditMode && (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={(e) => {
                                            e.stopPropagation(); // Prevent card click
                                            handleDeleteEstimateItem(selectedEstimate.id, categoryIndex, itemIndex);
                                          }}
                                          className="flex items-center gap-1 text-red-600 hover:text-red-700"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                          Delete Item
                                        </Button>
                                      )}
                                    </div>
                                  </div>

                                  {item.description && (
                                    <p className="text-sm text-gray-600">{item.description}</p>
                                  )}

                                  {/* Expanded Bid Detail View */}
                                  {expandedItemId === item.id && (
                                    <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
                                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                                        <Target className="h-4 w-4" />
                                        Bid Details: {item.trade} - {item.description}
                                      </h4>
                                      
                                      {(() => {
                                        const bidProcess = bidProcesses.find((bp: any) => 
                                          bp.estimateItemId === parseInt(item.id) || 
                                          (bp.trade?.toLowerCase() === item.trade?.toLowerCase() && !bp.estimateItemId)
                                        );
                                        
                                        if (!bidProcess) {
                                          return <p className="text-gray-500">No bid process found.</p>;
                                        }
                                        
                                        let invitedSubcontractors: number[] = [];
                                        try {
                                          invitedSubcontractors = JSON.parse(bidProcess.invitedSubcontractors || '[]');
                                          if (!Array.isArray(invitedSubcontractors)) {
                                            invitedSubcontractors = [];
                                          }
                                        } catch (error) {
                                          console.error('Error parsing invited subcontractors:', error);
                                          invitedSubcontractors = [];
                                        }
                                        
                                        const itemBidResponses = getBidResponsesForItem(item.id);
                                        
                                        return (
                                          <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                              <p className="text-sm text-gray-600">
                                                Invited {invitedSubcontractors.length} subcontractor(s) • 
                                                Received {itemBidResponses.length} bid(s)
                                              </p>
                                              <Button
                                                size="sm"
                                                variant="default"
                                                onClick={() => openBidDialog(item, category.name)}
                                                className="flex items-center gap-2 text-white"
                                                style={{ 
                                                  backgroundColor: 'var(--accent-color)',
                                                  borderColor: 'var(--accent-color)'
                                                }}
                                              >
                                                <Plus className="h-4 w-4" />
                                                Add Manual Bid
                                              </Button>
                                            </div>
                                            
                                            {/* Subcontractor Status List */}
                                            <div className="grid gap-3">
                                              {invitedSubcontractors.map((contactId: number) => {
                                                const contact = (allContacts as any[])?.find((c: any) => c.id === contactId);
                                                const bidResponse = itemBidResponses.find((br: any) => br.contactId === contactId);
                                                
                                                if (!contact) return null;
                                                
                                                return (
                                                  <div key={contactId} className="border rounded-lg p-3 bg-white">
                                                    <div className="flex items-center justify-between">
                                                      <div className="flex items-center gap-3">
                                                        <div>
                                                          <p className="font-medium">{contact.company || contact.name}</p>
                                                          <p className="text-sm text-gray-500">{contact.email}</p>
                                                        </div>
                                                      </div>
                                                      
                                                      <div className="flex items-center gap-3">
                                                        {bidResponse ? (
                                                          <>
                                                            <div className="text-right">
                                                              <p className="font-semibold text-green-600">
                                                                ${bidResponse.bidAmount?.toLocaleString()}
                                                              </p>
                                                              <p className="text-sm text-gray-500">
                                                                {bidResponse.timeline} days
                                                              </p>
                                                            </div>
                                                            <Badge variant="default" className="bg-green-100 text-green-800">
                                                              Bid Submitted
                                                            </Badge>
                                                            {(bidResponse.status === 'submitted' || bidResponse.status === 'pending') && (
                                                              <Button
                                                                size="sm"
                                                                variant="default"
                                                                onClick={() => awardJobMutation.mutate({ 
                                                                  bidResponseId: bidResponse.id, 
                                                                  estimateItemId: parseInt(item.id) 
                                                                })}
                                                                disabled={awardJobMutation.isPending}
                                                                className="flex items-center gap-1 text-white"
                                                                style={{ 
                                                                  backgroundColor: 'var(--accent-color)',
                                                                  borderColor: 'var(--accent-color)'
                                                                }}
                                                              >
                                                                <Award className="h-4 w-4" />
                                                                Award Job
                                                              </Button>
                                                            )}
                                                            {bidResponse.status === 'awarded' && (
                                                              <Badge variant="default" className="bg-blue-100 text-blue-800">
                                                                ✓ Awarded
                                                              </Badge>
                                                            )}
                                                          </>
                                                        ) : (
                                                          <>
                                                            <Badge variant="outline" className="text-amber-600 border-amber-600">
                                                              Awaiting Bid
                                                            </Badge>
                                                            <Button
                                                              size="sm"
                                                              variant="outline"
                                                              onClick={() => sendReminderMutation.mutate({ 
                                                                bidProcessId: bidProcess.id, 
                                                                contactId: contactId 
                                                              })}
                                                              disabled={sendReminderMutation.isPending}
                                                              className="flex items-center gap-1"
                                                            >
                                                              <Send className="h-4 w-4" />
                                                              Remind
                                                            </Button>
                                                          </>
                                                        )}
                                                      </div>
                                                    </div>
                                                    
                                                    {bidResponse?.notes && (
                                                      <div className="mt-2 pt-2 border-t">
                                                        <p className="text-sm text-gray-600">
                                                          <strong>Notes:</strong> {bidResponse.notes}
                                                        </p>
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  )}

                                  {acceptedBid && (
                                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                                      <div className="flex items-center gap-2 mb-2">
                                        <Check className="h-4 w-4 text-green-600" />
                                        <span className="font-medium text-green-800">Accepted Bid</span>
                                      </div>
                                      <div className="grid grid-cols-3 gap-4 text-sm">
                                        <div>
                                          <div className="text-gray-600">Subcontractor</div>
                                          <div className="font-medium">{acceptedBid.subcontractorName}</div>
                                        </div>
                                        <div>
                                          <div className="text-gray-600">Amount</div>
                                          <div className="font-medium">${acceptedBid.bidAmount.toLocaleString()}</div>
                                        </div>
                                        <div>
                                          <div className="text-gray-600">Timeline</div>
                                          <div className="font-medium">{acceptedBid.timeline} days</div>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {itemBids.length > 0 && (
                                    <div className="space-y-3">
                                      <div className="text-sm font-medium text-gray-700">
                                        Received Bids ({itemBids.length})
                                      </div>
                                      <div className="space-y-2">
                                        {itemBids.map((bid, bidIndex) => (
                                          <div key={bidIndex} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                            <div className="flex items-center gap-4">
                                              <div className="flex items-center gap-2">
                                                <User className="h-4 w-4 text-gray-500" />
                                                <span className="font-medium">{bid.subcontractorName}</span>
                                              </div>
                                              <span className="text-gray-600">${bid.bidAmount.toLocaleString()}</span>
                                              <span className="text-gray-600">{bid.timeline} days</span>
                                              <Badge variant={getStatusColor(bid.status)}>
                                                {bid.status.charAt(0).toUpperCase() + bid.status.slice(1)}
                                              </Badge>
                                            </div>
                                            <div className="flex gap-2">
                                              {canEdit && bid.status === 'pending' && !isEditMode && (
                                                <>
                                                  <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => updateBidStatus(item.id, bidIndex, 'accepted')}
                                                    className="text-green-600 hover:text-green-700"
                                                  >
                                                    <Check className="h-4 w-4" />
                                                  </Button>
                                                  <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => updateBidStatus(item.id, bidIndex, 'rejected')}
                                                    className="text-red-600 hover:text-red-700"
                                                  >
                                                    <X className="h-4 w-4" />
                                                  </Button>
                                                </>
                                              )}
                                              {canEdit && isEditMode && bid.id && (
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  onClick={() => handleDeleteBidFromItem(bid.id!, item.id)}
                                                  className="text-red-600 hover:text-red-700"
                                                >
                                                  <Trash2 className="h-4 w-4" />
                                                </Button>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </CardContent>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}



      {/* Bid Dialog */}
      <Dialog open={bidDialogOpen} onOpenChange={setBidDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Record Subcontractor Bid</DialogTitle>
            <DialogDescription>
              {currentBidItem && `Adding bid for ${currentBidItem.trade} (Est: $${currentBidItem.estimatedCost.toLocaleString()})`}
            </DialogDescription>
          </DialogHeader>
          <Form {...bidForm}>
            <form onSubmit={bidForm.handleSubmit(saveBid)} className="space-y-4">
              <FormField
                control={bidForm.control}
                name="subcontractorId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Select Subcontractor</FormLabel>
                    <Select 
                      onValueChange={(value) => {
                        field.onChange(value ? parseInt(value) : undefined);
                        handleSubcontractorSelect(value);
                      }}
                      value={field.value?.toString() || ''}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose from contacts or enter manually" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {subcontractors.map((sub: any) => (
                          <SelectItem key={sub.id} value={sub.id.toString()}>
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4" />
                              <span>{sub.company || sub.name}</span>
                              {sub.trade && <Badge variant="outline" className="text-xs">{sub.trade}</Badge>}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={bidForm.control}
                name="subcontractorName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company/Subcontractor Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Enter manually if not in contacts" 
                        {...field}
                        onBlur={(e) => {
                          field.onBlur();
                          handleSubcontractorNameChange(e.target.value);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={bidForm.control}
                  name="contactEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="email@company.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={bidForm.control}
                  name="contactPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Phone</FormLabel>
                      <FormControl>
                        <Input placeholder="(555) 123-4567" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={bidForm.control}
                  name="bidAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bid Amount ($)</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={bidForm.control}
                  name="timeline"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Timeline (Days)</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={bidForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Additional notes about the bid..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* File Attachments Section */}
              <div className="space-y-3">
                <Label>Bid Documents (Optional)</Label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                  <div className="text-center">
                    <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                    <label className="cursor-pointer">
                      <span className="text-sm text-theme-primary hover:text-blue-500">
                        Click to upload files
                      </span>
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                        onChange={(e) => handleFileUpload(e.target.files)}
                      />
                    </label>
                    <p className="text-xs text-gray-500 mt-1">
                      PDF, DOC, XLS, or images up to 10MB each
                    </p>
                  </div>
                </div>
                
                {attachments.length > 0 && (
                  <div className="space-y-2">
                    {attachments.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <div className="flex items-center gap-2">
                          <Paperclip className="h-4 w-4 text-gray-500" />
                          <span className="text-sm">{file.name}</span>
                          <span className="text-xs text-gray-500">
                            ({(file.size / 1024 / 1024).toFixed(1)} MB)
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeAttachment(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setBidDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  Record Bid
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Add New Subcontractor Dialog */}
      <Dialog open={addSubcontractorDialogOpen} onOpenChange={setAddSubcontractorDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Add New Subcontractor
            </DialogTitle>
            <DialogDescription>
              This subcontractor isn't in your contacts yet. Add them to continue with the bid.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...addSubcontractorForm}>
            <form onSubmit={addSubcontractorForm.handleSubmit((data) => createSubcontractorMutation.mutate(data))} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={addSubcontractorForm.control}
                  name="company"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="ABC Construction LLC" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={addSubcontractorForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="John Smith" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={addSubcontractorForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="john@abcconstruction.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={addSubcontractorForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input placeholder="(555) 123-4567" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={addSubcontractorForm.control}
                name="trade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trade/Specialty</FormLabel>
                    <FormControl>
                      <Input placeholder="Plumbing, Electrical, Framing, etc." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={addSubcontractorForm.control}
                  name="licenseNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>License Number</FormLabel>
                      <FormControl>
                        <Input placeholder="Optional license number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={addSubcontractorForm.control}
                  name="insuranceExpiration"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Insurance Expiration Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setAddSubcontractorDialogOpen(false);
                    addSubcontractorForm.reset();
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={createSubcontractorMutation.isPending}
                >
                  {createSubcontractorMutation.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Adding...
                    </>
                  ) : (
                    'Add Subcontractor'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* BidFromEstimateModal */}
      <BidFromEstimateModal
        open={bidFromEstimateModalOpen}
        onOpenChange={setBidFromEstimateModalOpen}
        estimateItem={selectedEstimateItem}
        onBidSubmit={() => {
          setBidFromEstimateModalOpen(false);
          setSelectedEstimateItem(null);
        }}
      />

      {/* Smart Start Bidding Modal */}
      <StartBidModal
        open={startBidModalOpen}
        onOpenChange={setStartBidModalOpen}
        estimateItem={selectedEstimateForBidding}
        projectId={projectId}
        onBidInvitesSent={handleBidInvitesSent}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmModal.open} onOpenChange={(open) => setDeleteConfirmModal({ ...deleteConfirmModal, open })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-600" />
              Confirm Deletion
            </DialogTitle>
            <DialogDescription>
              {deleteConfirmModal.type === 'estimate' && 'Are you sure you want to delete this entire estimate from the bidding process? This will remove all items and bids.'}
              {deleteConfirmModal.type === 'estimateItem' && 'Are you sure you want to delete this estimate item? This will remove all associated bids.'}
              {deleteConfirmModal.type === 'bid' && 'Are you sure you want to delete this bid? This action cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setDeleteConfirmModal({ open: false, type: '', data: null })}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDelete}
              className="flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Delete {deleteConfirmModal.type === 'estimate' ? 'Estimate' : deleteConfirmModal.type === 'estimateItem' ? 'Item' : 'Bid'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

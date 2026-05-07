import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEstimates } from '@/hooks/useEstimates';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  XCircle,
  AlertCircle,
  PlayCircle,
  Award,
  Eye,
  Send,
  Target,
  BarChart3
} from 'lucide-react';

// Enhanced interfaces based on existing system
interface EstimateItem {
  id: number;
  trade: string;
  vendor: string;
  estimatedCost: number;
  duration: number;
  description: string;
  status: 'Estimating' | 'Bidding' | 'Waiting Approval' | 'Approved' | 'Rejected';
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
  projectId: number;
  estimateItemId: number;
  status: 'draft' | 'sent' | 'received' | 'closed';
  createdAt: string;
  dueDate?: string;
  notes?: string;
  invitedSubcontractors: number[];
}

interface Contact {
  id: number;
  name: string;
  email: string;
  phone: string;
  company: string;
  type: string;
  trade?: string;
}

interface BidResponse {
  id: number;
  bidProcessId: number;
  estimateItemId: number;
  contactId: number;
  bidAmount: number;
  timeline: number;
  notes?: string;
  status: 'submitted' | 'selected' | 'rejected';
  submittedAt: string;
  contact?: Contact;
  attachments?: Array<{
    filename: string;
    originalName: string;
    path: string;
  }>;
}

interface BidsTabNewProps {
  projectId: string;
}

const bidFormSchema = z.object({
  selectedSubs: z.array(z.number()).min(1, 'Select at least one subcontractor'),
  notes: z.string().optional(),
  dueDate: z.string().optional(),
});

export default function BidsTabNewEditable({ projectId }: BidsTabNewProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State management
  const [showAllItems, setShowAllItems] = useState(false);
  const [bidDialogOpen, setBidDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedItemForBid, setSelectedItemForBid] = useState<EstimateItem | null>(null);
  const [editingItem, setEditingItem] = useState<EstimateItem | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // Form for bid invitations
  const bidForm = useForm<z.infer<typeof bidFormSchema>>({
    resolver: zodResolver(bidFormSchema),
    defaultValues: {
      selectedSubs: [],
      notes: '',
      dueDate: ''
    }
  });

  // Fetch project estimates
  const { data: projectEstimates = [], isLoading: estimatesLoading, refetch: refetchEstimates } = useQuery({
    queryKey: ['/api/estimates'],
    select: (data: EstimateData[]) => data.filter((estimate: EstimateData) => estimate.projectId === parseInt(projectId))
  });

  // Fetch bid processes
  const { data: bidProcesses = [], isLoading: bidProcessesLoading, refetch: refetchBidProcesses } = useQuery({
    queryKey: ['/api/bid-processes/project'],
    queryFn: async () => {
      const response = await fetch('/api/bid-processes/project');
      return response.json();
    }
  });

  // Fetch bid responses
  const { data: bidResponses = [], isLoading: bidResponsesLoading, refetch: refetchBidResponses } = useQuery({
    queryKey: [`/api/bid-responses/project/${projectId}`]
  });

  // Fetch contacts (subcontractors)
  const { data: contacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: ['/api/contacts'],
    select: (data: Contact[]) => data.filter((contact: Contact) => contact.type === 'subcontractor')
  });

  // Force refresh function
  const forceRefresh = () => {
    refetchEstimates();
    refetchBidProcesses();
    refetchBidResponses();
    queryClient.invalidateQueries({ queryKey: ['/api/estimates'] });
  };

  // Auto bid mutation (enhanced with duplicate prevention)
  const autoBidMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/bid-items/auto-bid/${projectId}`, {
        method: 'POST'
      });
      return response.json();
    },
    onSuccess: (data) => {
      forceRefresh();
      toast({
        title: 'Auto Bid Complete',
        description: data.message || `Created ${data.created || 0} bid processes and sent ${data.invitations || 0} invitations`
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
    onSuccess: (data) => {
      forceRefresh();
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

  // Delete bid process mutation
  const deleteBidMutation = useMutation({
    mutationFn: async (estimateItemId: number) => {
      const response = await fetch(`/api/bid-processes/item/${estimateItemId}`, {
        method: 'DELETE'
      });
      return response.json();
    },
    onSuccess: () => {
      forceRefresh();
      setDeleteConfirmId(null);
      setEditDialogOpen(false);
      toast({
        title: 'Bid Process Deleted',
        description: 'Item status reset to Estimating'
      });
    },
    onError: (error: any) => {
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
    projectEstimates.forEach((estimate: EstimateData) => {
      estimate.categories.forEach((category: EstimateCategory) => {
        allItems.push(...category.items);
      });
    });
    return allItems;
  };

  const getEstimateItemsBidProcess = (itemId: number) => {
    return bidProcesses.find((bp: BidProcess) => bp.estimateItemId === itemId);
  };

  const getBidResponsesForItem = (itemId: number) => {
    return bidResponses.filter((br: BidResponse) => br.estimateItemId === itemId);
  };

  const getSubcontractorsByTrade = (trade: string): Contact[] => {
    if (!trade) return contacts;
    return contacts.filter((contact: Contact) => 
      contact.trade?.toLowerCase().includes(trade.toLowerCase()) ||
      trade.toLowerCase().includes(contact.trade?.toLowerCase() || '')
    );
  };

  const getItemsToDisplay = () => {
    const allItems = getAllEstimateItems();
    
    if (showAllItems) {
      return allItems;
    }
    
    // Show only items that can be bid (Estimating status) or are already in bidding process
    return allItems.filter((item: EstimateItem) => {
      const bidProcess = getEstimateItemsBidProcess(item.id);
      return item.status === 'Estimating' || bidProcess;
    });
  };

  const getStatusBadgeColor = (status: string) => {
    const colors: { [key: string]: string } = {
      'Estimating': 'bg-gray-500',
      'Bidding': 'bg-yellow-500',
      'Waiting Approval': 'bg-blue-500',
      'Approved': 'bg-green-500',
      'Rejected': 'bg-red-500'
    };
    return colors[status] || 'bg-gray-500';
  };

  // Handle functions
  const handleAutoBid = () => {
    autoBidMutation.mutate();
  };

  const handleInviteBids = (item: EstimateItem) => {
    setSelectedItemForBid(item);
    setBidDialogOpen(true);
  };

  const handleBidSubmit = (data: z.infer<typeof bidFormSchema>) => {
    if (selectedItemForBid) {
      bidInvitationMutation.mutate({
        estimateItem: selectedItemForBid,
        selectedSubs: data.selectedSubs,
        notes: data.notes,
        dueDate: data.dueDate
      });
    }
  };

  const handleEditItem = (item: EstimateItem) => {
    setEditingItem(item);
    setEditDialogOpen(true);
  };

  const handleDeleteBid = () => {
    if (editingItem) {
      setDeleteConfirmId(editingItem.id);
    }
  };

  const confirmDelete = () => {
    if (deleteConfirmId) {
      deleteBidMutation.mutate(deleteConfirmId);
    }
  };

  if (estimatesLoading || bidProcessesLoading || bidResponsesLoading || contactsLoading) {
    return (
      <div className="p-6">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-theme-primary"></div>
        </div>
      </div>
    );
  }

  const itemsToDisplay = getItemsToDisplay();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Bid Management</h2>
          <p className="text-gray-600">Manage subcontractor bidding for this project</p>
        </div>
        
        <div className="flex gap-2">
          {!showAllItems && (
            <Button 
              variant="outline"
              onClick={() => setShowAllItems(true)}
            >
              <Eye className="h-4 w-4 mr-2" />
              Show All Items
            </Button>
          )}
          <Button 
            onClick={handleAutoBid}
            disabled={autoBidMutation.isPending}
            className="bg-theme-primary hover:bg-theme-primary-hover"
          >
            <Zap className="h-4 w-4 mr-2" />
            {autoBidMutation.isPending ? 'Processing...' : 'Auto Bid'}
          </Button>
        </div>
      </div>

      {/* Items List */}
      <div className="space-y-4">
        {itemsToDisplay.length > 0 ? itemsToDisplay.map((item: EstimateItem) => {
          const bidProcess = getEstimateItemsBidProcess(item.id);
          const itemBidResponses = getBidResponsesForItem(item.id);
          const availableSubs = getSubcontractorsByTrade(item.trade);

          return (
            <Card 
              key={item.id} 
              className="cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => handleEditItem(item)}
            >
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-theme-primary" />
                      {item.title || item.trade}
                    </CardTitle>
                    <p className="text-gray-600 mt-1">{item.description}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-green-600">
                      ${item.estimatedCost.toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-500 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {item.duration} days
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <Badge className={`${getStatusBadgeColor(item.status)} text-white`}>
                      {item.status}
                    </Badge>
                    {bidProcess && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Users className="h-4 w-4" />
                        {itemBidResponses.length} bids
                      </div>
                    )}
                    <div className="text-sm text-gray-500">
                      {availableSubs.length} available subs
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Edit className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-500">Click to edit</span>
                  </div>
                </div>

                {/* Show bid responses if any */}
                {itemBidResponses.length > 0 && (
                  <div className="mt-4 pt-3 border-t">
                    <div className="text-sm font-medium mb-2">Recent Bids:</div>
                    <div className="space-y-2">
                      {itemBidResponses.slice(0, 2).map((bid: BidResponse) => (
                        <div key={bid.id} className="flex justify-between text-sm">
                          <span>{bid.contact?.company || 'Unknown'}</span>
                          <span className="font-medium text-green-600">
                            ${bid.bidAmount.toLocaleString()}
                          </span>
                        </div>
                      ))}
                      {itemBidResponses.length > 2 && (
                        <div className="text-xs text-gray-500">
                          +{itemBidResponses.length - 2} more bids
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        }) : (
          <Card className="bg-gray-50">
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

      {/* Edit Item Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Bid Item</DialogTitle>
            <DialogDescription>
              {editingItem && `Managing: ${editingItem.trade} - ${editingItem.description}`}
            </DialogDescription>
          </DialogHeader>
          
          {editingItem && (
            <div className="space-y-4">
              {/* Item details */}
              <div className="bg-gray-50 p-4 rounded">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Trade</Label>
                    <p className="text-lg font-semibold">{editingItem.trade}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Status</Label>
                    <Badge className={`${getStatusBadgeColor(editingItem.status)} text-white ml-2`}>
                      {editingItem.status}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Estimated Cost</Label>
                    <p className="text-lg font-semibold text-green-600">
                      ${editingItem.estimatedCost.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Duration</Label>
                    <p className="text-lg">{editingItem.duration} days</p>
                  </div>
                </div>
                <div className="mt-3">
                  <Label className="text-sm font-medium">Description</Label>
                  <p className="text-gray-600">{editingItem.description}</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                {editingItem.status === 'Estimating' && (
                  <Button 
                    onClick={() => {
                      handleInviteBids(editingItem);
                      setEditDialogOpen(false);
                    }}
                    className="bg-theme-primary hover:bg-theme-primary-hover"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Invite Bids
                  </Button>
                )}
                
                {getEstimateItemsBidProcess(editingItem.id) && (
                  <Button 
                    variant="destructive"
                    onClick={handleDeleteBid}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Bid Process
                  </Button>
                )}
              </div>

              {/* Show bid responses if any */}
              {(() => {
                const responses = getBidResponsesForItem(editingItem.id);
                return responses.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Bid Responses ({responses.length})</h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {responses.map((bid: BidResponse) => (
                        <div key={bid.id} className="p-3 bg-white border rounded">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-medium">{bid.contact?.company || 'Unknown Company'}</div>
                              <div className="text-sm text-gray-600">{bid.contact?.name}</div>
                              {bid.notes && (
                                <div className="text-sm text-gray-600 mt-1">{bid.notes}</div>
                              )}
                            </div>
                            <div className="text-right">
                              <div className="font-medium text-green-600 text-lg">
                                ${bid.bidAmount.toLocaleString()}
                              </div>
                              <div className="text-sm text-gray-600">{bid.timeline} days</div>
                              {bid.status === 'selected' && (
                                <Badge className="bg-green-500 text-white mt-1">
                                  <Award className="h-3 w-3 mr-1" />
                                  Selected
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                    ${selectedItemForBid.estimatedCost.toLocaleString()} ({selectedItemForBid.duration} days)
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
                        {getSubcontractorsByTrade(selectedItemForBid?.trade || '').map((sub: Contact) => (
                          <label key={sub.id} className="flex items-center space-x-2 cursor-pointer">
                            <Checkbox 
                              checked={field.value.includes(sub.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  field.onChange([...field.value, sub.id]);
                                } else {
                                  field.onChange(field.value.filter((id: number) => id !== sub.id));
                                }
                              }}
                            />
                            <div className="flex-1">
                              <div className="font-medium">{sub.company}</div>
                              <div className="text-sm text-gray-600">{sub.name} • {sub.trade}</div>
                            </div>
                          </label>
                        ))}
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
                        placeholder="Add any specific instructions or requirements..."
                        className="min-h-20"
                        {...field}
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
                    <FormLabel>Bid Due Date (Optional)</FormLabel>
                    <FormControl>
                      <Input 
                        type="date"
                        min={new Date().toISOString().split('T')[0]}
                        {...field}
                      />
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
                  className="bg-theme-primary hover:bg-theme-primary-hover"
                >
                  {bidInvitationMutation.isPending ? 'Sending...' : 'Send Invitations'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bid Process</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this bid process? This will:
              <br />• Remove all bid invitations
              <br />• Reset the item status to "Estimating" 
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
    </div>
  );
}
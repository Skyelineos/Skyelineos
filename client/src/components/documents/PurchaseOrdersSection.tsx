import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SubcontractorComboBox } from '@/components/ui/subcontractor-combobox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import {
  FileText,
  Upload,
  Download,
  Send,
  CheckCircle,
  XCircle,
  Clock,
  Plus,
  Filter,
  Search,
  Eye,
  Edit,
  Trash2,
  FilePlus,
  FileCheck,
  DollarSign,
  Calendar,
  User,
  Phone,
  Mail,
  X,
  Paperclip,
  MoreVertical,
  Signature,
  History,
  Building,
  Users
} from 'lucide-react';

interface PurchaseOrdersSectionProps {
  projectId: string;
}

export default function PurchaseOrdersSection({ projectId }: PurchaseOrdersSectionProps) {
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tradeFilter, setTradeFilter] = useState('all');
  
  // Dialog states
  const [createFromEstimateOpen, setCreateFromEstimateOpen] = useState(false);
  const [signPOOpen, setSignPOOpen] = useState(false);
  const [statusHistoryOpen, setStatusHistoryOpen] = useState(false);
  const [cancelPOOpen, setCancelPOOpen] = useState(false);
  
  // Form states
  const [selectedEstimateItem, setSelectedEstimateItem] = useState<any>(null);
  const [selectedPO, setSelectedPO] = useState<any>(null);
  const [selectedSubcontractor, setSelectedSubcontractor] = useState<any>(null);
  const [poStartDate, setPOStartDate] = useState('');
  const [poAmount, setPOAmount] = useState('');
  const [poDescription, setPODescription] = useState('');
  const [signatureText, setSignatureText] = useState('');
  const [cancellationReason, setCancellationReason] = useState('');
  const [isDrawingSignature, setIsDrawingSignature] = useState(false);

  // Fetch purchase orders
  const { data: purchaseOrders = [], isLoading: posLoading } = useQuery({
    queryKey: ['/api/purchase-orders/project', projectId],
    queryFn: () => fetch(`/api/purchase-orders/project/${projectId}`).then(res => res.json()),
  });

  // Fetch approved estimate items
  const { data: approvedEstimateItems = [], isLoading: estimateItemsLoading } = useQuery({
    queryKey: ['/api/estimates/approved', projectId],
    queryFn: () => fetch(`/api/estimates/approved/${projectId}`).then(res => res.json()),
  });

  // Fetch contacts/subcontractors
  const { data: contacts = [] } = useQuery({
    queryKey: ['/api/contacts'],
  });

  const subcontractors = contacts.filter((contact: any) => contact.type === 'subcontractor');

  // Create PO from estimate mutation
  const createPOFromEstimateMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest(`/api/purchase-orders/from-estimate`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/purchase-orders/project', projectId] });
      setCreateFromEstimateOpen(false);
      toast({
        title: 'Success',
        description: 'Purchase Order created successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to create PO: ${error.message}`,
        variant: 'destructive',
      });
    },
  });

  // Send PO mutation
  const sendPOMutation = useMutation({
    mutationFn: async (poId: number) => {
      return apiRequest(`/api/purchase-orders/${poId}/send`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/purchase-orders/project', projectId] });
      toast({
        title: 'Success',
        description: 'Purchase Order sent to subcontractor',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to send PO: ${error.message}`,
        variant: 'destructive',
      });
    },
  });

  // Sign PO mutation
  const signPOMutation = useMutation({
    mutationFn: async (data: { poId: number; contactId: number; signature: string }) => {
      return apiRequest(`/api/purchase-orders/${data.poId}/sign`, {
        method: 'POST',
        body: JSON.stringify({
          contactId: data.contactId,
          signature: data.signature,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/purchase-orders/project', projectId] });
      setSignPOOpen(false);
      toast({
        title: 'Success',
        description: 'Purchase Order signed successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to sign PO: ${error.message}`,
        variant: 'destructive',
      });
    },
  });

  // Cancel PO mutation
  const cancelPOMutation = useMutation({
    mutationFn: async (data: { poId: number; reason: string }) => {
      return apiRequest(`/api/purchase-orders/${data.poId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: data.reason }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/purchase-orders/project', projectId] });
      setCancelPOOpen(false);
      toast({
        title: 'Success',
        description: 'Purchase Order cancelled',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to cancel PO: ${error.message}`,
        variant: 'destructive',
      });
    },
  });

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: { variant: 'secondary', label: 'Draft' },
      sent: { variant: 'default', label: 'Sent' },
      signed: { variant: 'success', label: 'Signed' },
      completed: { variant: 'success', label: 'Completed' },
      cancelled: { variant: 'destructive', label: 'Cancelled' },
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;
    return (
      <Badge variant={config.variant as any}>
        {config.label}
      </Badge>
    );
  };

  const handleCreatePOFromEstimate = () => {
    if (!selectedEstimateItem || !selectedSubcontractor) {
      toast({
        title: 'Error',
        description: 'Please select an estimate item and subcontractor',
        variant: 'destructive',
      });
      return;
    }

    createPOFromEstimateMutation.mutate({
      projectId: parseInt(projectId),
      estimateItemId: selectedEstimateItem.id,
      contactId: selectedSubcontractor.id,
      startDate: poStartDate,
      amount: parseFloat(poAmount) || selectedEstimateItem.estimatedCost,
      description: poDescription || selectedEstimateItem.description,
      createdBy: user?.id || 1,
    });
  };

  const handleSignPO = () => {
    if (!selectedPO || !signatureText) {
      toast({
        title: 'Error',
        description: 'Please provide a signature',
        variant: 'destructive',
      });
      return;
    }

    signPOMutation.mutate({
      poId: selectedPO.id,
      contactId: user?.id || 1,
      signature: signatureText,
    });
  };

  const handleCancelPO = () => {
    if (!selectedPO || !cancellationReason) {
      toast({
        title: 'Error',
        description: 'Please provide a cancellation reason',
        variant: 'destructive',
      });
      return;
    }

    cancelPOMutation.mutate({
      poId: selectedPO.id,
      reason: cancellationReason,
    });
  };

  const getStatusHistory = (po: any) => {
    try {
      return JSON.parse(po.statusHistory || '[]');
    } catch {
      return [];
    }
  };

  const filteredPOs = purchaseOrders.filter((po: any) => {
    const matchesSearch = po.trade?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         po.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         po.poNumber?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || po.status === statusFilter;
    const matchesTrade = tradeFilter === 'all' || po.trade === tradeFilter;
    return matchesSearch && matchesStatus && matchesTrade;
  });

  const uniqueTrades = [...new Set(purchaseOrders.map((po: any) => po.trade))];

  const canCreatePO = hasRole(['admin', 'project_manager']);
  const canSendPO = hasRole(['admin', 'project_manager']);
  const canSignPO = hasRole(['subcontractor']) || hasRole(['admin', 'project_manager']);
  const canCancelPO = hasRole(['admin', 'project_manager']);

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Purchase Orders</h3>
          <p className="text-sm text-muted-foreground">
            Manage purchase orders for approved work
          </p>
        </div>
        {canCreatePO && (
          <Button
            onClick={() => setCreateFromEstimateOpen(true)}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Create PO from Estimate
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div className="flex-1 relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search POs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="signed">Signed</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tradeFilter} onValueChange={setTradeFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Filter by trade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Trades</SelectItem>
            {uniqueTrades.map((trade: string) => (
              <SelectItem key={trade} value={trade}>
                {trade}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Purchase Orders List */}
      <div className="space-y-4">
        {posLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="text-muted-foreground mt-2">Loading purchase orders...</p>
          </div>
        ) : filteredPOs.length === 0 ? (
          <Card className="bg-gray-50">
            <CardContent className="text-center py-8">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No purchase orders found</p>
              {canCreatePO && (
                <Button
                  onClick={() => setCreateFromEstimateOpen(true)}
                  className="mt-4"
                  variant="outline"
                >
                  Create Your First PO
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          filteredPOs.map((po: any) => (
            <Card key={po.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="font-semibold">{po.poNumber}</h4>
                      {getStatusBadge(po.status)}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Trade</p>
                        <p className="font-medium">{po.trade}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Subcontractor</p>
                        <p className="font-medium">{po.contractorName || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Amount</p>
                        <p className="font-medium">${po.amount?.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Start Date</p>
                        <p className="font-medium">
                          {po.startDate ? new Date(po.startDate).toLocaleDateString() : 'TBD'}
                        </p>
                      </div>
                    </div>
                    {po.description && (
                      <p className="text-sm text-muted-foreground mt-2">{po.description}</p>
                    )}
                  </div>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => window.open(`/uploads/${po.id}`, '_blank')}>
                        <Eye className="h-4 w-4 mr-2" />
                        View PO
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => {
                        setSelectedPO(po);
                        setStatusHistoryOpen(true);
                      }}>
                        <History className="h-4 w-4 mr-2" />
                        Status History
                      </DropdownMenuItem>
                      
                      {canSendPO && po.status === 'draft' && (
                        <DropdownMenuItem onClick={() => sendPOMutation.mutate(po.id)}>
                          <Send className="h-4 w-4 mr-2" />
                          Send to Sub
                        </DropdownMenuItem>
                      )}
                      
                      {canSignPO && po.status === 'sent' && (
                        <DropdownMenuItem onClick={() => {
                          setSelectedPO(po);
                          setSignPOOpen(true);
                        }}>
                          <Signature className="h-4 w-4 mr-2" />
                          Sign PO
                        </DropdownMenuItem>
                      )}
                      
                      {canCancelPO && ['draft', 'sent'].includes(po.status) && (
                        <DropdownMenuItem onClick={() => {
                          setSelectedPO(po);
                          setCancelPOOpen(true);
                        }}>
                          <XCircle className="h-4 w-4 mr-2" />
                          Cancel PO
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Create PO from Estimate Dialog */}
      <Dialog open={createFromEstimateOpen} onOpenChange={setCreateFromEstimateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Purchase Order from Estimate</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Debug Info */}
            <div className="bg-gray-50 p-3 rounded text-sm">
              <p><strong>Debug Info:</strong></p>
              <p>Approved estimate items: {approvedEstimateItems.length}</p>
              <p>Subcontractors: {subcontractors.length}</p>
              <p>Loading estimate items: {estimateItemsLoading.toString()}</p>
              {approvedEstimateItems.length > 0 && (
                <p>First item: {JSON.stringify(approvedEstimateItems[0])}</p>
              )}
            </div>
            
            <div>
              <Label>Select Approved Estimate Item</Label>
              <Select
                value={selectedEstimateItem?.id?.toString()}
                onValueChange={(value) => {
                  const item = approvedEstimateItems.find(i => i.id.toString() === value);
                  setSelectedEstimateItem(item);
                  setPOAmount(item?.estimatedCost?.toString() || '');
                  setPODescription(item?.description || '');
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose estimate item" />
                </SelectTrigger>
                <SelectContent>
                  {approvedEstimateItems.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">
                      No approved estimate items available
                    </div>
                  ) : (
                    approvedEstimateItems.map((item: any) => (
                      <SelectItem key={item.id} value={item.id.toString()}>
                        {item.title || item.trade} - ${item.estimatedCost?.toLocaleString()} - {item.description}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Select Subcontractor</Label>
              <SubcontractorComboBox
                subcontractors={subcontractors.filter((sub: any) => selectedEstimateItem ? sub.trade === selectedEstimateItem.trade : true)}
                value={selectedSubcontractor?.id?.toString()}
                onValueChange={(value) => {
                  const sub = subcontractors.find(s => s.id.toString() === value);
                  setSelectedSubcontractor(sub);
                }}
                placeholder="Choose subcontractor"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={poStartDate}
                  onChange={(e) => setPOStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label>Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={poAmount}
                  onChange={(e) => setPOAmount(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label>Description</Label>
              <Textarea
                value={poDescription}
                onChange={(e) => setPODescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setCreateFromEstimateOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreatePOFromEstimate}
                disabled={createPOFromEstimateMutation.isPending}
              >
                {createPOFromEstimateMutation.isPending ? 'Creating...' : 'Create PO'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sign PO Dialog */}
      <Dialog open={signPOOpen} onOpenChange={setSignPOOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign Purchase Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedPO && (
              <div className="bg-muted p-4 rounded-lg">
                <h4 className="font-semibold mb-2">{selectedPO.poNumber}</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Trade</p>
                    <p>{selectedPO.trade}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Amount</p>
                    <p>${selectedPO.amount?.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            )}
            
            <div>
              <Label>Electronic Signature</Label>
              <Input
                placeholder="Type your full name to sign"
                value={signatureText}
                onChange={(e) => setSignatureText(e.target.value)}
              />
              <p className="text-sm text-muted-foreground mt-1">
                By typing your name, you agree to the terms of this purchase order
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setSignPOOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSignPO}
                disabled={signPOMutation.isPending || !signatureText}
              >
                {signPOMutation.isPending ? 'Signing...' : 'Sign PO'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Status History Dialog */}
      <Dialog open={statusHistoryOpen} onOpenChange={setStatusHistoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Status History</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedPO && (
              <div className="space-y-3">
                {getStatusHistory(selectedPO).map((entry: any, index: number) => (
                  <div key={index} className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{entry.status}</Badge>
                        <span className="text-sm text-muted-foreground">
                          {new Date(entry.date).toLocaleString()}
                        </span>
                      </div>
                      {entry.note && (
                        <p className="text-sm text-muted-foreground mt-1">{entry.note}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel PO Dialog */}
      <Dialog open={cancelPOOpen} onOpenChange={setCancelPOOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Purchase Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedPO && (
              <div className="bg-muted p-4 rounded-lg">
                <h4 className="font-semibold mb-2">{selectedPO.poNumber}</h4>
                <p className="text-sm text-muted-foreground">{selectedPO.trade}</p>
              </div>
            )}
            
            <div>
              <Label>Cancellation Reason</Label>
              <Textarea
                placeholder="Please provide a reason for cancellation..."
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setCancelPOOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCancelPO}
                disabled={cancelPOMutation.isPending || !cancellationReason}
                variant="destructive"
              >
                {cancelPOMutation.isPending ? 'Cancelling...' : 'Cancel PO'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
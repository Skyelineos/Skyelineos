import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SubcontractorComboBox } from '@/components/ui/subcontractor-combobox';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Download, Eye, FileText, Plus, Send, CheckCircle2, Clock, AlertCircle, FileIcon } from 'lucide-react';
import { POPDFService } from '@/components/pdf/POPDFService';
import type { POData } from '@/components/pdf/POPDFService';
import { apiRequest } from '@/lib/queryClient';

interface PurchaseOrder {
  id: string;
  poId: string;
  projectId: string;
  subcontractorId: string;
  subcontractor: {
    company: string;
    contact: string;
    email: string;
    phone: string;
    trade: string;
  };
  description: string;
  amount: number;
  durationDays: number;
  status: 'draft' | 'sent' | 'signed' | 'completed';
  createdAt: string;
  sentAt?: string;
  signedAt?: string;
  signedBy?: string;
  attachments: string[];
  pdfUrl?: string;
}

interface EstimateItem {
  id: string;
  trade: string;
  description: string;
  vendor: string;
  cost: number;
  duration: number;
  status: 'approved' | 'waiting_approval';
  vendorId?: string;
}

interface Subcontractor {
  id: string;
  company: string;
  name: string;
  email: string;
  phone: string;
  trade: string;
}

interface Project {
  id: string;
  name: string;
  address: string;
  startDate?: string;
}

interface PurchaseOrdersSectionProps {
  projectId: string;
}

export const PurchaseOrdersSection: React.FC<PurchaseOrdersSectionProps> = ({ projectId }) => {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedEstimateItem, setSelectedEstimateItem] = useState<EstimateItem | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch project data
  const { data: project } = useQuery<Project>({
    queryKey: [`/api/projects/${projectId}`],
  });

  // Fetch purchase orders for this project
  const { data: purchaseOrders = [], isLoading: isLoadingPOs } = useQuery<PurchaseOrder[]>({
    queryKey: [`/api/purchase-orders/project/${projectId}`],
  });

  // Fetch approved estimate items
  const { data: estimateItems = [], isLoading: isLoadingEstimates } = useQuery<EstimateItem[]>({
    queryKey: [`/api/estimates`, { projectId }],
    select: (data: any[]) => {
      // Extract approved estimate items from all estimates
      const approvedItems: EstimateItem[] = [];
      data.forEach((estimate: any) => {
        if (estimate.categories) {
          estimate.categories.forEach((category: any) => {
            if (category.items) {
              category.items.forEach((item: any) => {
                if (item.status === 'approved') {
                  approvedItems.push({
                    id: item.id,
                    trade: item.trade,
                    description: item.description,
                    vendor: item.vendor || 'No vendor assigned',
                    cost: item.cost,
                    duration: item.duration,
                    status: item.status,
                    vendorId: item.vendorId
                  });
                }
              });
            }
          });
        }
      });
      return approvedItems;
    }
  });

  // Fetch subcontractors
  const { data: subcontractors = [] } = useQuery<Subcontractor[]>({
    queryKey: ['/api/contacts'],
    select: (data: any[]) => data.filter((contact: any) => contact.type === 'subcontractor')
  });

  // Create PO mutation
  const createPOMutation = useMutation({
    mutationFn: async (poData: any) => {
      return await apiRequest('/api/purchase-orders', 'POST', poData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/purchase-orders/project/${projectId}`] });
      setIsCreateDialogOpen(false);
      setSelectedEstimateItem(null);
      toast({
        title: "Purchase Order Created",
        description: "The purchase order has been created successfully."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error Creating Purchase Order",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Send PO mutation
  const sendPOMutation = useMutation({
    mutationFn: async (poId: string) => {
      const response = await fetch(`/api/purchase-orders/${poId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) throw new Error('Failed to send purchase order');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/purchase-orders`] });
      toast({
        title: "Purchase Order Sent",
        description: "The purchase order has been sent to the subcontractor."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error Sending Purchase Order",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Draft</Badge>;
      case 'sent':
        return <Badge variant="outline"><Send className="w-3 h-3 mr-1" />Sent</Badge>;
      case 'signed':
        return <Badge variant="default"><CheckCircle2 className="w-3 h-3 mr-1" />Signed</Badge>;
      case 'completed':
        return <Badge variant="default" className="bg-green-100 text-green-800">
          <CheckCircle2 className="w-3 h-3 mr-1" />Completed
        </Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const handleCreatePO = async (formData: any) => {
    if (!project) return;

    const poData = {
      projectId: parseInt(projectId),
      subcontractorId: parseInt(formData.subcontractorId),
      estimateItemId: formData.estimateItemId ? parseInt(formData.estimateItemId) : null,
      description: formData.description,
      amount: parseFloat(formData.amount),
      durationDays: parseInt(formData.durationDays),
      attachments: []
    };

    createPOMutation.mutate(poData);
  };

  const handleDownloadPDF = async (po: PurchaseOrder) => {
    if (!project) return;

    try {
      const pdfData: POData = {
        poId: po.poId,
        projectName: project.name,
        projectAddress: project.address,
        projectStartDate: project.startDate,
        subcontractor: po.subcontractor,
        description: po.description,
        amount: po.amount,
        durationDays: po.durationDays,
        attachments: po.attachments || [],
        createdAt: po.createdAt,
        projectId: projectId
      };

      await POPDFService.downloadPDF(pdfData);
      
      toast({
        title: "PDF Downloaded",
        description: `Purchase order ${po.poId} has been downloaded.`
      });
    } catch (error) {
      toast({
        title: "Error Downloading PDF",
        description: "Failed to generate and download the PDF.",
        variant: "destructive"
      });
    }
  };

  const handlePreviewPDF = async (po: PurchaseOrder) => {
    if (!project) return;

    try {
      const pdfData: POData = {
        poId: po.poId,
        projectName: project.name,
        projectAddress: project.address,
        projectStartDate: project.startDate,
        subcontractor: po.subcontractor,
        description: po.description,
        amount: po.amount,
        durationDays: po.durationDays,
        attachments: po.attachments || [],
        createdAt: po.createdAt,
        projectId: projectId
      };

      const previewUrl = await POPDFService.generatePDFPreview(pdfData);
      window.open(previewUrl, '_blank');
    } catch (error) {
      toast({
        title: "Error Previewing PDF",
        description: "Failed to generate PDF preview.",
        variant: "destructive"
      });
    }
  };

  const handleSendPO = (poId: string) => {
    sendPOMutation.mutate(poId);
  };

  const availableEstimateItems = useMemo(() => {
    const existingPOItemIds = purchaseOrders
      .filter(po => po.status !== 'completed')
      .map(po => po.subcontractor?.trade)
      .filter(Boolean);

    return estimateItems.filter(item => 
      !existingPOItemIds.includes(item.trade)
    );
  }, [estimateItems, purchaseOrders]);

  if (isLoadingPOs || isLoadingEstimates) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Purchase Orders</h3>
          <p className="text-sm text-muted-foreground">
            Manage purchase orders for approved estimates
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create PO
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Purchase Order</DialogTitle>
              <DialogDescription>
                Create a new purchase order from approved estimate items or manually.
              </DialogDescription>
            </DialogHeader>
            <CreatePOForm
              estimateItems={availableEstimateItems}
              subcontractors={subcontractors}
              onSubmit={handleCreatePO}
              onCancel={() => setIsCreateDialogOpen(false)}
              isSubmitting={createPOMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      {purchaseOrders.length === 0 ? (
        <Card className="bg-gray-50">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Purchase Orders</h3>
            <p className="text-muted-foreground text-center mb-4">
              Create your first purchase order from approved estimate items.
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Purchase Order
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {purchaseOrders.map((po) => (
            <Card key={po.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{po.poId}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {po.subcontractor.company} • {po.subcontractor.trade}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(po.status)}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="font-medium">Amount</p>
                      <p className="text-muted-foreground">
                        ${po.amount.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium">Duration</p>
                      <p className="text-muted-foreground">{po.durationDays} days</p>
                    </div>
                    <div>
                      <p className="font-medium">Contact</p>
                      <p className="text-muted-foreground">{po.subcontractor.contact}</p>
                    </div>
                    <div>
                      <p className="font-medium">Created</p>
                      <p className="text-muted-foreground">
                        {new Date(po.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="font-medium mb-1">Description</p>
                    <p className="text-sm text-muted-foreground">{po.description}</p>
                  </div>

                  <div className="flex gap-2 pt-4 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePreviewPDF(po)}
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      Preview
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadPDF(po)}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </Button>
                    {po.status === 'draft' && (
                      <Button
                        size="sm"
                        onClick={() => handleSendPO(po.id)}
                        disabled={sendPOMutation.isPending}
                      >
                        <Send className="w-4 h-4 mr-2" />
                        Send to Subcontractor
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

interface CreatePOFormProps {
  estimateItems: EstimateItem[];
  subcontractors: Subcontractor[];
  onSubmit: (data: any) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

const CreatePOForm: React.FC<CreatePOFormProps> = ({
  estimateItems,
  subcontractors,
  onSubmit,
  onCancel,
  isSubmitting
}) => {
  const [formData, setFormData] = useState({
    estimateItemId: '',
    subcontractorId: '',
    description: '',
    amount: '',
    durationDays: ''
  });

  const handleEstimateItemChange = (itemId: string) => {
    const item = estimateItems.find(i => i.id === itemId);
    if (item) {
      setFormData(prev => ({
        ...prev,
        estimateItemId: itemId,
        description: item.description,
        amount: item.cost.toString(),
        durationDays: item.duration.toString(),
        subcontractorId: item.vendorId || ''
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const filteredSubcontractors = formData.estimateItemId 
    ? (() => {
        const item = estimateItems.find(i => i.id === formData.estimateItemId);
        return item ? subcontractors.filter(s => s.trade.toLowerCase() === item.trade.toLowerCase()) : subcontractors;
      })()
    : subcontractors;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="estimateItem">From Estimate Item (Optional)</Label>
          <Select onValueChange={handleEstimateItemChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select an approved estimate item" />
            </SelectTrigger>
            <SelectContent>
              {estimateItems.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.trade} - ${item.cost.toLocaleString()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="subcontractor">Subcontractor *</Label>
          <SubcontractorComboBox
            subcontractors={filteredSubcontractors}
            value={formData.subcontractorId}
            onValueChange={(value) => setFormData(prev => ({ ...prev, subcontractorId: value }))}
            placeholder="Select subcontractor"
            showTrade={true}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="description">Description *</Label>
        <Textarea
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          placeholder="Describe the work to be performed..."
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="amount">Amount *</Label>
          <Input
            type="number"
            step="0.01"
            value={formData.amount}
            onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
            placeholder="0.00"
            required
          />
        </div>

        <div>
          <Label htmlFor="duration">Duration (Days) *</Label>
          <Input
            type="number"
            value={formData.durationDays}
            onChange={(e) => setFormData(prev => ({ ...prev, durationDays: e.target.value }))}
            placeholder="30"
            required
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating...' : 'Create Purchase Order'}
        </Button>
      </div>
    </form>
  );
};

export default PurchaseOrdersSection;
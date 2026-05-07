import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEstimates } from '@/hooks/useEstimates';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EstimateItemDetailView } from './EstimateItemDetailView';
import { EstimateForm } from './EstimateForm';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { EstimatePDFGenerator, convertEstimateDataForPDF } from './PDFGenerator';
import { PDFPreview } from './PDFPreview';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  ChevronDown,
  ChevronRight,
  Send,
  FileText,
  DollarSign,
  Clock,
  User,
  Building2,
  Plus,
  Trash2,
  X,
  Download,
  MoreHorizontal,
  Eye,
  Link,
  CheckCircle,
  Edit
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import * as Collapsible from '@radix-ui/react-collapsible';

interface EstimateDetailViewProps {
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
  markup: number;
  contingency: number;
  status: 'Estimating' | 'Bidding' | 'Job Awarded' | 'Waiting Approval' | 'Approved' | 'Rejected';
}

interface EstimateCategory {
  name?: string;
  categoryName?: string;
  items: EstimateItem[];
}

interface EstimateData {
  id: string;
  name: string;
  description: string;
  categories: EstimateCategory[];
  totalCost: number;
  status: string;
}

export function EstimateDetailView({ projectId, userRole = 'admin' }: EstimateDetailViewProps) {
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});
  const [isEditEstimateDialogOpen, setIsEditEstimateDialogOpen] = useState(false);
  const [editingEstimate, setEditingEstimate] = useState<any>(null);
  const [deleteEstimateDialog, setDeleteEstimateDialog] = useState<{ open: boolean; estimateId: string | null }>({ open: false, estimateId: null });

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewEstimate, setPreviewEstimate] = useState<any>(null);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [itemDetailOpen, setItemDetailOpen] = useState(false);
  const [isEditItemDialogOpen, setIsEditItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editingItemEstimateId, setEditingItemEstimateId] = useState<string | null>(null);
  const [statusUpdateDialog, setStatusUpdateDialog] = useState<{ open: boolean; estimate: any | null }>({ open: false, estimate: null });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Use unified estimates hook with no caching
  const { estimates: allEstimates, isLoading, getProjectEstimates, forceRefresh } = useEstimates();
  
  // Filter estimates by project
  const estimates = getProjectEstimates(projectId);

  const canEdit = userRole === 'admin' || userRole === 'projectManager';
  
  // Component lifecycle tracked

  // Status workflow progression function
  const getNextStatus = (currentStatus: string): string => {
    const statusFlow = ['Estimating', 'Bidding', 'Job Awarded', 'Waiting Approval', 'Approved'];
    const currentIndex = statusFlow.indexOf(currentStatus);
    if (currentIndex >= 0 && currentIndex < statusFlow.length - 1) {
      return statusFlow[currentIndex + 1];
    }
    return currentStatus; // No next status available
  };

  // Handle clicking on estimate items for detailed view
  const handleItemClick = (item: any) => {
    setSelectedItem(item);
    setItemDetailOpen(true);
  };

  // Handle edit individual item
  const handleEditItem = (item: any, estimateId: string) => {
    setEditingItem({ ...item });
    setEditingItemEstimateId(estimateId);
    setIsEditItemDialogOpen(true);
  };

  // Handle edit estimate
  const handleEditEstimate = (estimate: any) => {
    setEditingEstimate(estimate);
    setIsEditEstimateDialogOpen(true);
  };

  const handleStatusClick = (estimateId: string, itemId: string, currentStatus: string) => {
    if (!canEdit) return;
    
    const nextStatus = getNextStatus(currentStatus);
    if (nextStatus !== currentStatus) {
      updateItemStatusMutation.mutate({ estimateId, itemId, newStatus: nextStatus });
    }
  };

  // Manual estimate status update mutation
  const updateEstimateStatusMutation = useMutation({
    mutationFn: async ({ estimateId, status }: { estimateId: string; status: string }) => {
      // If status is "Sent to Client", use the send-to-client endpoint
      if (status === 'Sent to Client') {
        return await apiRequest(`/api/estimates/${estimateId}/send-to-client`, 'POST', {});
      }
      // Otherwise use the regular status update endpoint
      return await apiRequest(`/api/estimates/${estimateId}/status`, 'PATCH', { status });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Success",
        description: data.message || "Estimate status updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/estimates'] });
      setStatusUpdateDialog({ open: false, estimate: null });
      forceRefresh();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update estimate status",
        variant: "destructive",
      });
    },
  });

  // Delete estimate mutation
  const deleteEstimateMutation = useMutation({
    mutationFn: async (estimateId: string) => {
      await apiRequest(`/api/estimates/${estimateId}`, 'DELETE');
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Estimate deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/estimates'] });
      setDeleteEstimateDialog({ open: false, estimateId: null });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete estimate",
        variant: "destructive",
      });
    },
  });

  // Update individual item status mutation
  const updateItemStatusMutation = useMutation({
    mutationFn: async ({ estimateId, itemId, newStatus }: { estimateId: string; itemId: string; newStatus: string }) => {
      return await apiRequest(`/api/estimate-items/${estimateId}/${itemId}/status`, 'PATCH', { status: newStatus });
    },
    onSuccess: () => {
      toast({
        title: "Status Updated",
        description: "Item status has been updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/estimates'] });
      forceRefresh();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update item status",
        variant: "destructive",
      });
    },
  });

  // Mutation for sending estimate to client
  const sendToClientMutation = useMutation({
    mutationFn: async (estimateId: string) => {
      return apiRequest(`/api/estimates/${estimateId}/send-to-client`, 'POST', {});
    },
    onSuccess: (data: any) => {
      toast({
        title: "Estimate Sent",
        description: data.message || "The estimate has been successfully sent to the client for approval.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/estimates'] });
      forceRefresh();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send estimate to client",
        variant: "destructive",
      });
    },
  });

  const toggleCategory = (categoryName: string) => {
    setOpenCategories(prev => ({
      ...prev,
      [categoryName]: !prev[categoryName]
    }));
  };

  const parseEstimateData = (estimate: any): EstimateData => {
    try {
      // Use the categories and items from the normalized database structure
      const categories = estimate.categories || [];
      
      // Calculate the actual total from categories and items
      const calculatedTotal = categories.reduce((total: number, category: any) => 
        total + category.items.reduce((catTotal: number, item: any) => 
          catTotal + calculateItemTotal(item), 0), 0);
      
      return {
        id: estimate.id,
        name: estimate.name || 'Untitled Estimate',
        description: estimate.description || '',
        categories: categories.map((cat: any) => ({
          ...cat,
          name: cat.name || cat.categoryName || 'Unknown Category',
          categoryName: cat.categoryName || cat.name || 'Unknown Category'
        })),
        totalCost: calculatedTotal, // Use calculated total instead of database value
        status: estimate.status || 'pending'
      };
    } catch (e) {
      
      return {
        id: estimate.id,
        name: estimate.name || 'Unknown',
        description: estimate.description || '',
        categories: [],
        totalCost: 0,
        status: estimate.status || 'pending'
      };
    }
  };

  const calculateItemTotal = (item: EstimateItem) => {
    const baseCost = parseFloat(item.estimatedCost.toString()) || 0;
    const markupAmount = baseCost * ((parseFloat(item.markup.toString()) || 0) / 100);
    const contingencyAmount = (baseCost + markupAmount) * ((parseFloat(item.contingency.toString()) || 0) / 100);
    return baseCost + markupAmount + contingencyAmount;
  };

  const calculateCategoryTotal = (category: EstimateCategory) => {
    return category.items.reduce((total, item) => total + calculateItemTotal(item), 0);
  };

  // Calculate category breakdown totals
  const calculateCategoryBreakdown = (category: EstimateCategory) => {
    const baseCost = category.items.reduce((total, item) => {
      return total + (parseFloat(item.estimatedCost.toString()) || 0);
    }, 0);
    
    const markupTotal = category.items.reduce((total, item) => {
      const base = parseFloat(item.estimatedCost.toString()) || 0;
      const markup = base * ((parseFloat(item.markup.toString()) || 0) / 100);
      return total + markup;
    }, 0);
    
    const contingencyTotal = category.items.reduce((total, item) => {
      const base = parseFloat(item.estimatedCost.toString()) || 0;
      const markup = base * ((parseFloat(item.markup.toString()) || 0) / 100);
      const contingency = (base + markup) * ((parseFloat(item.contingency.toString()) || 0) / 100);
      return total + contingency;
    }, 0);
    
    return { baseCost, markupTotal, contingencyTotal };
  };

  // Calculate total markup amount for an estimate
  const calculateEstimateMarkupTotal = (estimate: EstimateData) => {
    return estimate.categories.reduce((total, category) => {
      return total + category.items.reduce((catTotal, item) => {
        const baseCost = parseFloat(item.estimatedCost.toString()) || 0;
        const markupAmount = baseCost * ((parseFloat(item.markup.toString()) || 0) / 100);
        return catTotal + markupAmount;
      }, 0);
    }, 0);
  };

  // Calculate total contingency amount for an estimate
  const calculateEstimateContingencyTotal = (estimate: EstimateData) => {
    return estimate.categories.reduce((total, category) => {
      return total + category.items.reduce((catTotal, item) => {
        const baseCost = parseFloat(item.estimatedCost.toString()) || 0;
        const markupAmount = baseCost * ((parseFloat(item.markup.toString()) || 0) / 100);
        const contingencyAmount = (baseCost + markupAmount) * ((parseFloat(item.contingency.toString()) || 0) / 100);
        return catTotal + contingencyAmount;
      }, 0);
    }, 0);
  };

  // Calculate base cost total (without markup and contingency)
  const calculateEstimateBaseCostTotal = (estimate: EstimateData) => {
    return estimate.categories.reduce((total, category) => {
      return total + category.items.reduce((catTotal, item) => {
        const baseCost = parseFloat(item.estimatedCost.toString()) || 0;
        return catTotal + baseCost;
      }, 0);
    }, 0);
  };

  // Check if all estimate items are "Job Awarded"
  const areAllItemsAwarded = (estimate: EstimateData) => {
    const allItems = estimate.categories.flatMap(category => category.items);
    return allItems.length > 0 && allItems.every(item => item.status === 'Job Awarded');
  };

  const openEditEstimateDialog = (estimate: EstimateData) => {
    setEditingEstimate(JSON.parse(JSON.stringify(estimate))); // Deep copy
    setIsEditEstimateDialogOpen(true);
  };

  const addNewCategory = () => {
    if (!editingEstimate) return;
    const newCategory = {
      name: 'New Category',
      items: []
    };
    setEditingEstimate({
      ...editingEstimate,
      categories: [...editingEstimate.categories, newCategory]
    });
  };

  const removeCategory = (categoryIndex: number) => {
    if (!editingEstimate) return;
    const newCategories = editingEstimate.categories.filter((_: any, index: number) => index !== categoryIndex);
    setEditingEstimate({
      ...editingEstimate,
      categories: newCategories
    });
  };

  const addNewItem = (categoryIndex: number) => {
    if (!editingEstimate) return;
    const newItem = {
      id: Date.now().toString(),
      trade: 'New Trade',
      vendor: 'Select Vendor',
      estimatedCost: 0,
      duration: 0,
      description: '',
      markup: 0,
      contingency: 0,
      status: 'Estimating' as const
    };
    const newCategories = [...editingEstimate.categories];
    newCategories[categoryIndex].items.push(newItem);
    setEditingEstimate({
      ...editingEstimate,
      categories: newCategories
    });
  };

  const removeItem = (categoryIndex: number, itemIndex: number) => {
    if (!editingEstimate) return;
    const newCategories = [...editingEstimate.categories];
    newCategories[categoryIndex].items = newCategories[categoryIndex].items.filter((_: any, index: number) => index !== itemIndex);
    setEditingEstimate({
      ...editingEstimate,
      categories: newCategories
    });
  };

  const saveEstimateChanges = async () => {
    if (!editingEstimate) return;
    
    try {
      // Development logging removed
      // Prepare the update data
      const updateData = {
        id: editingEstimate.id,
        name: editingEstimate.name,
        description: editingEstimate.description,
        categories: editingEstimate.categories,
        totalCost: editingEstimate.categories.reduce((total: number, category: any) => 
          total + category.items.reduce((catTotal: number, item: any) => {
            const baseCost = parseFloat(item.estimatedCost) || 0;
            const markupAmount = baseCost * ((parseFloat(item.markup) || 0) / 100);
            const contingencyAmount = (baseCost + markupAmount) * ((parseFloat(item.contingency) || 0) / 100);
            return catTotal + baseCost + markupAmount + contingencyAmount;
          }, 0), 0
        ),
        notes: JSON.stringify(editingEstimate.categories) // Store the updated categories in notes
      };

      // Development logging removed

      // Call the API to update the estimate
      const response = await apiRequest(`/api/estimates/${editingEstimate.id}`, 'PATCH', updateData);

      // Success operation completed

      toast({
        title: "Estimate Updated",
        description: "Estimate has been successfully updated.",
      });
      setIsEditEstimateDialogOpen(false);
      setEditingEstimate(null);
      queryClient.invalidateQueries({ queryKey: ['/api/estimates'] });
    } catch (error) {
      console.error('❌ Failed to save estimate:', error);
      toast({
        title: "Error",
        description: "Failed to update estimate. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Save individual item changes
  const saveItemChanges = async () => {
    if (!editingItem || !editingItemEstimateId) return;

    try {
      // Development logging removed

      // Find the estimate and update the specific item
      const estimate = estimates.find((e: any) => e.id.toString() === editingItemEstimateId);
      if (!estimate) {
        throw new Error('Estimate not found');
      }

      // Create updated categories with the modified item
      const updatedCategories = estimate.categories.map((category: any) => ({
        ...category,
        items: category.items.map((item: any) => 
          item.id === editingItem.id ? editingItem : item
        )
      }));

      // Calculate new total cost
      const totalCost = updatedCategories.reduce((total: number, category: any) => 
        total + category.items.reduce((catTotal: number, item: any) => {
          const baseCost = parseFloat(item.estimatedCost) || 0;
          const markupAmount = baseCost * ((parseFloat(item.markup) || 0) / 100);
          const contingencyAmount = (baseCost + markupAmount) * ((parseFloat(item.contingency) || 0) / 100);
          return catTotal + baseCost + markupAmount + contingencyAmount;
        }, 0), 0
      );

      const updateData = {
        id: parseInt(editingItemEstimateId),
        categories: updatedCategories,
        totalCost,
        notes: JSON.stringify(updatedCategories)
      };

      const response = await apiRequest(`/api/estimates/${editingItemEstimateId}`, 'PATCH', updateData);

      // Success operation completed

      toast({
        title: "Item Updated",
        description: "Estimate item has been successfully updated.",
      });

      setIsEditItemDialogOpen(false);
      setEditingItem(null);
      setEditingItemEstimateId(null);
      queryClient.invalidateQueries({ queryKey: ['/api/estimates'] });
    } catch (error) {
      console.error('❌ Failed to save item:', error);
      toast({
        title: "Error",
        description: "Failed to update estimate item. Please try again.",
        variant: "destructive",
      });
    }
  };

  const generatePDF = async (estimate: EstimateData) => {
    try {
      // Get project data to include project name and client info
      const projectResponse = await fetch(`/api/projects/${projectId}`);
      const project = await projectResponse.json();
      
      const pdfData = convertEstimateDataForPDF(
        estimate, 
        project.name || 'Unknown Project',
        project.clientName || 'Unknown Client'
      );
      
      const pdfGenerator = new EstimatePDFGenerator();
      pdfGenerator.generatePDF(pdfData);
      
      toast({
        title: "PDF Generated",
        description: `Estimate PDF for ${project.name} has been downloaded.`,
      });
    } catch (error) {
      
      toast({
        title: "Error",
        description: "Failed to generate PDF. Please try again.",
        variant: "destructive",
      });
    }
  };



  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-theme-primary"></div>
      </div>
    );
  }

  if (estimates.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No estimates found</h3>
        <p className="text-gray-500">Create an estimate to see detailed breakdowns here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Estimate Details</h3>
      </div>
      {estimates.map((rawEstimate: any) => {
        const estimate = parseEstimateData(rawEstimate);
        
        return (
          <Card key={estimate.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-xl">{estimate.name}</CardTitle>
                  <CardDescription className="mt-1">{estimate.description}</CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={estimate.status === 'Sent to Client' ? 'Waiting for Approval' : (estimate.status || 'Estimating')} />
                  {/* Send to Client button - appears when all items are awarded and status is "Waiting Approval" */}
                  {canEdit && areAllItemsAwarded(estimate) && estimate.status === 'Waiting Approval' && (
                    <Button 
                      onClick={() => sendToClientMutation.mutate(estimate.id)}
                      disabled={sendToClientMutation.isPending}
                      className="bg-green-600 hover:bg-green-700 text-white"
                      size="sm"
                    >
                      <Send className="h-4 w-4 mr-2" />
                      {sendToClientMutation.isPending ? 'Sending...' : 'Send to Client for Approval'}
                    </Button>
                  )}
                  {/* Show success message if estimate was sent */}
                  {estimate.status === 'Sent to Client' && (
                    <div className="flex items-center gap-2 text-green-600 font-medium">
                      <CheckCircle className="h-4 w-4" />
                      Sent to Client
                    </div>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canEdit && (
                        <DropdownMenuItem onClick={() => openEditEstimateDialog(estimate)}>
                          <FileText className="h-4 w-4 mr-2" />
                          Edit Estimate
                        </DropdownMenuItem>
                      )}
                      {canEdit && (
                        <DropdownMenuItem onClick={() => setStatusUpdateDialog({ open: true, estimate })}>
                          <Edit className="h-4 w-4 mr-2" />
                          Update Status
                        </DropdownMenuItem>
                      )}
                      {canEdit && estimate.status !== 'Sent to Client' && estimate.status !== 'Client Approved' && (
                        <DropdownMenuItem onClick={() => sendToClientMutation.mutate(estimate.id)}>
                          <Send className="h-4 w-4 mr-2" />
                          Send to Client
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem 
                        onClick={() => {
                          setPreviewEstimate(estimate);
                          setIsPreviewOpen(true);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Preview PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => generatePDF(estimate)}>
                        <Download className="h-4 w-4 mr-2" />
                        Download PDF
                      </DropdownMenuItem>
                      {canEdit && (
                        <DropdownMenuItem
                          className="text-red-600 hover:text-red-700"
                          onClick={() => setDeleteEstimateDialog({ open: true, estimateId: estimate.id })}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Estimate
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <div className="text-right">
                    <div className="flex items-end gap-4 justify-end">
                      <div>
                        <div className="text-2xl font-bold text-green-600">
                          ${estimate.totalCost.toLocaleString()}
                        </div>
                        <div className="text-sm text-gray-500">Total Cost</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold text-theme-primary">
                          ${calculateEstimateMarkupTotal(estimate).toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-500">Total Markup</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold text-orange-600">
                          ${calculateEstimateContingencyTotal(estimate).toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-500">Total Contingency</div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 mt-2">
                      Base Cost: ${calculateEstimateBaseCostTotal(estimate).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {estimate.categories.length > 0 ? (
                <div className="space-y-4">
                  {estimate.categories.map((category, categoryIndex) => {
                    const isOpen = openCategories[`${estimate.id}-${category.name || category.categoryName}`] ?? true;
                    const categoryTotal = calculateCategoryTotal(category);
                    
                    return (
                      <Collapsible.Root
                        key={categoryIndex}
                        open={isOpen}
                        onOpenChange={() => toggleCategory(`${estimate.id}-${category.name || category.categoryName}`)}
                      >
                        <Card className="border-l-4 border-l-theme-primary">
                          <Collapsible.Trigger asChild>
                            <CardHeader className="cursor-pointer hover:bg-gray-50 transition-colors">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  {isOpen ? (
                                    <ChevronDown className="h-5 w-5 text-gray-500" />
                                  ) : (
                                    <ChevronRight className="h-5 w-5 text-gray-500" />
                                  )}
                                  <CardTitle className="text-lg font-semibold text-theme-primary">
                                    {category.name || category.categoryName}
                                  </CardTitle>
                                </div>
                                <div className="text-right">
                                  <div className="text-lg font-bold text-theme-primary">
                                    ${categoryTotal.toLocaleString()}
                                  </div>
                                  <div className="text-sm text-gray-500 font-medium">Category Total</div>
                                </div>
                              </div>
                            </CardHeader>
                          </Collapsible.Trigger>
                          
                          <Collapsible.Content>
                            <CardContent className="pt-0">
                              <div className="space-y-3">
                                {category.items.map((item, itemIndex) => {
                                  const itemTotal = calculateItemTotal(item);
                                  
                                  return (
                                    <div
                                      key={itemIndex}
                                      className="border rounded-lg p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                                      onClick={() => handleItemClick(item)}
                                      title="Click to view detailed information"
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-6">
                                          <div className="flex items-center gap-2">
                                            <Building2 className="h-4 w-4 text-gray-500" />
                                            <span className="font-medium">{item.description || `Item ${itemIndex + 1}`}</span>
                                            <Badge variant="outline" className="text-xs">
                                              {item.trade}
                                            </Badge>
                                            <Eye className="h-4 w-4 text-theme-primary ml-2" />
                                          </div>
                                          
                                          <div className="flex items-center gap-2">
                                            <User className="h-4 w-4 text-gray-500" />
                                            <span className="text-gray-600">{item.vendor || 'Unknown'}</span>
                                          </div>
                                          
                                          <div className="flex items-center gap-2">
                                            <DollarSign className="h-4 w-4 text-gray-500" />
                                            <span className="text-gray-600">${itemTotal.toLocaleString()}</span>
                                            <span className="text-xs text-gray-400">total</span>
                                          </div>
                                        </div>
                                        
                                        <div className="flex items-center gap-4">
                                          <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2">
                                              <div 
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleStatusClick(estimate.id, item.id, item.status || 'Estimating');
                                                }}
                                                className={`${canEdit ? 'cursor-pointer hover:scale-105 transition-transform' : ''}`}
                                                title={canEdit ? `Click to progress to next status: ${getNextStatus(item.status || 'Estimating')}` : ''}
                                              >
                                                <StatusBadge status={item.status || 'Estimating'} />
                                              </div>
                                            </div>
                                          </div>
                                          <div className="text-right">
                                            <div className="text-lg font-semibold">
                                              ${itemTotal.toLocaleString()}
                                            </div>
                                            <div className="text-xs text-gray-500">Total Cost</div>
                                            <div className="text-xs text-gray-400 space-y-0.5 mt-1">
                                              <div>Base: ${(item.estimatedCost || 0).toLocaleString()}</div>
                                              {(item.markup > 0) && <div>+{item.markup}% markup</div>}
                                              {(item.contingency > 0) && <div>+{item.contingency}% contingency</div>}
                                            </div>
                                          </div>

                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </CardContent>
                          </Collapsible.Content>
                        </Card>
                      </Collapsible.Root>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No detailed breakdown available for this estimate.
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Edit Estimate Dialog */}
      <Dialog open={isEditEstimateDialogOpen} onOpenChange={setIsEditEstimateDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Estimate</DialogTitle>
            <DialogDescription>
              Update estimate details, categories, and trade items
            </DialogDescription>
          </DialogHeader>
          
          {editingEstimate && (
            <div className="space-y-6">
              {/* Estimate Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="estimateName">Estimate Name</Label>
                  <Input
                    id="estimateName"
                    value={editingEstimate.name}
                    onChange={(e) => setEditingEstimate({...editingEstimate, name: e.target.value})}
                  />
                </div>
                <div>
                  <Label htmlFor="estimateStatus">Status</Label>
                  <Select
                    value={editingEstimate.status}
                    onValueChange={(value) => setEditingEstimate({...editingEstimate, status: value})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div>
                <Label htmlFor="estimateDescription">Description</Label>
                <Textarea
                  id="estimateDescription"
                  value={editingEstimate.description}
                  onChange={(e) => setEditingEstimate({...editingEstimate, description: e.target.value})}
                  rows={2}
                />
              </div>

              {/* Categories and Items */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Categories & Trade Items</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addNewCategory}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Category
                  </Button>
                </div>
                {editingEstimate.categories.map((category: any, categoryIndex: number) => (
                  <Card key={categoryIndex} className="border-l-4 border-l-theme-primary">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <Label>Category Name</Label>
                          <Input
                            value={category.name}
                            onChange={(e) => {
                              const newCategories = [...editingEstimate.categories];
                              newCategories[categoryIndex].name = e.target.value;
                              setEditingEstimate({...editingEstimate, categories: newCategories});
                            }}
                            className="mt-1"
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-sm text-gray-500">Category Total</div>
                            <div className="text-lg font-bold text-theme-primary">
                              ${calculateCategoryTotal(category).toLocaleString()}
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => removeCategory(categoryIndex)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {category.items.map((item: any, itemIndex: number) => (
                          <div key={itemIndex} className="border rounded-lg p-4 bg-gray-50">
                            <div className="flex items-start justify-between mb-3">
                              <h4 className="font-medium text-gray-900">Trade Item {itemIndex + 1}</h4>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => removeItem(categoryIndex, itemIndex)}
                                className="text-red-600 hover:text-red-700"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                              <div>
                                <Label>Trade</Label>
                                <Input
                                  value={item.trade}
                                  onChange={(e) => {
                                    const newCategories = [...editingEstimate.categories];
                                    newCategories[categoryIndex].items[itemIndex].trade = e.target.value;
                                    setEditingEstimate({...editingEstimate, categories: newCategories});
                                  }}
                                />
                              </div>
                              <div>
                                <Label>Vendor</Label>
                                <Input
                                  value={item.vendor}
                                  onChange={(e) => {
                                    const newCategories = [...editingEstimate.categories];
                                    newCategories[categoryIndex].items[itemIndex].vendor = e.target.value;
                                    setEditingEstimate({...editingEstimate, categories: newCategories});
                                  }}
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                              <div>
                                <Label>Status</Label>
                                <Select
                                  value={item.status || 'Estimating'}
                                  onValueChange={(value: 'Estimating' | 'Bidding' | 'Waiting Approval' | 'Approved' | 'Rejected') => {
                                    const newCategories = [...editingEstimate.categories];
                                    newCategories[categoryIndex].items[itemIndex].status = value;
                                    setEditingEstimate({...editingEstimate, categories: newCategories});
                                  }}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="Estimating">Estimating</SelectItem>
                                    <SelectItem value="Bidding">Bidding</SelectItem>
                                    <SelectItem value="Waiting Approval">Waiting Approval</SelectItem>
                                    <SelectItem value="Approved">Approved</SelectItem>
                                    <SelectItem value="Rejected">Rejected</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label>Description</Label>
                                <Input
                                  value={item.description || ''}
                                  onChange={(e) => {
                                    const newCategories = [...editingEstimate.categories];
                                    newCategories[categoryIndex].items[itemIndex].description = e.target.value;
                                    setEditingEstimate({...editingEstimate, categories: newCategories});
                                  }}
                                  placeholder="Item description"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-4 gap-4 mb-4">
                              <div>
                                <Label>Base Cost</Label>
                                <Input
                                  type="number"
                                  value={item.estimatedCost}
                                  onChange={(e) => {
                                    const newCategories = [...editingEstimate.categories];
                                    newCategories[categoryIndex].items[itemIndex].estimatedCost = parseFloat(e.target.value) || 0;
                                    setEditingEstimate({...editingEstimate, categories: newCategories});
                                  }}
                                />
                              </div>
                              <div>
                                <Label>Markup %</Label>
                                <Input
                                  inputMode="numeric"
                                  value={item.markup || 0}
                                  onChange={(e) => {
                                    const newCategories = [...editingEstimate.categories];
                                    newCategories[categoryIndex].items[itemIndex].markup = parseFloat(e.target.value) || 0;
                                    setEditingEstimate({...editingEstimate, categories: newCategories});
                                  }}
                                />
                              </div>
                              <div>
                                <Label>Contingency %</Label>
                                <Input
                                  inputMode="numeric"
                                  value={item.contingency || 0}
                                  onChange={(e) => {
                                    const newCategories = [...editingEstimate.categories];
                                    newCategories[categoryIndex].items[itemIndex].contingency = parseFloat(e.target.value) || 0;
                                    setEditingEstimate({...editingEstimate, categories: newCategories});
                                  }}
                                />
                              </div>
                              <div>
                                <Label>Duration (days)</Label>
                                <Input
                                  type="number"
                                  value={item.duration || 0}
                                  onChange={(e) => {
                                    const newCategories = [...editingEstimate.categories];
                                    newCategories[categoryIndex].items[itemIndex].duration = parseFloat(e.target.value) || 0;
                                    setEditingEstimate({...editingEstimate, categories: newCategories});
                                  }}
                                />
                              </div>
                            </div>
                            <div className="mb-4">
                              <Label>Description</Label>
                              <Textarea
                                value={item.description || ''}
                                onChange={(e) => {
                                  const newCategories = [...editingEstimate.categories];
                                  newCategories[categoryIndex].items[itemIndex].description = e.target.value;
                                  setEditingEstimate({...editingEstimate, categories: newCategories});
                                }}
                                rows={2}
                              />
                            </div>
                            <div className="bg-white p-3 rounded border">
                              <div className="flex justify-between items-center">
                                <span className="font-medium">Item Total:</span>
                                <span className="text-lg font-bold text-green-600">
                                  ${calculateItemTotal(item).toLocaleString()}
                                </span>
                              </div>
                              <div className="text-sm text-gray-600 mt-1">
                                Base: ${item.estimatedCost?.toLocaleString() || '0'}
                                {(item.markup > 0) && ` + ${item.markup}% markup`}
                                {(item.contingency > 0) && ` + ${item.contingency}% contingency`}
                              </div>
                            </div>
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={() => addNewItem(categoryIndex)}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Trade Item
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Total Summary */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-semibold">Estimate Total:</span>
                  <span className="text-2xl font-bold text-green-600">
                    ${editingEstimate.categories.reduce((total: number, cat: any) => total + calculateCategoryTotal(cat), 0).toLocaleString()}
                  </span>
                </div>
              </div>
              
              <div className="flex justify-end gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setIsEditEstimateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={() => {
                    // Processing operation
                    saveEstimateChanges();
                  }}
                  disabled={!editingEstimate}
                >
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Estimate Confirmation Dialog */}
      <AlertDialog open={deleteEstimateDialog.open} onOpenChange={(open) => setDeleteEstimateDialog({ open, estimateId: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Estimate</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this estimate? This action cannot be undone and will remove all categories and trade items associated with this estimate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteEstimateDialog.estimateId && deleteEstimateMutation.mutate(deleteEstimateDialog.estimateId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Estimate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* PDF Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>PDF Preview - Project Estimate</DialogTitle>
            <DialogDescription>
              Preview how the PDF will look before downloading
            </DialogDescription>
          </DialogHeader>
          
          {previewEstimate && (
            <PDFPreview 
              estimate={previewEstimate} 
              projectId={projectId} 
              onClose={() => setIsPreviewOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Estimate Item Detail View */}
      <EstimateItemDetailView
        item={selectedItem}
        isOpen={itemDetailOpen}
        onClose={() => {
          setItemDetailOpen(false);
          setSelectedItem(null);
        }}
        onEdit={(item) => {
          // Find the estimate this item belongs to
          const estimate = estimates.find((e: any) => 
            e.categories.some((cat: any) => cat.items.some((i: any) => i.id === item.id))
          );
          if (estimate) {
            handleEditItem(item, estimate.id.toString());
            setItemDetailOpen(false);
          }
        }}
        canEdit={canEdit}
      />

      {/* Individual Item Edit Dialog */}
      <Dialog open={isEditItemDialogOpen} onOpenChange={setIsEditItemDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Edit Estimate Item
            </DialogTitle>
            <DialogDescription>
              Update the details for this estimate item
            </DialogDescription>
          </DialogHeader>

          {editingItem && (
            <div className="space-y-6 py-4">
              {/* Item Header */}
              <div className="flex items-start justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <h3 className="text-lg font-medium">Item #{editingItem.id}</h3>
                  <p className="text-sm text-gray-600">Total: ${((editingItem.estimatedCost || 0) * (1 + (editingItem.markup || 0) / 100) * (1 + (editingItem.contingency || 0) / 100)).toLocaleString()}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditItemDialogOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-6">
                {/* Item Title */}
                <div>
                  <Label htmlFor="item-title">Item Title</Label>
                  <Input
                    id="item-title"
                    placeholder="e.g., Kitchen Island Electrical"
                    value={editingItem.title || ''}
                    onChange={(e) => setEditingItem({...editingItem, title: e.target.value})}
                  />
                </div>

                {/* Trade and Vendor Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="trade">Trade</Label>
                    <Select 
                      value={editingItem.trade || ''} 
                      onValueChange={(value) => setEditingItem({...editingItem, trade: value})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select trade" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Foundation">Foundation</SelectItem>
                        <SelectItem value="Framing">Framing</SelectItem>
                        <SelectItem value="Plumbing">Plumbing</SelectItem>
                        <SelectItem value="Electrical">Electrical</SelectItem>
                        <SelectItem value="HVAC">HVAC</SelectItem>
                        <SelectItem value="Roofing">Roofing</SelectItem>
                        <SelectItem value="Siding">Siding</SelectItem>
                        <SelectItem value="Flooring">Flooring</SelectItem>
                        <SelectItem value="Cabinetry">Cabinetry</SelectItem>
                        <SelectItem value="Painting">Painting</SelectItem>
                        <SelectItem value="Landscaping">Landscaping</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="vendor">Vendor (Optional)</Label>
                    <Select 
                      value={editingItem.vendor || ''} 
                      onValueChange={(value) => setEditingItem({...editingItem, vendor: value})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select vendor (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no-vendor">No vendor selected</SelectItem>
                        <SelectItem value="Anderson Plumbing">Anderson Plumbing</SelectItem>
                        <SelectItem value="Prime Electrical">Prime Electrical</SelectItem>
                        <SelectItem value="Gonzalez Framing">Gonzalez Framing</SelectItem>
                        <SelectItem value="Kim HVAC">Kim HVAC</SelectItem>
                        <SelectItem value="Thompson Roofing">Thompson Roofing</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Cost Type */}
                <div>
                  <Label htmlFor="cost-type">Cost Type</Label>
                  <Select 
                    value={editingItem.costType || ''} 
                    onValueChange={(value) => setEditingItem({...editingItem, costType: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select cost type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="subcontractor">Subcontractor</SelectItem>
                      <SelectItem value="materials">Materials</SelectItem>
                      <SelectItem value="labor">Labor</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Description */}
                <div>
                  <Label htmlFor="description">Description of Work (Optional)</Label>
                  <Textarea
                    id="description"
                    placeholder="Optional: Detailed description of the work to be performed..."
                    value={editingItem.description || ''}
                    onChange={(e) => setEditingItem({...editingItem, description: e.target.value})}
                    rows={3}
                  />
                </div>

                {/* Base Cost and Duration Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="base-cost">Base Cost ($)</Label>
                    <Input
                      id="base-cost"
                      type="number"
                      value={editingItem.estimatedCost || ''}
                      onChange={(e) => setEditingItem({...editingItem, estimatedCost: parseFloat(e.target.value) || 0})}
                    />
                  </div>

                  <div>
                    <Label htmlFor="duration">Duration (Days)</Label>
                    <Input
                      id="duration"
                      type="number"
                      value={editingItem.duration || ''}
                      onChange={(e) => setEditingItem({...editingItem, duration: parseFloat(e.target.value) || 0})}
                    />
                  </div>
                </div>

                {/* Status */}
                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select 
                    value={editingItem.status || 'Not Started'} 
                    onValueChange={(value) => setEditingItem({...editingItem, status: value})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Not Started">Not Started</SelectItem>
                      <SelectItem value="Actively Bidding">Actively Bidding</SelectItem>
                      <SelectItem value="Bids Received">Bids Received</SelectItem>
                      <SelectItem value="Job Awarded">Job Awarded</SelectItem>
                      <SelectItem value="Approved">Approved</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Markup and Contingency Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="markup">Markup (%)</Label>
                    <Input
                      id="markup"
                      inputMode="numeric"
                      value={editingItem.markup || ''}
                      onChange={(e) => setEditingItem({...editingItem, markup: parseFloat(e.target.value) || 0})}
                    />
                  </div>

                  <div>
                    <Label htmlFor="contingency">Contingency (%)</Label>
                    <Input
                      id="contingency"
                      inputMode="numeric"
                      value={editingItem.contingency || ''}
                      onChange={(e) => setEditingItem({...editingItem, contingency: parseFloat(e.target.value) || 0})}
                    />
                  </div>
                </div>

                {/* File Attachments Placeholder */}
                <div>
                  <Label>File Attachments (Max 3)</Label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                    <div className="text-gray-400 mb-2">
                      <svg className="mx-auto h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <p className="text-gray-500">Drag and drop files here, or click to browse</p>
                    <p className="text-xs text-gray-400 mt-1">Supports: PDF, DOCX, JPG, PNG (Max 10MB per file)</p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-6 border-t">
                <Button
                  variant="outline"
                  onClick={() => setIsEditItemDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={saveItemChanges}
                  disabled={!editingItem.title || !editingItem.trade}
                >
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Manual Status Update Dialog */}
      <Dialog open={statusUpdateDialog.open} onOpenChange={(open) => setStatusUpdateDialog({ open, estimate: null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Update Estimate Status
            </DialogTitle>
            <DialogDescription>
              Change the status of this estimate. If you select "Approved", all estimate items will be automatically approved.
            </DialogDescription>
          </DialogHeader>

          {statusUpdateDialog.estimate && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-sm font-medium text-gray-700">Current Status</div>
                <div className="text-lg font-semibold text-blue-600">
                  {statusUpdateDialog.estimate.status || 'Draft'}
                </div>
              </div>

              <div>
                <Label htmlFor="new-status">New Status</Label>
                <Select 
                  value={statusUpdateDialog.estimate.status || 'Draft'} 
                  onValueChange={(value) => 
                    setStatusUpdateDialog(prev => ({
                      ...prev,
                      estimate: prev.estimate ? { ...prev.estimate, status: value } : null
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select new status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="In Review">In Review</SelectItem>
                    <SelectItem value="Ready for Client">Ready for Client</SelectItem>
                    <SelectItem value="Sent to Client">Sent to Client</SelectItem>
                    <SelectItem value="Client Approved">Client Approved</SelectItem>
                    <SelectItem value="Client Rejected">Client Rejected</SelectItem>
                    <SelectItem value="Revision Needed">Revision Needed</SelectItem>
                    <SelectItem value="Approved">Approved</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {statusUpdateDialog.estimate.status === 'Approved' && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2 text-green-800">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-sm font-medium">Auto-Approval Notice</span>
                  </div>
                  <p className="text-sm text-green-700 mt-1">
                    All estimate items will be automatically set to "Approved" status when you confirm this change.
                  </p>
                </div>
              )}

              {statusUpdateDialog.estimate.status === 'Sent to Client' && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2 text-blue-800">
                    <Send className="h-4 w-4" />
                    <span className="text-sm font-medium">Client Notification</span>
                  </div>
                  <p className="text-sm text-theme-primary mt-1">
                    The estimate will be sent to the client for their review and approval. They will be able to view and approve/reject the estimate in their client portal.
                  </p>
                </div>
              )}

              {statusUpdateDialog.estimate.status === 'Ready for Client' && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-center gap-2 text-yellow-800">
                    <Clock className="h-4 w-4" />
                    <span className="text-sm font-medium">Ready Status</span>
                  </div>
                  <p className="text-sm text-yellow-700 mt-1">
                    This marks the estimate as ready for client review, but doesn't send it yet. Use "Sent to Client" to actually deliver it.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setStatusUpdateDialog({ open: false, estimate: null })}
            >
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (statusUpdateDialog.estimate) {
                  updateEstimateStatusMutation.mutate({
                    estimateId: statusUpdateDialog.estimate.id,
                    status: statusUpdateDialog.estimate.status
                  });
                }
              }}
              disabled={updateEstimateStatusMutation.isPending}
            >
              {updateEstimateStatusMutation.isPending ? 'Updating...' : 'Update Status'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
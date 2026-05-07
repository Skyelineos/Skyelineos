import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Calculator, FileText, Plus, Edit, MoreHorizontal, Download } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { EstimateForm } from './EstimateForm';
import { EstimateItemDetailView } from './EstimateItemDetailView';
import { EditEstimateItemDialog } from './EditEstimateItemDialog';
import { EstimatePDFService, EstimatePDFData } from '@/components/pdf/EstimatePDFService';
import { useBranding } from '@/contexts/BrandingContext';
import { useTheme } from '@/contexts/ThemeContext';


export default function EstimateManagement() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id || '0');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { logoUrl } = useBranding();
  const { accentColor } = useTheme();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEstimate, setEditingEstimate] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [itemDetailOpen, setItemDetailOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [isItemEditDialogOpen, setIsItemEditDialogOpen] = useState(false);


  // Fetch estimates for the project
  const { data: estimates = [], isLoading: estimatesLoading } = useQuery({
    queryKey: ['/api/estimates', projectId],
    queryFn: async () => {
      const response = await apiRequest('/api/estimates', { method: 'GET' });
      return response.filter((estimate: any) => estimate.projectId === projectId);
    }
  });

  // Fetch project data for PDF generation
  const { data: project } = useQuery({
    queryKey: ['/api/projects', projectId],
    enabled: !!projectId
  });

  const getStatusBadge = (status: string) => {
    const statusLower = status?.toLowerCase() || 'pending';
    
    switch (statusLower) {
      case 'approved':
        return { variant: 'default' as const, className: 'bg-green-100 text-green-800 border-green-200' };
      case 'waiting approval':
        return { variant: 'secondary' as const, className: 'bg-blue-100 text-blue-800 border-blue-200' };
      case 'pending':
        return { variant: 'outline' as const, className: 'bg-yellow-100 text-yellow-800 border-yellow-200' };
      case 'draft':
        return { variant: 'outline' as const, className: 'bg-gray-100 text-gray-700 border-gray-200' };
      case 'not started':
        return { variant: 'outline' as const, className: 'bg-gray-100 text-gray-600 border-gray-200' };
      case 'job awarded':
        return { variant: 'default' as const, className: 'bg-green-100 text-green-800 border-green-200' };
      case 'actively bidding':
        return { variant: 'secondary' as const, className: 'bg-orange-100 text-orange-800 border-orange-200' };
      case 'bids received':
        return { variant: 'secondary' as const, className: 'bg-purple-100 text-purple-800 border-purple-200' };
      default:
        return { variant: 'secondary' as const, className: 'bg-gray-100 text-gray-600 border-gray-200' };
    }
  };

  const calculateTotalValue = () => {
    return estimates.reduce((total: number, estimate: any) => {
      return total + (estimate.totalCost || estimate.estimatedAmount || 0);
    }, 0);
  };

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



  const handleEditEstimate = (estimate: any) => {
    setEditingEstimate(estimate);
    setIsEditDialogOpen(true);
  };

  // Handle clicking on estimate items for detailed view
  const handleItemClick = (item: any) => {
    setSelectedItem(item);
    setItemDetailOpen(true);
  };

  const handleDownloadPDF = async (estimate: any) => {
    try {
      const pdfData: EstimatePDFData = {
        ...estimate,
        projectName: (project as any)?.name || 'Unknown Project',
        clientName: (project as any)?.clientName || 'Unknown Client',
        logoUrl: logoUrl || undefined
      };

      await EstimatePDFService.downloadPDF(pdfData);
      
      toast({
        title: "PDF Downloaded",
        description: "The estimate PDF has been downloaded successfully.",
      });
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast({
        title: "Download Failed",
        description: "Failed to download the estimate PDF. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Delete estimate mutation
  const deleteEstimateMutation = useMutation({
    mutationFn: async (estimateId: number) => {
      await apiRequest(`/api/estimates/${estimateId}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates'] });
      toast({
        title: 'Estimate Deleted',
        description: 'The estimate has been successfully deleted.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Delete Failed',
        description: error.message || 'Failed to delete estimate',
        variant: 'destructive',
      });
    }
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Project Estimates</h1>
          <p className="text-muted-foreground">
            Create and manage cost estimates for this project
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
              <Plus className="mr-2 h-4 w-4" />
              New Estimate
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Estimate</DialogTitle>
              <DialogDescription>
                Add a new cost estimate for this project
              </DialogDescription>
            </DialogHeader>
            <EstimateForm
              projectId={projectId.toString()}
              onSave={() => {
                setDialogOpen(false);
                queryClient.invalidateQueries({ queryKey: ['/api/estimates'] });
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-gray-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Estimates</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{estimates.length}</div>
            <p className="text-xs text-muted-foreground">
              Active estimate documents
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${calculateTotalValue().toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Combined estimate value
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {estimates.filter((e: any) => e.status?.toLowerCase() === 'approved').length}
            </div>
            <p className="text-xs text-muted-foreground">
              Ready for execution
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Estimates List */}
      <Card className="bg-gray-50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Project Estimates
              </CardTitle>
              <CardDescription>Detailed cost estimates for project components</CardDescription>
            </div>

          </div>
        </CardHeader>
        <CardContent>
          {estimatesLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-theme-primary"></div>
            </div>
          ) : estimates.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No estimates yet</h3>
              <p className="text-gray-500 mb-4">Get started by creating your first project estimate</p>
              <Button 
                onClick={() => setDialogOpen(true)}
                className="bg-accent hover:bg-accent/90 text-accent-foreground"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create First Estimate
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {estimates.map((estimate: any) => (
                <Card 
                  key={estimate.id} 
                  className="border-l-4"
                  style={{ borderLeftColor: accentColor }}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-xl">{estimate.name || estimate.trade}</CardTitle>
                        {estimate.description && (
                          <CardDescription className="mt-1">{estimate.description}</CardDescription>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-2xl font-bold">
                            ${(estimate.totalCost || estimate.estimatedAmount || 0).toLocaleString()}
                          </div>
                          <div className="text-sm text-gray-500">Total Cost</div>
                        </div>
                        <Badge 
                          variant={getStatusBadge(estimate.status || 'pending').variant} 
                          className={`text-sm ${getStatusBadge(estimate.status || 'pending').className}`}
                        >
                          {estimate.status || 'Pending'}
                        </Badge>
                        
                        {/* Estimate Actions Dropdown */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditEstimate(estimate)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit Estimate
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDownloadPDF(estimate)}>
                              <Download className="h-4 w-4 mr-2" />
                              Download PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => deleteEstimateMutation.mutate(estimate.id)}
                              className="text-red-600"
                            >
                              <FileText className="h-4 w-4 mr-2" />
                              Delete Estimate
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent>
                    {estimate.categories && estimate.categories.length > 0 ? (
                      <div className="space-y-6">
                        {estimate.categories.map((category: any, categoryIndex: number) => (
                          <div key={categoryIndex} className="border rounded-lg p-4 bg-gray-50">
                            <div className="flex items-center justify-between mb-4">
                              <h4 className="font-semibold text-lg text-theme-primary">
                                {category.name || category.categoryName || `Category ${categoryIndex + 1}`}
                              </h4>
                              <div className="text-sm text-gray-500">
                                {category.items?.length || 0} items
                              </div>
                            </div>
                            
                            {category.items && category.items.length > 0 ? (
                              <div className="space-y-3">
                                {category.items.map((item: any, itemIndex: number) => (
                                  <div 
                                    key={itemIndex} 
                                    className="bg-white rounded-lg p-3 border hover:bg-gray-50 transition-colors cursor-pointer"
                                    onClick={() => handleItemClick(item)}
                                    title="Click to view item details"
                                  >
                                    <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-center">
                                      <div className="md:col-span-2">
                                        <div className="font-medium text-gray-900">
                                          {item.title || item.trade || item.description || `Item ${itemIndex + 1}`}
                                        </div>
                                        {item.description && item.trade && (
                                          <div className="text-sm text-gray-500 mt-1">{item.description}</div>
                                        )}
                                      </div>
                                      <div className="text-center">
                                        <div className="text-xs text-gray-500 mb-1">Vendor</div>
                                        <div className="font-medium text-sm">
                                          {item.vendor || 'Not assigned'}
                                        </div>
                                      </div>
                                      <div className="text-center">
                                        <div className="text-xs text-gray-500 mb-1">Cost</div>
                                        <div className="font-bold text-sm">
                                          ${calculateItemTotal(item).toLocaleString()}
                                        </div>
                                      </div>
                                      <div className="text-center">
                                        <div className="text-xs text-gray-500 mb-1">Duration</div>
                                        <div className="font-medium text-sm">
                                          {item.duration || item.laborHours || 0} days
                                        </div>
                                      </div>
                                      <div className="text-center">
                                        <Badge 
                                          variant={getStatusBadge(item.status || 'Not Started').variant}
                                          className={`text-xs ${getStatusBadge(item.status || 'Not Started').className}`}
                                        >
                                          {item.status || 'Not Started'}
                                        </Badge>
                                      </div>
                                    </div>
                                    {item.notes && (
                                      <div className="mt-3 pt-3 border-t border-gray-100">
                                        <div className="text-sm text-gray-600">{item.notes}</div>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-center py-4 text-gray-500 text-sm">
                                No items in this category
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                        <p>No detailed breakdown available</p>
                        <p className="text-sm">This estimate may have been created as a simple total cost estimate</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Estimate Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Estimate</DialogTitle>
            <DialogDescription>
              Modify the details of this estimate
            </DialogDescription>
          </DialogHeader>
          {editingEstimate && (
            <EstimateForm
              projectId={projectId.toString()}
              initialData={editingEstimate}
              isEditing={true}
              onSave={() => {
                setIsEditDialogOpen(false);
                setEditingEstimate(null);
                queryClient.invalidateQueries({ queryKey: ['/api/estimates'] });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Item Detail View Dialog */}
      <EstimateItemDetailView
        item={selectedItem}
        isOpen={itemDetailOpen}
        onClose={() => {
          setItemDetailOpen(false);
          setSelectedItem(null);
        }}
        canEdit={true}
        onEdit={(item) => {
          // Development logging removed
          setItemDetailOpen(false);
          setSelectedItem(null);
          setEditingItem(item);
          setIsItemEditDialogOpen(true);
        }}
      />

      {/* Individual Item Edit Dialog */}
      <EditEstimateItemDialog
        item={editingItem}
        isOpen={isItemEditDialogOpen}
        onClose={() => {
          setIsItemEditDialogOpen(false);
          setEditingItem(null);
        }}
        onSave={() => {
          queryClient.invalidateQueries({ queryKey: ['/api/estimates'] });
        }}
      />

    </div>
  );
}
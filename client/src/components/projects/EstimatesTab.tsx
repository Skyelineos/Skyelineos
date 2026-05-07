import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEstimates } from '@/hooks/useEstimates';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Edit, CheckCircle, XCircle, Clock, AlertCircle, DollarSign } from 'lucide-react';

// Interface for estimate items
interface EstimateItem {
  id: number;
  title?: string;
  trade: string;
  vendor: string;
  estimatedCost: number;
  duration: number;
  description: string;
  status: 'Estimating' | 'Bidding' | 'Job Awarded' | 'Waiting Approval' | 'Approved' | 'Rejected';
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

interface EstimatesTabProps {
  projectId: string;
  userRole?: string;
}

// Estimate workflow status configuration
const estimateStatusConfig = {
  'Estimating': { 
    label: 'Estimating', 
    color: 'bg-blue-500', 
    icon: DollarSign,
    description: 'Internal scoping and cost estimation' 
  },
  'Bidding': { 
    label: 'Bidding', 
    color: 'bg-yellow-500', 
    icon: Clock,
    description: 'Out for bid with subcontractors' 
  },
  'Job Awarded': { 
    label: 'Job Awarded', 
    color: 'bg-orange-500', 
    icon: CheckCircle,
    description: 'Subcontractor selected for this trade' 
  },
  'Waiting Approval': { 
    label: 'Waiting Approval', 
    color: 'bg-amber-500', 
    icon: AlertCircle,
    description: 'Ready for client approval' 
  },
  'Approved': { 
    label: 'Approved', 
    color: 'bg-green-500', 
    icon: CheckCircle,
    description: 'Client approved the selected bid' 
  },
  'Rejected': { 
    label: 'Rejected', 
    color: 'bg-red-500', 
    icon: XCircle,
    description: 'Client rejected the bid' 
  }
};

export function EstimatesTab({ projectId, userRole = 'admin' }: EstimatesTabProps) {
  const [editingItem, setEditingItem] = useState<{ estimate: EstimateData; item: EstimateItem } | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Calculate total cost including markup and contingency
  const calculateItemTotal = (item: EstimateItem) => {
    const baseCost = parseFloat(item.estimatedCost?.toString() || '0') || 0;
    const markup = parseFloat((item as any).markup?.toString() || '0') || 0;
    const contingency = parseFloat((item as any).contingency?.toString() || '0') || 0;
    const markupAmount = baseCost * (markup / 100);
    const contingencyAmount = (baseCost + markupAmount) * (contingency / 100);
    return baseCost + markupAmount + contingencyAmount;
  };

  // Use existing estimates hook
  const { estimates, isLoading: estimatesLoading, getProjectEstimates, forceRefresh } = useEstimates();

  // Get project estimates
  const projectEstimates = getProjectEstimates(projectId);

  // Get all estimate items from all estimates for this project
  const allEstimateItems: EstimateItem[] = projectEstimates.flatMap((estimate: any) => 
    estimate.categories?.flatMap((category: any) => category.items || []) || []
  );

  // Mutation for updating estimate item status
  const updateStatusMutation = useMutation({
    mutationFn: async ({ estimateId, itemId, status }: { estimateId: number; itemId: number; status: string }) => {
      const response = await apiRequest(`/api/estimate-items/${estimateId}/${itemId}/status`, 'PATCH', { status });
      return response;
    },
    onSuccess: async () => {
      await Promise.all([
        forceRefresh(),
        queryClient.invalidateQueries({ queryKey: ['/api/estimates'] })
      ]);
      toast({
        title: 'Status Updated',
        description: 'Estimate item status has been updated successfully.'
      });
      setEditingItem(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Update Failed',
        description: error.message || 'Failed to update status',
        variant: 'destructive'
      });
    }
  });

  const handleStatusUpdate = (status: string) => {
    if (!editingItem) return;
    
    updateStatusMutation.mutate({
      estimateId: editingItem.estimate.id,
      itemId: editingItem.item.id,
      status
    });
  };

  if (estimatesLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold">Estimate Status Management</h2>
          <p className="text-gray-600 mt-1">
            Manage estimate workflow status independent from bid management
          </p>
        </div>
      </div>

      {/* Status overview cards */}
      {allEstimateItems.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          {Object.entries(estimateStatusConfig).map(([status, config]) => {
            const count = allEstimateItems.filter(item => item.status === status).length;
            const Icon = config.icon;
            return (
              <Card key={status} className="text-center">
                <CardContent className="p-4">
                  <div className={`inline-flex items-center gap-2 px-3 py-1 rounded text-white text-sm mb-2 ${config.color}`}>
                    <Icon className="h-4 w-4" />
                    {config.label}
                  </div>
                  <div className="text-2xl font-bold">{count}</div>
                  <div className="text-xs text-gray-500 mt-1">{config.description}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Estimates list */}
      <div className="space-y-4">
        {projectEstimates.length > 0 ? (
          projectEstimates.map((estimate: any) => (
            <Card key={estimate.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{estimate.name}</span>
                  <Badge variant="outline">
                    {estimate.categories?.reduce((total, cat) => total + (cat.items?.length || 0), 0) || 0} items
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {estimate.categories?.map((category) =>
                    category.items?.map((item) => {
                      const config = estimateStatusConfig[item.status as keyof typeof estimateStatusConfig];
                      const Icon = config?.icon || DollarSign;
                      
                      return (
                        <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                          <div className="flex items-center gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-3">
                                <h4 className="font-medium">{item.title || item.trade}</h4>
                                <Badge className={`${config?.color || 'bg-gray-500'} text-white`}>
                                  <Icon className="h-3 w-3 mr-1" />
                                  {config?.label || item.status}
                                </Badge>
                              </div>
                              {item.vendor && (
                                <p className="text-sm text-gray-600 mt-1">Vendor: {item.vendor}</p>
                              )}
                              {item.description && (
                                <p className="text-sm text-gray-500 mt-1">{item.description}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <div className="font-semibold">
                                ${calculateItemTotal(item).toLocaleString()}
                              </div>
                              {item.duration > 0 && (
                                <div className="text-sm text-gray-500">
                                  {item.duration} days
                                </div>
                              )}
                            </div>
                            {(userRole === 'admin' || userRole === 'project_manager') && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setEditingItem({ estimate, item })}
                                className="ml-2"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="bg-gray-50">
            <CardContent className="p-8 text-center">
              <p className="text-gray-500">No estimates found for this project.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Status update dialog */}
      <Dialog open={!!editingItem} onOpenChange={() => setEditingItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Estimate Status</DialogTitle>
            <DialogDescription>
              Update the workflow status for {editingItem?.item.trade}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Current Status</label>
              <div className="flex items-center gap-2">
                {editingItem && (() => {
                  const config = estimateStatusConfig[editingItem.item.status as keyof typeof estimateStatusConfig];
                  const Icon = config?.icon || DollarSign;
                  return (
                    <Badge className={`${config?.color || 'bg-gray-500'} text-white`}>
                      <Icon className="h-3 w-3 mr-1" />
                      {config?.label || editingItem.item.status}
                    </Badge>
                  );
                })()}
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">New Status</label>
              <Select onValueChange={handleStatusUpdate}>
                <SelectTrigger>
                  <SelectValue placeholder="Select new status" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(estimateStatusConfig).map(([status, config]) => {
                    const Icon = config.icon;
                    return (
                      <SelectItem key={status} value={status}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          <span>{config.label}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingItem(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
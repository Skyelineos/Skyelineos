import React, { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

// UI Components
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TradeTypeComboBox } from '@/components/contacts/TradeTypeComboBox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// Icons
import { Plus, X, Copy, FileText, DollarSign, Calendar, ChevronDown, ChevronRight } from 'lucide-react';

// Schema for simplified form
const itemSchema = z.object({
  trade: z.string().min(1, 'Trade is required'),
  description: z.string().optional(),
  cost: z.number().min(0, 'Cost must be positive'),
  duration: z.number().min(0, 'Duration must be positive').optional(),
});

const simplifiedEstimateSchema = z.object({
  name: z.string().min(1, 'Estimate name is required'),
  description: z.string().optional(),
  items: z.array(itemSchema).min(1, 'At least one item is required'),
});

type SimplifiedEstimateData = z.infer<typeof simplifiedEstimateSchema>;

interface SimplifiedEstimateFormProps {
  projectId: number;
  onSubmit: (data: any) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

// Trade interface for API response
interface Trade {
  id: number;
  name: string;
  description: string;
  category: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function SimplifiedEstimateForm({ projectId, onSubmit, onCancel, isLoading }: SimplifiedEstimateFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);

  const form = useForm<SimplifiedEstimateData>({
    resolver: zodResolver(simplifiedEstimateSchema),
    defaultValues: {
      name: '',
      description: '',
      items: [{ trade: '', description: '', cost: 0, duration: 1 }],
    },
  });

  const { fields: itemFields, append: appendItem, remove: removeItem } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  // Fetch existing estimates for copying
  const { data: existingEstimates = [] } = useQuery<any[]>({
    queryKey: ['/api/estimates'],
  });

  // Fetch trades from API
  const { data: apiTrades = [] } = useQuery<Trade[]>({
    queryKey: ['/api/trades'],
    staleTime: 5 * 60 * 1000 // 5 minutes
  });

  // Get common trades from API (active trades only)
  const commonTrades = apiTrades
    .filter(trade => trade.isActive)
    .map(trade => trade.name)
    .sort();

  // Create estimate mutation
  const createEstimateMutation = useMutation({
    mutationFn: async (data: SimplifiedEstimateData) => {
      // Development logging removed
      
      // Convert simplified format to the system's expected format
      const estimateData = {
        projectId: projectId,
        name: data.name,
        description: data.description,
        categories: [{
          categoryName: 'Main Estimate',
          items: data.items.map((item) => ({
            trade: item.trade,
            vendor: '',
            description: item.description || '',
            estimatedCost: item.cost,
            markup: 0,
            contingency: 0,
            duration: item.duration || 1,
            status: 'Estimating',
            files: [],
          }))
        }],
        totalCost: data.items.reduce((sum, item) => sum + item.cost, 0),
        totalDuration: Math.max(...data.items.map(item => item.duration || 1)),
      };

      const response = await apiRequest('/api/estimates', { method: 'POST', body: estimateData });
      // Development logging removed
      return response;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates'] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
      toast({ title: "Success", description: "Estimate created successfully!" });
      onSubmit(result); // Call parent callback with the result
      form.reset(); // Reset form after successful submission
    },
    onError: (error: any) => {
      console.error('❌ Error saving estimate:', error);
      toast({ 
        title: "Error", 
        description: error.message || "Failed to create estimate", 
        variant: "destructive" 
      });
    },
  });

  const handleSubmit = (data: SimplifiedEstimateData) => {
    createEstimateMutation.mutate(data);
  };

  const addItem = () => {
    appendItem({ trade: '', description: '', cost: 0, duration: 1 });
  };

  const calculateTotal = () => {
    const items = form.watch('items');
    return items.reduce((sum, item) => sum + (item.cost || 0), 0);
  };

  const copyFromExisting = (sourceEstimate: any) => {
    try {
      // Extract items from the source estimate
      let items: any[] = [];
      
      if (sourceEstimate.notes) {
        const categories = JSON.parse(sourceEstimate.notes);
        if (Array.isArray(categories)) {
          items = categories.flatMap((cat: any) => 
            (cat.items || []).map((item: any) => ({
              trade: item.trade || '',
              description: item.description || '',
              cost: item.estimatedCost || 0,
              duration: item.duration || 1,
            }))
          );
        }
      }

      if (items.length === 0) {
        items = [{
          trade: sourceEstimate.trade || '',
          description: sourceEstimate.description || '',
          cost: sourceEstimate.estimatedAmount || 0,
          duration: 1,
        }];
      }

      form.setValue('name', `Copy of ${sourceEstimate.name || 'Estimate'}`);
      form.setValue('description', sourceEstimate.description || '');
      form.setValue('items', items);
      
      setCopyDialogOpen(false);
      toast({ title: "Estimate copied", description: "Successfully copied from existing estimate." });
    } catch (error) {
      toast({ title: "Copy failed", description: "Could not copy estimate data.", variant: "destructive" });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">Create New Estimate</h2>
        <p className="text-gray-600">Build a comprehensive project cost estimate</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          
          {/* Basic Information */}
          <Card className="bg-gray-50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estimate Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Q4 2024 Construction Estimate" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex items-end">
                  <Badge variant="outline" className="text-lg px-3 py-2">
                    <DollarSign className="h-4 w-4 mr-1" />
                    ${calculateTotal().toLocaleString()}
                  </Badge>
                </div>
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Brief description of the project scope..." rows={2} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Estimate Items */}
          <Card className="bg-gray-50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Estimate Items</CardTitle>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setCopyDialogOpen(true)}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Existing
                  </Button>
                  <Button type="button" variant="outline" onClick={addItem}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Item
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {itemFields.map((field, index) => (
                  <div key={field.id} className="p-4 border rounded-lg bg-gray-50">
                    <div className="flex items-start justify-between mb-3">
                      <span className="text-sm font-medium text-gray-600">Item #{index + 1}</span>
                      {itemFields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeItem(index)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <FormField
                        control={form.control}
                        name={`items.${index}.trade`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Trade *</FormLabel>
                            <FormControl>
                              <TradeTypeComboBox
                                value={field.value}
                                onValueChange={field.onChange}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`items.${index}.cost`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cost *</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                placeholder="0"
                                {...field}
                                onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`items.${index}.duration`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Days</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                placeholder="1"
                                {...field}
                                onChange={(e) => field.onChange(parseFloat(e.target.value) || 1)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="md:col-span-1 flex items-end">
                        <div className="text-right w-full">
                          <Label className="text-xs text-gray-500">Item Total</Label>
                          <div className="text-lg font-semibold text-green-600">
                            ${(form.watch(`items.${index}.cost`) || 0).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3">
                      <FormField
                        control={form.control}
                        name={`items.${index}.description`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Description (Optional)</FormLabel>
                            <FormControl>
                              <Input placeholder="Detailed description of work..." {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                ))}

                {itemFields.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <p>No items added yet. Click "Add Item" to get started.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Advanced Options (Collapsible) */}
          <Card className="bg-gray-50">
            <CardHeader>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                className="p-0 h-auto font-medium text-left justify-start"
              >
                {showAdvancedOptions ? (
                  <ChevronDown className="h-4 w-4 mr-2" />
                ) : (
                  <ChevronRight className="h-4 w-4 mr-2" />
                )}
                Advanced Options
              </Button>
            </CardHeader>
            {showAdvancedOptions && (
              <CardContent>
                <div className="text-sm text-gray-600 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p><strong>Note:</strong> Advanced options like markup, contingency, and vendor assignments can be added after creating the estimate.</p>
                  <p className="mt-2">This simplified form focuses on the essential information to get started quickly.</p>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="button" variant="outline" onClick={() => form.reset()}>
              Reset Form
            </Button>
            <Button 
              type="submit" 
              disabled={createEstimateMutation.isPending}
              className="min-w-32"
            >
              {createEstimateMutation.isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Create Estimate
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>

      {/* Copy from Existing Dialog */}
      <Dialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Copy from Existing Estimate</DialogTitle>
            <DialogDescription>
              Select an existing estimate to copy its structure and items.
            </DialogDescription>
          </DialogHeader>
          
          <div className="max-h-96 overflow-y-auto border rounded-lg">
            {existingEstimates.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <FileText className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                <p>No existing estimates found.</p>
              </div>
            ) : (
              <div className="divide-y">
                {existingEstimates.map((estimate: any) => (
                  <div 
                    key={estimate.id}
                    className="p-4 hover:bg-gray-50 cursor-pointer"
                    onClick={() => copyFromExisting(estimate)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">{estimate.name || 'Unnamed Estimate'}</h3>
                        <p className="text-sm text-gray-600">
                          ${(estimate.totalCost || estimate.estimatedAmount || 0).toLocaleString()}
                        </p>
                      </div>
                      <Button variant="outline" size="sm">
                        <Copy className="h-4 w-4 mr-2" />
                        Copy
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyDialogOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SimplifiedEstimateForm;
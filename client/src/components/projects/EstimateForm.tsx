import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SubcontractorComboBox } from '@/components/ui/subcontractor-combobox';
import { TradeTypeComboBox } from '@/components/contacts/TradeTypeComboBox';
import { useToast } from '@/hooks/use-toast';
import { 
  Plus, 
  Trash2, 
  Upload, 
  ChevronDown, 
  ChevronRight, 
  Save, 
  DollarSign,
  Calendar,
  FileText,
  Edit2,
  X,
  Copy,
  Building2,
  Search,
  Settings,
  Loader2
} from 'lucide-react';

const estimateItemSchema = z.object({
  title: z.string().min(1, 'Item title is required'),
  trade: z.string().min(1, 'Trade is required'),
  vendor: z.string().optional().default(''),
  description: z.string().optional().default(''),
  estimatedCost: z.coerce.number().min(0, 'Cost must be positive'),
  markup: z.coerce.number().min(0).optional().default(0),
  contingency: z.coerce.number().min(0).optional().default(0),
  duration: z.coerce.number().min(0, 'Duration must be positive'),
  status: z.enum(['Estimating', 'Bidding', 'Waiting Approval', 'Approved', 'Rejected']).optional().default('Estimating'),
  costType: z.enum(['subcontractor', 'materials', 'labor', 'equipment', 'permits', 'other']).optional(),
  files: z.array(z.any()).optional(),
});

const estimateCategorySchema = z.object({
  categoryName: z.string().min(1, 'Category name is required'),
  items: z.array(estimateItemSchema).min(1, 'At least one item is required'),
});

const estimateSchema = z.object({
  name: z.string().min(1, 'Estimate name is required'),
  description: z.string().optional(),
  categories: z.array(estimateCategorySchema).min(1, 'At least one category is required'),
});

type EstimateFormData = z.infer<typeof estimateSchema>;

interface EstimateFormProps {
  projectId: string;
  onSave?: () => void;
  initialData?: any;
  isEditing?: boolean;
}

const defaultVendors = [
  'ABC Construction', 'Premier Electric', 'Johnson Plumbing', 'Elite HVAC',
  'Master Framers', 'Quality Roofing', 'Professional Painters', 'Custom Cabinets',
  'Precision Tile', 'Green Landscaping', 'Concrete Specialists', 'Window World'
];

const defaultCategories = ['Foundation', 'Framing', 'Electrical', 'Plumbing', 'Finishing'];

export function EstimateForm({ projectId, onSave, initialData, isEditing = false }: EstimateFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [openCategories, setOpenCategories] = useState<Record<number, boolean>>({});
  const [newVendor, setNewVendor] = useState('');
  const [showNewVendorInput, setShowNewVendorInput] = useState(false);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [tradeManagerOpen, setTradeManagerOpen] = useState(false);
  // Fetch trades from API instead of localStorage
  const { data: apiTrades = [] } = useQuery<any[]>({
    queryKey: ['/api/trades'],
    staleTime: 5 * 60 * 1000 // 5 minutes
  });
  
  const predefinedTrades = apiTrades
    .filter(trade => trade.isActive)
    .map(trade => trade.name)
    .sort();
  const [predefinedVendors, setPredefinedVendors] = useState<string[]>(defaultVendors);
  const [newTrade, setNewTrade] = useState('');
  const [showNewSubcontractorDialog, setShowNewSubcontractorDialog] = useState(false);
  const [newSubcontractorData, setNewSubcontractorData] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    trade: ''
  });

  // Fetch contacts for subcontractor selection
  const { data: allContacts = [] } = useQuery<any[]>({
    queryKey: ['/api/contacts'],
  });

  const subcontractors = allContacts.filter((contact: any) => contact.role === 'subcontractor');

  const form = useForm<EstimateFormData>({
    resolver: zodResolver(estimateSchema),
    defaultValues: initialData ? {
      name: initialData.name || '',
      description: initialData.description || '',
      categories: initialData.categories?.map((cat: any) => ({
        categoryName: cat.name || cat.categoryName || '',
        items: cat.items?.map((item: any) => ({
          title: item.title || '',
          trade: item.trade || '',
          vendor: item.vendor || '',
          description: item.description || '',
          estimatedCost: item.estimatedCost || item.cost || 0,
          markup: item.markup || 0,
          contingency: item.contingency || 0,
          duration: item.duration || 1,
          status: item.status || 'Estimating',
          costType: item.costType || undefined,
          files: item.files || [],
        })) || []
      })) || []
    } : {
      name: '',
      description: '',
      categories: [
        {
          categoryName: '',
          items: [
            {
              title: '',
              trade: '',
              vendor: '',
              description: '',
              estimatedCost: 0,
              markup: 0,
              contingency: 0,
              duration: 1,
              status: 'Estimating',
              costType: undefined,
              files: [],
            }
          ]
        }
      ],
    },
  });

  const { fields: categoryFields, append: appendCategory, remove: removeCategory } = useFieldArray({
    control: form.control,
    name: 'categories',
  });

  // Fetch all estimates for copying
  const { data: allEstimates = [] } = useQuery<any[]>({
    queryKey: ['/api/estimates'],
  });

  // Fetch all projects to show project names in copy dialog
  const { data: allProjects = [] } = useQuery<any[]>({
    queryKey: ['/api/projects'],
  });

  // Filter estimates for search (now includes estimates from same project)
  const filteredEstimates = allEstimates.filter((estimate: any) => {
    const matchesSearch = !searchTerm || 
      estimate.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      estimate.trade?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      estimate.description?.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesSearch;
  });

  const createEstimateMutation = useMutation({
    mutationFn: async (data: EstimateFormData) => {
      // Transform categories to use 'name' instead of 'categoryName' for consistency
      const transformedCategories = data.categories.map(category => {
        const { categoryName, ...rest } = category;
        return {
          ...rest,
          name: categoryName, // Map categoryName to name
        };
      });

      const estimateData = {
        projectId: parseInt(projectId),
        name: data.name,
        description: data.description,
        categories: transformedCategories,
        totalCost: data.categories.reduce((total, category) => 
          total + category.items.reduce((catTotal, item) => {
            const baseCost = parseFloat(String(item.estimatedCost)) || 0;
            const markupAmount = baseCost * ((parseFloat(String(item.markup)) || 0) / 100);
            const contingencyAmount = (baseCost + markupAmount) * ((parseFloat(String(item.contingency)) || 0) / 100);
            return catTotal + baseCost + markupAmount + contingencyAmount;
          }, 0), 0
        ),
        totalDuration: data.categories.reduce((total, category) => 
          total + category.items.reduce((catTotal, item) => Math.max(catTotal, parseFloat(String(item.duration)) || 0), 0), 0
        ),
      };

      // Development logging removed
      // Development logging removed

      if (isEditing && initialData?.id) {
        const response = await apiRequest(`/api/estimates/${initialData.id}`, {
          method: 'PUT',
          body: JSON.stringify(estimateData),
        });
        // Development logging removed
        return response;
      } else {
        const response = await apiRequest('/api/estimates', {
          method: 'POST',
          body: JSON.stringify(estimateData),
        });
        // Development logging removed
        return response;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates'] });
      const message = isEditing ? "Estimate updated successfully" : "Estimate saved successfully";
      toast({ title: isEditing ? "Estimate Updated" : "Estimate Saved", description: message });
      onSave?.();
      if (!isEditing) {
        form.reset();
      }
    },
    onError: (error: any) => {
      console.error('❌ [EstimateForm] Error saving estimate:', error);
      const message = isEditing ? "Error updating estimate" : "Error saving estimate";
      toast({ title: message, description: error.message, variant: "destructive" });
    },
  });

  // Mutation for creating new subcontractor
  const createSubcontractorMutation = useMutation({
    mutationFn: async (subcontractorData: any) => {
      return apiRequest('/api/contacts', {
        method: 'POST',
        body: JSON.stringify({
          ...subcontractorData,
          role: 'subcontractor'
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      toast({ 
        title: "Subcontractor added", 
        description: `${newSubcontractorData.name} has been added to your contacts.` 
      });
      setNewSubcontractorData({
        name: '',
        company: '',
        email: '',
        phone: '',
        trade: ''
      });
      setShowNewSubcontractorDialog(false);
    },
    onError: (error: any) => {
      toast({ 
        title: "Error adding subcontractor", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const toggleCategory = (index: number) => {
    setOpenCategories(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const addCategory = () => {
    appendCategory({
      categoryName: '',
      items: [
        {
          title: '',
          trade: '',
          vendor: '',
          description: '',
          estimatedCost: 0,
          markup: 0,
          contingency: 0,
          duration: 1,
          status: 'Estimating',
          files: [],
        }
      ]
    });
  };

  const addNewVendor = () => {
    if (newVendor.trim() && !predefinedVendors.includes(newVendor.trim())) {
      const updatedVendors = [...predefinedVendors, newVendor.trim()];
      setPredefinedVendors(updatedVendors);
      setNewVendor('');
      setShowNewVendorInput(false);
      toast({ 
        title: "Vendor added", 
        description: `${newVendor.trim()} has been added to the vendor list.` 
      });
    } else if (predefinedVendors.includes(newVendor.trim())) {
      toast({ 
        title: "Vendor already exists", 
        description: `${newVendor.trim()} is already in the vendor list.`,
        variant: "destructive"
      });
    }
  };

  // Create new trade mutation
  const createTradeMutation = useMutation({
    mutationFn: (tradeName: string) => 
      apiRequest('/api/trades', { 
        method: 'POST', 
        body: {
          name: tradeName,
          description: `Auto-created trade: ${tradeName}`,
          category: 'Construction',
          isActive: true
        }
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trades'] });
      toast({
        title: "Trade Added",
        description: `New trade created successfully.`
      });
      setNewTrade('');
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create trade. Please try again.",
        variant: "destructive"
      });
    }
  });

  const addNewTrade = () => {
    if (newTrade.trim() && !predefinedTrades.includes(newTrade.trim())) {
      createTradeMutation.mutate(newTrade.trim());
    } else if (predefinedTrades.includes(newTrade.trim())) {
      toast({ 
        title: "Trade already exists", 
        description: `${newTrade.trim()} is already in the trade list.`,
        variant: "destructive"
      });
    }
  };

  // Delete trade mutation
  const deleteTradeMutation = useMutation({
    mutationFn: (tradeName: string) => {
      const tradeToDelete = apiTrades.find(t => t.name === tradeName);
      if (!tradeToDelete) throw new Error('Trade not found');
      return apiRequest(`/api/trades/${tradeToDelete.id}`, { method: 'DELETE' });
    },
    onSuccess: (_, tradeName) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trades'] });
      toast({ 
        title: "Trade removed", 
        description: `${tradeName} has been removed from trade types.` 
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove trade. Please try again.",
        variant: "destructive"
      });
    }
  });

  const removeTrade = (tradeToRemove: string) => {
    deleteTradeMutation.mutate(tradeToRemove);
  };

  const handleCreateSubcontractor = () => {
    if (!newSubcontractorData.name.trim()) {
      toast({ 
        title: "Name required", 
        description: "Please enter a name for the subcontractor.",
        variant: "destructive"
      });
      return;
    }

    createSubcontractorMutation.mutate(newSubcontractorData);
  };

  const calculateTotalCost = () => {
    const categories = form.watch('categories');
    return categories.reduce((total, category) => 
      total + category.items.reduce((catTotal, item) => {
        const baseCost = parseFloat(String(item.estimatedCost)) || 0;
        const markupAmount = baseCost * ((parseFloat(String(item.markup)) || 0) / 100);
        const contingencyAmount = (baseCost + markupAmount) * ((parseFloat(String(item.contingency)) || 0) / 100);
        return catTotal + baseCost + markupAmount + contingencyAmount;
      }, 0), 0
    );
  };

  const calculateTotalDuration = () => {
    const categories = form.watch('categories');
    return categories.reduce((total, category) => 
      total + category.items.reduce((catTotal, item) => Math.max(catTotal, parseFloat(String(item.duration)) || 0), 0), 0
    );
  };

  // Copy estimate from existing
  const copyEstimate = (sourceEstimate: any) => {
    try {
      const sourceProject = allProjects.find((p: any) => p.id === sourceEstimate.projectId);
      const projectName = sourceProject?.name || 'Unknown Project';
      
      // Processing operation
      // Development logging removed
      
      // Parse the estimate data - it's stored in the 'categories' field directly
      let categories = [];
      if (sourceEstimate.categories && Array.isArray(sourceEstimate.categories)) {
        // Development logging removed
        // Map the existing categories structure to our form schema
        categories = sourceEstimate.categories.map((category: any, index: number) => {
          // Development logging removed
          return {
            categoryName: category.name || category.categoryName || 'Unnamed Category',
            items: (category.items || []).map((item: any, itemIndex: number) => {
              // Development logging removed
              return {
                title: item.title || item.name || '',
                trade: item.trade || '',
                vendor: '', // Don't copy vendor - start fresh
                description: item.description || '',
                estimatedCost: item.estimatedCost || 0,
                markup: item.markup || 0,
                contingency: item.contingency || 0,
                duration: item.duration || 1,
                costType: item.costType || 'subcontractor',
                status: 'Estimating', // Always set to estimating
                files: [] // Reset files
              };
            })
          };
        });
        // Success operation completed
      } else if (sourceEstimate.notes) {
        // Fallback: try parsing from notes field for backward compatibility
        try {
          const parsedNotes = JSON.parse(sourceEstimate.notes);
          // Development logging removed
          
          if (Array.isArray(parsedNotes)) {
            categories = parsedNotes.map((category: any) => ({
              categoryName: category.categoryName || category.name || 'Unnamed Category',
              items: (category.items || []).map((item: any) => ({
                title: item.title || item.name || '',
                trade: item.trade || '',
                vendor: '', // Don't copy vendor - start fresh
                description: item.description || '',
                estimatedCost: item.estimatedCost || 0,
                markup: item.markup || 0,
                contingency: item.contingency || 0,
                duration: item.duration || 1,
                costType: item.costType || 'subcontractor',
                status: 'Estimating', // Always set to estimating
                files: []
              }))
            }));
          }
        } catch (parseError) {
          console.warn('❌ Failed to parse from notes field:', parseError);
        }
      }
      
      // Final fallback if no categories found
      if (categories.length === 0) {
        // Development logging removed
        categories = [{
          categoryName: 'Imported Category',
          items: [{
            title: sourceEstimate.name || 'Imported Item',
            trade: sourceEstimate.trade || '',
            vendor: '', // Don't copy vendor - start fresh
            description: sourceEstimate.description || '',
            estimatedCost: sourceEstimate.totalCost || 0,
            markup: 0,
            contingency: 0,
            duration: sourceEstimate.totalDuration || 1,
            costType: 'subcontractor',
            status: 'Estimating', // Always set to estimating
            files: []
          }]
        }];
      }

      // Ensure we have at least one category with one item
      if (categories.length === 0) {
        categories = [{
          categoryName: 'Default Category',
          items: [{
            trade: '',
            vendor: '',
            description: '',
            estimatedCost: 0,
            markup: 0,
            contingency: 0,
            duration: 1,
            status: 'Estimating', // Always default
            files: []
          }]
        }];
      }

      // Target operation completed

      // Set form values with copied data
      form.setValue('name', `Copy of ${sourceEstimate.name || sourceEstimate.trade}`);
      form.setValue('description', `Copied from ${projectName} - ${sourceEstimate.description || ''}`);
      form.setValue('categories', categories);

      setCopyDialogOpen(false);
      setSearchTerm('');
      
      const totalItems = categories.reduce((sum: number, cat: any) => sum + (cat.items?.length || 0), 0);
      toast({
        title: "Estimate Copied Successfully",
        description: `Copied ${categories.length} categories with ${totalItems} items total from "${sourceEstimate.name || sourceEstimate.trade}"`,
      });
    } catch (error) {
      console.error('Error copying estimate:', error);
      toast({
        title: "Copy Failed",
        description: "Failed to copy estimate. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Add the missing copyFromEstimate function reference
  const copyFromEstimate = copyEstimate;

  return (
    <div className="space-y-6">
      {/* Header section with copy button */}
      <div className="flex items-center justify-between pb-4 border-b">
        <div className="space-y-1">
          <div className="text-sm text-muted-foreground">
            Build a comprehensive estimate with multiple categories and line items
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setCopyDialogOpen(true)}
          className="flex items-center gap-2"
        >
          <Copy className="h-4 w-4" />
          Copy from Existing
        </Button>
      </div>
      


      <div>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(
              (data) => {
                toast({ title: "Success", description: "Submitting estimate..." });
                createEstimateMutation.mutate(data);
              },
              (errors) => {
                toast({ 
                  title: "Form Validation Error", 
                  description: "Please fill in all required fields marked with *", 
                  variant: "destructive" 
                });
              }
            )} className="space-y-6">
              
              {/* Estimate Header */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1">
                        Estimate Name
                        <span className="text-red-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="Q4 2024 Construction Estimate (required)" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="space-y-2">
                  <div className="text-sm font-medium">Total Summary</div>
                  <div className="flex gap-4 text-sm">
                    <Badge variant="outline" className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      ${calculateTotalCost().toLocaleString()}
                    </Badge>
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {calculateTotalDuration()} days
                    </Badge>
                  </div>
                </div>
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Overall project scope and notes..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Categories */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold flex items-center gap-1">
                    Estimate Categories
                    <span className="text-red-500">*</span>
                  </h3>
                  <div className="text-sm text-gray-600">
                    At least one category with items required
                  </div>
                </div>

                {categoryFields.map((categoryField, categoryIndex) => (
                  <CategorySection
                    key={categoryField.id}
                    categoryIndex={categoryIndex}
                    form={form}
                    isOpen={openCategories[categoryIndex] ?? true}
                    onToggle={() => toggleCategory(categoryIndex)}
                    onRemove={() => removeCategory(categoryIndex)}
                    canRemove={categoryFields.length > 1}
                    predefinedTrades={predefinedTrades}
                    predefinedVendors={predefinedVendors}
                    subcontractors={subcontractors}
                  />
                ))}

                {/* Add Category Button - positioned below existing categories */}
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={addCategory}
                  className="w-full mt-4"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Category
                </Button>
              </div>

              {/* Trade and Vendor Management */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center justify-between">
                      Trade Management
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm"
                        onClick={() => setTradeManagerOpen(true)}
                      >
                        <Settings className="mr-2 h-4 w-4" />
                        Manage Trades
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-gray-600">
                      {predefinedTrades.length} trade types available
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Vendor & Subcontractor Management</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {showNewVendorInput ? (
                      <div className="flex gap-2">
                        <Input
                          placeholder="Enter new vendor name"
                          value={newVendor}
                          onChange={(e) => setNewVendor(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && addNewVendor()}
                        />
                        <Button type="button" onClick={addNewVendor} size="sm">
                          Add
                        </Button>
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm"
                          onClick={() => setShowNewVendorInput(false)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm"
                          onClick={() => setShowNewVendorInput(true)}
                          className="w-full"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Add New Vendor
                        </Button>
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm"
                          onClick={() => setShowNewSubcontractorDialog(true)}
                          className="w-full"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Add New Subcontractor
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Submit */}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => form.reset()}>
                  Reset
                </Button>
                <Button 
                  type="submit" 
                  disabled={createEstimateMutation.isPending}
                >
                  <Save className="mr-2 h-4 w-4" />
                  Save Estimate
                </Button>
              </div>
            </form>
          </Form>
      </div>

      {/* Copy Existing Estimate Dialog */}
      <Dialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="h-5 w-5" />
              Copy from Existing Estimate
            </DialogTitle>
            <DialogDescription>
              Choose an estimate from any project to copy its structure and details.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-col space-y-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search estimates by name or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Estimates List */}
            <div className="border rounded-lg max-h-96 overflow-y-auto">
              {filteredEstimates.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <FileText className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                  <p className="text-lg font-medium mb-2">No estimates found</p>
                  <p className="text-sm">
                    {searchTerm 
                      ? "Try adjusting your search terms" 
                      : "No estimates available to copy"}
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {filteredEstimates.map((estimate: any) => {
                    const sourceProject = allProjects.find((p: any) => p.id === estimate.projectId);
                    const projectName = sourceProject?.name || 'Unknown Project';
                    
                    let categories = [];
                    let totalCost = estimate.totalCost || estimate.estimatedAmount || 0;
                    
                    try {
                      if (typeof estimate.categories === 'string') {
                        categories = JSON.parse(estimate.categories);
                      } else {
                        categories = estimate.categories || [];
                      }
                    } catch (e) {
                      console.warn('Failed to parse categories for estimate:', estimate.id);
                    }

                    return (
                      <div 
                        key={estimate.id}
                        className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => copyEstimate(estimate)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-medium text-lg">
                                {estimate.name || estimate.trade || 'Unnamed Estimate'}
                              </h3>
                              <Badge variant="outline" className="flex items-center gap-1">
                                <Building2 className="h-3 w-3" />
                                {projectName}
                              </Badge>
                              {estimate.projectId === parseInt(projectId) && (
                                <Badge variant="secondary">Current Project</Badge>
                              )}
                            </div>
                            
                            {estimate.description && (
                              <p className="text-sm text-gray-600 mb-2">
                                {estimate.description}
                              </p>
                            )}
                            
                            <div className="flex items-center gap-4 text-sm text-gray-500">
                              <span className="flex items-center gap-1">
                                <DollarSign className="h-3 w-3" />
                                ${totalCost.toLocaleString()}
                              </span>
                              <span>{categories.length} categories</span>
                              <span>
                                {categories.reduce((total: number, cat: any) => 
                                  total + (cat.items?.length || 0), 0
                                )} items
                              </span>
                            </div>
                          </div>
                          
                          <Button variant="outline" size="sm">
                            <Copy className="h-4 w-4 mr-2" />
                            Copy
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyDialogOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Trade Management Dialog */}
      <Dialog open={tradeManagerOpen} onOpenChange={setTradeManagerOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Manage Trade Types
            </DialogTitle>
            <DialogDescription>
              Add or remove trade types for your estimates. These will be saved and available for all estimates.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Add New Trade */}
            <div className="flex gap-2">
              <Input
                placeholder="Enter new trade type (e.g., Demolition, Roofing)"
                value={newTrade}
                onChange={(e) => setNewTrade(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addNewTrade()}
              />
              <Button type="button" onClick={addNewTrade} disabled={!newTrade.trim() || predefinedTrades.includes(newTrade.trim())}>
                <Plus className="mr-2 h-4 w-4" />
                Add Trade
              </Button>
            </div>

            {/* Current Trades List */}
            <div className="border rounded-lg p-4 max-h-64 overflow-y-auto">
              <h4 className="font-medium mb-3">Current Trade Types ({predefinedTrades.length})</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {predefinedTrades.map((trade) => (
                  <div key={trade} className="flex items-center justify-between p-2 bg-gray-50 rounded border">
                    <span className="text-sm">{trade}</span>
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="sm"
                      onClick={() => removeTrade(trade)}
                      disabled={trade === 'Other'} // Prevent removing "Other" trade
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" onClick={() => setTradeManagerOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add New Subcontractor Dialog */}
      <Dialog open={showNewSubcontractorDialog} onOpenChange={setShowNewSubcontractorDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add New Subcontractor
            </DialogTitle>
            <DialogDescription>
              Create a new subcontractor contact that will be available across all projects.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="John Smith"
                  value={newSubcontractorData.name}
                  onChange={(e) => setNewSubcontractorData(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Company Name</label>
                <Input
                  placeholder="ABC Construction LLC"
                  value={newSubcontractorData.company}
                  onChange={(e) => setNewSubcontractorData(prev => ({ ...prev, company: e.target.value }))}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <Input
                  type="email"
                  placeholder="john@abcconstruction.com"
                  value={newSubcontractorData.email}
                  onChange={(e) => setNewSubcontractorData(prev => ({ ...prev, email: e.target.value }))}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Phone</label>
                <Input
                  placeholder="(555) 123-4567"
                  value={newSubcontractorData.phone}
                  onChange={(e) => setNewSubcontractorData(prev => ({ ...prev, phone: e.target.value }))}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Primary Trade</label>
                <Select
                  value={newSubcontractorData.trade}
                  onValueChange={(value) => setNewSubcontractorData(prev => ({ ...prev, trade: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select primary trade" />
                  </SelectTrigger>
                  <SelectContent>
                    {predefinedTrades.map((trade) => (
                      <SelectItem key={trade} value={trade}>
                        {trade}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowNewSubcontractorDialog(false)}
              disabled={createSubcontractorMutation.isPending}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreateSubcontractor}
              disabled={createSubcontractorMutation.isPending || !newSubcontractorData.name.trim()}
            >
              {createSubcontractorMutation.isPending ? "Adding..." : "Add Subcontractor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface CategorySectionProps {
  categoryIndex: number;
  form: any;
  isOpen: boolean;
  onToggle: () => void;
  onRemove: () => void;
  canRemove: boolean;
  predefinedTrades: string[];
  predefinedVendors: string[];
  subcontractors: any[];
}

function CategorySection({ categoryIndex, form, isOpen, onToggle, onRemove, canRemove, predefinedTrades, predefinedVendors, subcontractors }: CategorySectionProps) {
  const { fields: itemFields, append: appendItem, remove: removeItem } = useFieldArray({
    control: form.control,
    name: `categories.${categoryIndex}.items`,
  });
  
  // Initialize all items as collapsed by default
  const [openItems, setOpenItems] = useState<Record<number, boolean>>(() => {
    const initialOpenState: Record<number, boolean> = {};
    for (let i = 0; i < itemFields.length; i++) {
      initialOpenState[i] = false;
    }
    return initialOpenState;
  });

  // Update openItems when itemFields change (e.g., when loading existing data)
  useEffect(() => {
    const newOpenState: Record<number, boolean> = {};
    for (let i = 0; i < itemFields.length; i++) {
      newOpenState[i] = openItems[i] !== undefined ? openItems[i] : false; // Default to collapsed
    }
    setOpenItems(newOpenState);
  }, [itemFields.length]);

  const toggleItem = (itemIndex: number) => {
    setOpenItems(prev => ({
      ...prev,
      [itemIndex]: !prev[itemIndex]
    }));
  };

  const addItem = () => {
    const newItemIndex = itemFields.length;
    appendItem({
      title: '',
      trade: '',
      vendor: '',
      description: '',
      estimatedCost: 0,
      markup: 0,
      contingency: 0,
      duration: 1,
      status: 'Estimating',
      files: [],
    });
    // Set the new item as collapsed by default
    setOpenItems(prev => ({
      ...prev,
      [newItemIndex]: false
    }));
  };

  const categoryData = form.watch(`categories.${categoryIndex}`);
  const categoryTotal = categoryData.items.reduce((total: number, item: any) => {
    const baseCost = parseFloat(String(item.estimatedCost)) || 0;
    const markupAmount = baseCost * ((parseFloat(String(item.markup)) || 0) / 100);
    const contingencyAmount = (baseCost + markupAmount) * ((parseFloat(String(item.contingency)) || 0) / 100);
    return total + baseCost + markupAmount + contingencyAmount;
  }, 0);

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={onToggle}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-gray-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <FormField
                  control={form.control}
                  name={`categories.${categoryIndex}.categoryName`}
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormControl>
                        <Input 
                          placeholder="Category Name (e.g., Framing) *REQUIRED*" 
                          {...field}
                          className="border-none shadow-none p-0 font-semibold text-base"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  ${categoryTotal.toLocaleString()}
                </Badge>
                <Badge variant="outline">
                  {itemFields.length} items
                </Badge>
                {canRemove && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="space-y-4">
            {itemFields.map((itemField, itemIndex) => (
              <ItemSection
                key={itemField.id}
                categoryIndex={categoryIndex}
                itemIndex={itemIndex}
                form={form}
                onRemove={() => removeItem(itemIndex)}
                canRemove={itemFields.length > 1}
                predefinedTrades={predefinedTrades}
                predefinedVendors={predefinedVendors}
                subcontractors={subcontractors}
                isOpen={openItems[itemIndex] || false}
                onToggle={() => toggleItem(itemIndex)}
              />
            ))}
            
            <Button type="button" variant="outline" onClick={addItem} className="w-full">
              <Plus className="mr-2 h-4 w-4" />
              Add Item to {categoryData.categoryName || 'Category'}
            </Button>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

interface ItemSectionProps {
  categoryIndex: number;
  itemIndex: number;
  form: any;
  onRemove: () => void;
  canRemove: boolean;
  predefinedTrades: string[];
  predefinedVendors: string[];
  subcontractors: any[];
  isOpen: boolean;
  onToggle: () => void;
}

function ItemSection({ categoryIndex, itemIndex, form, onRemove, canRemove, predefinedTrades, predefinedVendors, subcontractors, isOpen, onToggle }: ItemSectionProps) {
  const itemData = form.watch(`categories.${categoryIndex}.items.${itemIndex}`);
  const baseCost = parseFloat(itemData?.estimatedCost) || 0;
  const markupAmount = baseCost * ((parseFloat(itemData?.markup) || 0) / 100);
  const contingencyAmount = (baseCost + markupAmount) * ((parseFloat(itemData?.contingency) || 0) / 100);
  const totalCost = baseCost + markupAmount + contingencyAmount;

  return (
    <Card className="border-l-4 border-l-theme-primary">
      <Collapsible open={isOpen} onOpenChange={onToggle}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-gray-50 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1">
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <FormField
                  control={form.control}
                  name={`categories.${categoryIndex}.items.${itemIndex}.title`}
                  render={({ field }) => (
                    <FormControl>
                      <Input 
                        {...field}
                        placeholder="Enter item title... *REQUIRED*"
                        className="border-none shadow-none p-2 font-medium text-sm text-gray-700 bg-transparent focus-visible:ring-0"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </FormControl>
                  )}
                />
              </div>
              <div className="flex items-center gap-2">
                {totalCost > 0 && (
                  <Badge variant="secondary">
                    ${totalCost.toLocaleString()}
                  </Badge>
                )}
                {canRemove && (
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm" 
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0">

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <FormField
              control={form.control}
              name={`categories.${categoryIndex}.items.${itemIndex}.trade`}
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel className="flex items-center gap-1 text-sm font-medium">
                    Trade
                    <span className="text-red-500">*</span>
                  </FormLabel>
                  <FormControl>
                    <TradeTypeComboBox
                      value={field.value || ''}
                      onValueChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name={`categories.${categoryIndex}.items.${itemIndex}.vendor`}
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel className="text-sm font-medium">Vendor/Subcontractor</FormLabel>
                  <FormControl>
                    <SubcontractorComboBox
                      subcontractors={subcontractors}
                      value={field.value || ''}
                      onValueChange={field.onChange}
                      placeholder="Search and select vendor..."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

        <FormField
          control={form.control}
          name={`categories.${categoryIndex}.items.${itemIndex}.costType`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cost Type</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || ''}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select cost type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="subcontractor">Subcontractor</SelectItem>
                  <SelectItem value="materials">Materials</SelectItem>
                  <SelectItem value="labor">Labor</SelectItem>
                  <SelectItem value="equipment">Equipment</SelectItem>
                  <SelectItem value="permits">Permits</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name={`categories.${categoryIndex}.items.${itemIndex}.description`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description of Work (Optional)</FormLabel>
              <FormControl>
                <Textarea placeholder="Optional: Detailed description of the work to be performed..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name={`categories.${categoryIndex}.items.${itemIndex}.estimatedCost`}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1">
                  Base Cost ($)
                  <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input 
                    type="number" 
                    placeholder="0"
                    value={field.value || ''}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    disabled={false}
                    className="bg-white"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name={`categories.${categoryIndex}.items.${itemIndex}.duration`}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1">
                  Duration (Days)
                  <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input type="number" placeholder="0" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name={`categories.${categoryIndex}.items.${itemIndex}.status`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value || 'Estimating'}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="Estimating">Estimating</SelectItem>
                    <SelectItem value="Bidding">Bidding</SelectItem>
                    <SelectItem value="Waiting Approval">Waiting Approval</SelectItem>
                    <SelectItem value="Approved">Approved</SelectItem>
                    <SelectItem value="Rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name={`categories.${categoryIndex}.items.${itemIndex}.markup`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Markup (%)</FormLabel>
                <FormControl>
                  <Input 
                    type="number"
                    inputMode="numeric"
                    placeholder="0" 
                    value={field.value || ''}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    disabled={false}
                    className="bg-white"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name={`categories.${categoryIndex}.items.${itemIndex}.contingency`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contingency (%)</FormLabel>
                <FormControl>
                  <Input 
                    type="number"
                    inputMode="numeric"
                    placeholder="0" 
                    value={field.value || ''}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    disabled={false}
                    className="bg-white"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

            {/* File Upload Section */}
            <div className="space-y-2">
              <FormLabel>File Attachments (Max 3)</FormLabel>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                <p className="text-sm text-gray-600">
                  Drag and drop files here, or click to browse
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Supports PDF, DOCX, JPG, PNG (Max 50MB per file)
                </p>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
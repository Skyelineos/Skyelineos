import React, { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { SubcontractorComboBox } from '@/components/ui/subcontractor-combobox';
import { TradeTypeComboBox } from '@/components/contacts/TradeTypeComboBox';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, X, Upload, FileText, Eye, Trash2, Paperclip } from 'lucide-react';

const editItemSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  trade: z.string().min(1, 'Trade type is required'),
  description: z.string().optional(),
  estimatedCost: z.number().min(0, 'Cost must be non-negative'),
  markup: z.number().min(0, 'Markup must be non-negative'),
  contingency: z.number().min(0, 'Contingency must be non-negative'),
  vendor: z.string().optional(),
  duration: z.number().min(1, 'Duration must be at least 1 day'),
  status: z.string(),
  costType: z.enum(['subcontractor', 'materials', 'labor', 'equipment', 'other']),
  requiresBid: z.boolean().optional().default(true),
  notes: z.string().optional(),
});

type EditItemFormData = z.infer<typeof editItemSchema>;

interface EditEstimateItemDialogProps {
  item: any;
  isOpen: boolean;
  onClose: () => void;
  onSave?: () => void;
}

const statusOptions = [
  { value: 'Not Started', label: 'Not Started' },
  { value: 'Actively Bidding', label: 'Actively Bidding' },
  { value: 'Bids Received', label: 'Bids Received' },
  { value: 'Jobs Awarded', label: 'Jobs Awarded' },
  { value: 'Waiting Approval', label: 'Waiting Approval' },
  { value: 'Approved', label: 'Approved' },
];

const costTypeOptions = [
  { value: 'subcontractor', label: 'Subcontractor' },
  { value: 'materials', label: 'Materials' },
  { value: 'labor', label: 'Labor' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'other', label: 'Other' },
];

export function EditEstimateItemDialog({ item, isOpen, onClose, onSave }: EditEstimateItemDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedVendorId, setSelectedVendorId] = useState<string>('');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [existingFiles, setExistingFiles] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Fetch subcontractors for vendor selection
  const { data: allContacts = [] } = useQuery<any[]>({
    queryKey: ['/api/contacts'],
    enabled: isOpen,
  });

  const subcontractors = allContacts.filter((contact: any) => contact.role === 'subcontractor');
  
  const form = useForm<EditItemFormData>({
    resolver: zodResolver(editItemSchema),
    defaultValues: {
      title: '',
      trade: '',
      description: '',
      estimatedCost: 0,
      markup: 0,
      contingency: 0,
      vendor: '',
      duration: 1,
      status: 'Not Started',
      costType: 'subcontractor',
      requiresBid: true,
      notes: '',
    },
  });

  // Track if form has been initialized to prevent continuous resets
  const [formInitialized, setFormInitialized] = useState(false);

  // Reset form when item changes (only once per dialog open)
  useEffect(() => {
    if (item && isOpen && !formInitialized) {
      // Processing operation
      form.reset({
        title: item.title || '',
        trade: item.trade || '',
        description: item.description || '',
        estimatedCost: Number(item.estimatedCost) || 0,
        markup: Number(item.markup) || 0,
        contingency: Number(item.contingency) || 0,
        vendor: item.vendor || '',
        duration: Number(item.duration) || 1,
        status: item.status || 'Not Started',
        costType: item.costType || 'subcontractor',
        requiresBid: item.requiresBid !== undefined ? item.requiresBid : true,
        notes: item.notes || '',
      });

      // Set selected vendor ID based on vendor name
      if (item.vendor && subcontractors.length > 0) {
        const matchingSubcontractor = subcontractors.find((sub: any) => {
          // Try exact company name match first
          if (sub.company && sub.company.toLowerCase() === item.vendor.toLowerCase()) {
            return true;
          }
          // Try exact name match
          if (sub.name && sub.name.toLowerCase() === item.vendor.toLowerCase()) {
            return true;
          }
          return false;
        });
        setSelectedVendorId(matchingSubcontractor ? matchingSubcontractor.id.toString() : '');
      } else {
        setSelectedVendorId('');
      }

      // Load existing files
      setExistingFiles(item.files || []);
      setAttachedFiles([]);
      setFormInitialized(true);
    }
  }, [item, isOpen, subcontractors, formInitialized, form]);

  // Reset form initialized flag when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setFormInitialized(false);
    }
  }, [isOpen]);

  // File upload mutation
  const uploadFilesMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      files.forEach(file => {
        formData.append('files', file);
      });
      formData.append('type', 'estimate_item');
      formData.append('targetId', item.id);
      formData.append('description', `Files for ${item.title || item.trade}`);

      return await apiRequest('/api/documents/upload', 'POST', formData);
    },
    onSuccess: (response) => {
      toast({
        title: 'Files Uploaded',
        description: `${attachedFiles.length} file(s) uploaded successfully.`,
      });
      // Convert uploaded documents to the file format expected by estimate items
      const convertedFiles = response.documents?.map((doc: any) => ({
        id: doc.id,
        filename: doc.fileName,
        originalFileName: doc.originalFileName,
        fileUrl: doc.fileUrl,
        fileSize: doc.fileSize,
        name: doc.originalFileName,
        url: doc.fileUrl,
        path: doc.fileUrl
      })) || [];
      
      setExistingFiles(prev => [...prev, ...convertedFiles]);
      setAttachedFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Upload Failed',
        description: error.message || 'Failed to upload files',
        variant: 'destructive',
      });
    },
  });

  // Update estimate item mutation
  const updateItemMutation = useMutation({
    mutationFn: async (data: EditItemFormData) => {
      // Find selected subcontractor name for vendor field
      const selectedSubcontractor = subcontractors.find((sub: any) => 
        sub.id.toString() === selectedVendorId
      );
      const vendorName = selectedSubcontractor ? 
        (selectedSubcontractor.company || selectedSubcontractor.name) : 
        data.vendor;

      // First upload any new files
      if (attachedFiles.length > 0) {
        await uploadFilesMutation.mutateAsync(attachedFiles);
      }

      // Processing operation
      
      return await apiRequest('PATCH', `/api/estimate-items/${item.id}`, {
        ...data,
        vendor: vendorName,
        vendorId: selectedVendorId || undefined,
        id: item.id,
        estimateId: item.estimateId,
        files: existingFiles, // Include existing files in the update
      });
    },
    onSuccess: () => {
      toast({
        title: 'Item Updated',
        description: 'Estimate item has been updated successfully.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/estimates'] });
      onSave?.();
      onClose();
    },
    onError: (error: any) => {
      console.error('❌ Error updating item:', error);
      toast({
        title: 'Update Failed',
        description: error.message || 'Failed to update estimate item',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: EditItemFormData) => {
    updateItemMutation.mutate(data);
  };

  // Watch form values for real-time total calculation
  const watchedValues = form.watch(['estimatedCost', 'markup', 'contingency']);
  
  const calculateTotal = () => {
    const baseCost = watchedValues[0] || 0;
    const markup = watchedValues[1] || 0;
    const contingency = watchedValues[2] || 0;
    const withMarkup = baseCost * (1 + markup / 100);
    const total = withMarkup * (1 + contingency / 100);
    return total;
  };

  // File handling functions
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setAttachedFiles(prev => [...prev, ...files]);
  };

  const removeAttachedFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const removeExistingFile = (fileId: string) => {
    setExistingFiles(prev => prev.filter(file => file.id !== fileId));
  };

  const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    return <FileText className="h-4 w-4 text-blue-500" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!item) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edit Estimate Item
            <Badge variant="outline">{item.id}</Badge>
          </DialogTitle>
          <DialogDescription>
            Update the details for this estimate item
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Enter item title" 
                        value={field.value || ''}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="trade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trade Type</FormLabel>
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
            </div>

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Detailed description of work to be performed"
                      className="min-h-[80px]"
                      value={field.value || ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Cost Information */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <FormField
                control={form.control}
                name="estimatedCost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Base Cost ($)</FormLabel>
                    <FormControl>
                      <Input 
                        inputMode="decimal"
                        placeholder="0.00"
                        value={field.value?.toString() || ''}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="markup"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Markup (%)</FormLabel>
                    <FormControl>
                      <Input 
                        inputMode="decimal"
                        placeholder="0"
                        value={field.value?.toString() || ''}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contingency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contingency (%)</FormLabel>
                    <FormControl>
                      <Input 
                        inputMode="decimal"
                        placeholder="0"
                        value={field.value?.toString() || ''}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <FormLabel>Total Cost</FormLabel>
                <div className="h-10 px-3 py-2 border rounded-md bg-gray-50 flex items-center font-medium">
                  ${calculateTotal().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            {/* Vendor and Duration */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <FormLabel>Vendor/Subcontractor</FormLabel>
                <SubcontractorComboBox
                  subcontractors={subcontractors}
                  value={selectedVendorId}
                  onValueChange={(value) => {
                    setSelectedVendorId(value);
                    // Also update the form field for consistency
                    const selectedSub = subcontractors.find((sub: any) => 
                      sub.id.toString() === value
                    );
                    if (selectedSub) {
                      form.setValue('vendor', selectedSub.company || selectedSub.name);
                    } else {
                      form.setValue('vendor', '');
                    }
                  }}
                  placeholder="Search and select subcontractor..."
                  showTrade={true}
                />
              </div>

              <FormField
                control={form.control}
                name="duration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (days)</FormLabel>
                    <FormControl>
                      <Input 
                        inputMode="numeric"
                        placeholder="1"
                        value={field.value?.toString() || ''}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="costType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cost Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select cost type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {costTypeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Status and Bidding Controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {statusOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="requiresBid"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        Requires Bid
                      </FormLabel>
                      <p className="text-xs text-muted-foreground">
                        Check this box if this item should go through the bidding process. Uncheck to skip bidding for direct purchase items or internal work.
                      </p>
                    </div>
                  </FormItem>
                )}
              />
            </div>

            {/* File Attachments */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <FormLabel className="text-base font-medium">File Attachments</FormLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2"
                >
                  <Paperclip className="h-4 w-4" />
                  Add Files
                </Button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.dwg"
              />

              {/* Existing Files */}
              {existingFiles.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-700">Existing Files</h4>
                  <div className="grid gap-2">
                    {existingFiles.map((file, index) => (
                      <div key={file.id || index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                        <div className="flex items-center gap-3">
                          {getFileIcon(file.originalFileName || file.filename)}
                          <div>
                            <p className="text-sm font-medium">{file.originalFileName || file.filename}</p>
                            {file.fileSize && (
                              <p className="text-xs text-gray-500">{formatFileSize(file.fileSize)}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(file.fileUrl || file.path, '_blank')}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeExistingFile(file.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* New Files to Upload */}
              {attachedFiles.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-700">Files to Upload</h4>
                  <div className="grid gap-2">
                    {attachedFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="flex items-center gap-3">
                          {getFileIcon(file.name)}
                          <div>
                            <p className="text-sm font-medium">{file.name}</p>
                            <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeAttachedFile(index)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {existingFiles.length === 0 && attachedFiles.length === 0 && (
                <div className="text-center py-6 border-2 border-dashed border-gray-300 rounded-lg">
                  <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No files attached</p>
                  <p className="text-xs text-gray-400">Click "Add Files" to attach documents</p>
                </div>
              )}
            </div>

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Additional notes or special instructions"
                      className="min-h-[60px]"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={updateItemMutation.isPending}
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateItemMutation.isPending}
              >
                {updateItemMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Changes
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SubcontractorComboBox } from '@/components/ui/subcontractor-combobox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, X, FileText, Image, File, Plus, Check, ChevronsUpDown } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

const manualBidSchema = z.object({
  estimateItemId: z.string().min(1, 'Please select an estimate item'),
  subcontractorId: z.string().min(1, 'Please select a subcontractor'),
  bidAmount: z.number().min(0, 'Bid amount must be positive'),
  daysToComplete: z.number().min(1, 'Days to complete must be at least 1'),
  bidNotes: z.string().optional(),
  submissionDate: z.string().min(1, 'Submission date is required'),
});

type ManualBidFormData = z.infer<typeof manualBidSchema>;

interface ManualBidFormProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  estimateItems: any[];
}

export function ManualBidForm({ isOpen, onClose, projectId, estimateItems }: ManualBidFormProps) {
  // Development logging removed
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [attachments, setAttachments] = useState<File[]>([]);
  const [showNewSubcontractorForm, setShowNewSubcontractorForm] = useState(false);

  // Fetch contacts for subcontractor selection
  const { data: contacts = [], isLoading: contactsLoading, error: contactsError } = useQuery({
    queryKey: ['/api/contacts'],
    queryFn: async () => {
      // Component lifecycle tracked
      const response = await apiRequest('/api/contacts', 'GET');
      // Component lifecycle tracked
      const subcontractors = response.filter((contact: any) => contact.role === 'subcontractor');
      // Component lifecycle tracked => ({ name: s.name, company: s.company, trade: s.trade })));
      return subcontractors;
    }
  });

  // Component lifecycle tracked

  const form = useForm<ManualBidFormData>({
    resolver: zodResolver(manualBidSchema),
    defaultValues: {
      estimateItemId: '',
      subcontractorId: '',
      bidAmount: 0,
      daysToComplete: 1,
      bidNotes: '',
      submissionDate: new Date().toISOString().split('T')[0],
    },
  });

  const createManualBidMutation = useMutation({
    mutationFn: async (data: ManualBidFormData & { attachments: File[] }) => {
      // Create FormData for file upload
      const formData = new FormData();
      formData.append('projectId', projectId.toString());
      formData.append('estimateItemId', data.estimateItemId);
      formData.append('subcontractorId', data.subcontractorId);
      formData.append('bidAmount', data.bidAmount.toString());
      formData.append('daysToComplete', data.daysToComplete.toString());
      formData.append('bidNotes', data.bidNotes || '');
      formData.append('submissionDate', data.submissionDate);
      formData.append('isManualBid', 'true');

      // Add attachments
      data.attachments.forEach((file, index) => {
        formData.append(`attachments`, file);
      });

      const response = await fetch('/api/manual-bids', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('🔧 Manual bid creation failed:', response.status, errorData);
        throw new Error(`Failed to create manual bid: ${response.status} ${errorData}`);
      }

      return response.json();
    },
    onSuccess: (result) => {
      // Component lifecycle tracked
      toast({
        title: "Manual Bid Created",
        description: "The manual bid has been successfully recorded.",
      });
      
      // Invalidate relevant queries - including project-specific queries
      queryClient.invalidateQueries({ queryKey: ['/api/bid-responses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/bid-responses/project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['/api/bid-responses/project'] });
      queryClient.invalidateQueries({ queryKey: ['/api/estimates'] });
      queryClient.invalidateQueries({ queryKey: ['/api/bid-processes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/bid-invitations'] });
      
      // Reset form and close dialog
      form.reset();
      setAttachments([]);
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error Creating Manual Bid",
        description: error.message || "Failed to create manual bid. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const validFiles = files.filter(file => {
      const isValidType = file.type.includes('pdf') || file.type.includes('image') || file.type.includes('document');
      const isValidSize = file.size <= 10 * 1024 * 1024; // 10MB limit
      return isValidType && isValidSize;
    });

    if (validFiles.length !== files.length) {
      toast({
        title: "Invalid Files",
        description: "Some files were skipped. Only PDF, image, and document files under 10MB are allowed.",
        variant: "destructive",
      });
    }

    setAttachments(prev => [...prev, ...validFiles]);
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.includes('pdf')) return <FileText className="w-4 h-4" />;
    if (fileType.includes('image')) return <Image className="w-4 h-4" />;
    return <File className="w-4 h-4" />;
  };

  const onSubmit = (data: ManualBidFormData) => {
    // Component lifecycle tracked
    // Component lifecycle tracked
    // Component lifecycle tracked
    createManualBidMutation.mutate({ ...data, attachments });
  };

  const selectedEstimateItem = estimateItems.find(item => item.id === form.watch('estimateItemId'));

  // Component lifecycle tracked

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Manual Bid</DialogTitle>
          <DialogDescription>
            Record a bid that was submitted outside the system (phone call, email, in-person, etc.)
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Estimate Item Selection - Searchable */}
            <FormField
              control={form.control}
              name="estimateItemId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estimate Item *</FormLabel>
                  <FormControl>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className="w-full justify-between h-auto min-h-[40px] p-3"
                        >
                          {field.value ? (
                            <div className="flex items-center justify-between w-full">
                              <div className="flex flex-col items-start">
                                <span className="font-medium text-left">
                                  {estimateItems.find(item => item.id === field.value)?.title || 
                                   estimateItems.find(item => item.id === field.value)?.description || 
                                   'Selected Item'}
                                </span>
                                <span className="text-sm text-gray-500">
                                  {estimateItems.find(item => item.id === field.value)?.trade}
                                </span>
                              </div>
                              <Badge variant="outline" className="text-xs ml-2">
                                ${(estimateItems.find(item => item.id === field.value)?.cost || 
                                   estimateItems.find(item => item.id === field.value)?.estimatedCost || 0).toLocaleString()}
                              </Badge>
                            </div>
                          ) : (
                            "Search and select estimate item..."
                          )}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0" style={{ width: 'var(--radix-popover-trigger-width)' }}>
                        <Command>
                          <CommandInput placeholder="Search estimate items..." />
                          <CommandEmpty>No estimate item found.</CommandEmpty>
                          <CommandGroup className="max-h-64 overflow-y-auto">
                            {estimateItems.map((item: any) => (
                              <CommandItem
                                key={item.id}
                                value={`${item.title || item.description || ''} ${item.trade || ''}`}
                                onSelect={() => {
                                  field.onChange(item.id);
                                }}
                                className="p-3"
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    field.value === item.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <div className="flex items-center justify-between w-full">
                                  <div className="flex flex-col items-start min-w-0 flex-1">
                                    <span className="font-medium truncate w-full">
                                      {item.title || item.description || 'Untitled Item'}
                                    </span>
                                    <span className="text-sm text-gray-500">
                                      {item.trade}
                                    </span>
                                  </div>
                                  <Badge variant="outline" className="text-xs ml-2 flex-shrink-0">
                                    ${(item.cost || item.estimatedCost || 0).toLocaleString()}
                                  </Badge>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Show selected item details */}
            {selectedEstimateItem && (
              <Card className="border-theme-accent/30 bg-theme-accent/10">
                <CardContent className="p-4">
                  <div className="text-sm">
                    <div className="font-medium text-theme-primary mb-1">
                      Selected Item: {selectedEstimateItem.trade || selectedEstimateItem.description}
                    </div>
                    <div className="text-theme-primary">
                      Estimated Cost: ${(selectedEstimateItem.cost || selectedEstimateItem.estimatedCost || 0).toLocaleString()}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Subcontractor Selection */}
            <FormField
              control={form.control}
              name="subcontractorId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subcontractor *</FormLabel>
                  <div className="flex gap-2">
                    <SubcontractorComboBox
                      subcontractors={contacts}
                      value={field.value}
                      onValueChange={field.onChange}
                      placeholder="Select subcontractor who submitted the bid"
                      className="flex-1"
                      showTrade={true}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setShowNewSubcontractorForm(true)}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Bid Amount and Days */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="bidAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bid Amount *</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                        <Input
                          type="number"
                          placeholder="0"
                          className="pl-8"
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="daysToComplete"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Days to Complete *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="1"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Submission Date */}
            <FormField
              control={form.control}
              name="submissionDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Submission Date *</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Bid Notes */}
            <FormField
              control={form.control}
              name="bidNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bid Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Add context about how this bid was received (e.g., 'Submitted via phone call on 1/25/25', 'Email bid received from contractor')"
                      className="min-h-[80px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* File Attachments */}
            <div className="space-y-3">
              <FormLabel>Attachments</FormLabel>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                <div className="text-center">
                  <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                  <div className="text-sm text-gray-600 mb-2">
                    Upload PDFs, images, or documents (Max 10MB each)
                  </div>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="manual-bid-attachments"
                  />
                  <label htmlFor="manual-bid-attachments">
                    <Button type="button" variant="outline" size="sm" asChild>
                      <span>Choose Files</span>
                    </Button>
                  </label>
                </div>
              </div>

              {/* Show attached files */}
              {attachments.length > 0 && (
                <div className="space-y-2">
                  {attachments.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <div className="flex items-center gap-2">
                        {getFileIcon(file.type)}
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
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Form Actions */}
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createManualBidMutation.isPending}
                onClick={() => {
                  // Component lifecycle tracked
                  // Component lifecycle tracked);
                  // Component lifecycle tracked
                  // Component lifecycle tracked
                }}
              >
                {createManualBidMutation.isPending ? 'Creating...' : 'Create Manual Bid'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
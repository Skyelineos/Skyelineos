import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TradeTypeComboBox } from '@/components/contacts/TradeTypeComboBox';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { format } from 'date-fns';
import {
  Users,
  Calendar as CalendarIcon,
  Upload,
  X,
  Building2,
  DollarSign,
  Clock,
  Search,
  UserCheck,
  Briefcase,
  FileText,
  Send
} from 'lucide-react';

interface StartBidModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estimateItem: any;
  projectId: string;
  onBidInvitesSent?: () => void;
}

interface Subcontractor {
  id: number;
  name: string;
  company: string;
  email: string;
  phone: string;
  trade: string;
  role: string;
}

export function StartBidModal({ 
  open, 
  onOpenChange, 
  estimateItem, 
  projectId,
  onBidInvitesSent 
}: StartBidModalProps) {
  const [selectedSubs, setSelectedSubs] = useState<number[]>([]);
  const [selectedTrade, setSelectedTrade] = useState<string>('manual');
  const [searchQuery, setSearchQuery] = useState('');
  const [dueDate, setDueDate] = useState<Date>();
  const [notes, setNotes] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all subcontractors from contacts
  const { data: allContacts = [] } = useQuery({
    queryKey: ['/api/contacts'],
  });

  const subcontractors: Subcontractor[] = allContacts.filter((contact: any) => 
    contact.role === 'subcontractor'
  );

  // Get unique trades from subcontractors
  const availableTrades = [...new Set(subcontractors.map(sub => sub.trade).filter(Boolean))];

  // Filter subcontractors based on search query
  const filteredSubs = subcontractors.filter(sub =>
    sub.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    sub.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
    sub.trade.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Create bid invitation mutation
  const createBidInvitationMutation = useMutation({
    mutationFn: async (invitationData: any) => {
      return await apiRequest('/api/bid-invitations', {
        method: 'POST',
        body: JSON.stringify(invitationData),
      });
    },
    onSuccess: async () => {
      // Target operation completed
      
      // Complete cache removal and invalidation
      await queryClient.removeQueries({ queryKey: ['/api/estimates'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/estimates'] });
      
      // Wait for backend to process updates
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Force fresh fetch from network
      await queryClient.refetchQueries({ 
        queryKey: ['/api/estimates'],
        type: 'active'
      });
      
      // Invalidate other related queries
      await queryClient.invalidateQueries({ queryKey: ['/api/bids', projectId] });
      await queryClient.invalidateQueries({ queryKey: ['/api/bid-processes/project'] });
      
      // Success operation completed
      
      toast({
        title: "Bid Invitations Sent",
        description: `Successfully invited ${selectedSubs.length} subcontractor${selectedSubs.length !== 1 ? 's' : ''} to bid`,
      });
      onBidInvitesSent?.();
      handleClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error Sending Invitations",
        description: error.message || "Failed to send bid invitations. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update estimate status mutation
  const updateEstimateStatusMutation = useMutation({
    mutationFn: async ({ estimateId, itemId }: { estimateId: number; itemId: number }) => {
      return await apiRequest(`/api/estimates/${estimateId}/items/${itemId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'Bidding' }),
      });
    },
    onSuccess: async () => {
      // Force immediate invalidation and refetch of all estimate-related queries
      await queryClient.removeQueries({ queryKey: ['/api/estimates'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/estimates'] });
      await queryClient.refetchQueries({ queryKey: ['/api/estimates'] });
      // Success operation completed
    },
  });

  // Handle trade selection - auto-select all subs with that trade
  const handleTradeSelection = (trade: string) => {
    setSelectedTrade(trade);
    if (trade && trade !== 'manual') {
      const tradeSubIds = subcontractors
        .filter(sub => sub.trade === trade)
        .map(sub => sub.id);
      setSelectedSubs(tradeSubIds);
    } else {
      setSelectedSubs([]);
    }
  };

  // Handle individual sub selection
  const handleSubSelection = (subId: number, checked: boolean) => {
    if (checked) {
      setSelectedSubs(prev => [...prev, subId]);
    } else {
      setSelectedSubs(prev => prev.filter(id => id !== subId));
      // Clear trade selection if manually deselecting
      if (selectedTrade && selectedTrade !== 'manual') {
        setSelectedTrade('manual');
      }
    }
  };

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setAttachments(prev => [...prev, ...files]);
  };

  // Remove attachment
  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // Submit bid invitations
  const handleSubmit = async () => {
    // Development logging removed
    
    if (selectedSubs.length === 0) {
      toast({
        title: "No Subcontractors Selected",
        description: "Please select at least one subcontractor to invite.",
        variant: "destructive",
      });
      return;
    }

    const invitationData = {
      projectId: parseInt(projectId),
      estimateId: estimateItem.estimateId || 1, // Fallback to first estimate
      estimateItemId: estimateItem.id || estimateItem.estimateItemId,
      trade: estimateItem.trade,
      category: estimateItem.category,
      description: estimateItem.description,
      estimatedCost: estimateItem.estimatedCost,
      invitedSubs: selectedSubs,
      dueDate: dueDate?.toISOString(),
      notes,
      attachments: attachments.map(file => file.name), // In real implementation, upload files first
      status: 'Bidding',
      createdAt: new Date().toISOString(),
    };

    // Development logging removed

    try {
      // Development logging removed
      const result = await createBidInvitationMutation.mutateAsync(invitationData);
      // Success operation completed
      
      // Status is already updated by backend during bid invitation creation
      // Success operation completed
      
      // Force complete cache invalidation for all estimate-related queries
      const estimateQueries = [
        ['/api/estimates'],
        ['/api/estimates', projectId],
        ['/api/estimates', estimateItem.estimateId],
      ];
      
      // Remove all estimate queries from cache
      for (const queryKey of estimateQueries) {
        await queryClient.removeQueries({ queryKey });
        await queryClient.invalidateQueries({ queryKey });
      }
      
      // Small delay to ensure backend processing completes
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Force fresh fetch of all estimate data
      await queryClient.refetchQueries({ queryKey: ['/api/estimates'] });
      // Success operation completed
      
      // Show success message and close modal
      toast({
        title: "Bid Invitations Sent Successfully",
        description: `Sent ${selectedSubs.length} bid invitations for ${estimateItem.trade}`,
        variant: "default",
      });
      
      // Trigger parent component refresh callback
      if (onBidInvitesSent) {
        onBidInvitesSent();
      }
      
      // Close modal after successful submission
      onOpenChange(false);
      setSelectedSubs([]);
      setNotes('');
      setAttachments([]);
      
    } catch (error: any) {
      console.error('❌ Error submitting bid invitations:', error);
      toast({
        title: "Failed to Submit Bid Invitations",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  // Reset form and close modal
  const handleClose = () => {
    setSelectedSubs([]);
    setSelectedTrade('manual');
    setSearchQuery('');
    setDueDate(undefined);
    setNotes('');
    setAttachments([]);
    setIsCalendarOpen(false);
    onOpenChange(false);
  };

  const selectedSubsData = subcontractors.filter(sub => selectedSubs.includes(sub.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Start Bidding Process
          </DialogTitle>
          <DialogDescription>
            Invite subcontractors to submit bids for this estimate item. You can select individual contractors or choose a trade to invite all vendors in that specialty.
          </DialogDescription>
        </DialogHeader>

        {/* Estimate Item Summary */}
        {estimateItem && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <h3 className="font-semibold mb-3">Estimate Item Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-gray-500" />
                <div>
                  <div className="text-sm text-gray-500">Trade</div>
                  <div className="font-medium">{estimateItem.trade}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-gray-500" />
                <div>
                  <div className="text-sm text-gray-500">Estimated Cost</div>
                  <div className="font-medium">${estimateItem.estimatedCost?.toLocaleString()}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-500" />
                <div>
                  <div className="text-sm text-gray-500">Duration</div>
                  <div className="font-medium">{estimateItem.duration} days</div>
                </div>
              </div>
            </div>
            {estimateItem.description && (
              <div className="mt-3">
                <div className="text-sm text-gray-500">Description</div>
                <div className="text-sm">{estimateItem.description}</div>
              </div>
            )}
          </div>
        )}

        <div className="space-y-6">
          {/* Trade Specialty Shortcut */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Quick Select by Trade</Label>
            <TradeTypeComboBox
              value={selectedTrade === 'manual' ? '' : selectedTrade}
              onValueChange={(value) => handleTradeSelection(value || 'manual')}
              placeholder="Select a trade to invite all vendors"
              allowAddNew={false}
            />
          </div>

          {/* Manual Subcontractor Selection */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Select Subcontractors</Label>
            
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search by name, company, or trade..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Selected Subcontractors Summary */}
            {selectedSubs.length > 0 && (
              <div className="p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <UserCheck className="h-4 w-4 text-theme-primary" />
                  <span className="font-medium text-blue-800">
                    {selectedSubs.length} Subcontractor{selectedSubs.length !== 1 ? 's' : ''} Selected
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedSubsData.map(sub => (
                    <Badge key={sub.id} variant="secondary" className="flex items-center gap-1">
                      {sub.name} ({sub.company})
                      <button
                        onClick={() => handleSubSelection(sub.id, false)}
                        className="ml-1 hover:text-red-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Subcontractor List */}
            <div className="border rounded-lg max-h-60 overflow-y-auto">
              {filteredSubs.map(sub => (
                <div key={sub.id} className="flex items-center space-x-3 p-3 border-b last:border-b-0 hover:bg-gray-50">
                  <Checkbox
                    checked={selectedSubs.includes(sub.id)}
                    onCheckedChange={(checked) => handleSubSelection(sub.id, checked as boolean)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{sub.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {sub.trade}
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-500 flex items-center gap-4">
                      <span className="flex items-center gap-1">
                        <Briefcase className="h-3 w-3" />
                        {sub.company}
                      </span>
                      {sub.email && <span>{sub.email}</span>}
                    </div>
                  </div>
                </div>
              ))}
              {filteredSubs.length === 0 && (
                <div className="p-4 text-center text-gray-500">
                  No subcontractors found matching your search.
                </div>
              )}
            </div>
          </div>

          {/* Bid Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Due Date */}
            <div className="space-y-2">
              <Label>Due Date (Optional)</Label>
              <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dueDate ? format(dueDate, "PPP") : "Select due date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    onSelect={(date) => {
                      setDueDate(date);
                      setIsCalendarOpen(false);
                    }}
                    disabled={(date) => date < new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* File Upload */}
            <div className="space-y-2">
              <Label>Attach Files (Optional)</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById('file-upload')?.click()}
                  className="flex items-center gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Upload Files
                </Button>
                <input
                  id="file-upload"
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.dwg,.png,.jpg,.jpeg"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
              {attachments.length > 0 && (
                <div className="space-y-2">
                  {attachments.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-gray-500" />
                        <span className="text-sm">{file.name}</span>
                        <span className="text-xs text-gray-500">
                          ({(file.size / 1024 / 1024).toFixed(1)} MB)
                        </span>
                      </div>
                      <button
                        onClick={() => removeAttachment(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes for Subcontractors (Optional)</Label>
            <Textarea
              placeholder="Add any special instructions, requirements, or notes for the subcontractors..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={selectedSubs.length === 0 || createBidInvitationMutation.isPending}
            className="flex items-center gap-2"
          >
            {createBidInvitationMutation.isPending ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Sending Invitations...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send {selectedSubs.length} Invitation{selectedSubs.length !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest } from '@/lib/queryClient';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TradeTypeComboBox } from '@/components/contacts/TradeTypeComboBox';
import {
  Users,
  Plus,
  X,
  Building2,
  User,
  Mail,
  Phone,
  DollarSign,
  Clock,
  FileText,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';

interface EstimateItem {
  id: number;
  trade: string;
  vendor: string;
  description: string;
  estimatedCost: number;
  duration: number;
  status: 'Estimating' | 'Bidding' | 'Waiting Approval' | 'Approved' | 'Rejected';
  markup: number;
  contingency: number;
}

interface Contact {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: string;
  company: string;
  trade: string;
  rating: number;
}

interface BidFromEstimateModalProps {
  isOpen: boolean;
  onClose: () => void;
  estimateItem: EstimateItem | null;
  projectId: string;
}

const bidProcessSchema = z.object({
  invitedSubcontractors: z.array(z.number()).min(1, 'At least one subcontractor must be selected'),
  byTradeType: z.boolean().default(false),
  selectedTrade: z.string().optional(),
});

export function BidFromEstimateModal({ isOpen, onClose, estimateItem, projectId }: BidFromEstimateModalProps) {
  const [selectedSubcontractors, setSelectedSubcontractors] = useState<number[]>([]);
  const [byTradeType, setByTradeType] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof bidProcessSchema>>({
    resolver: zodResolver(bidProcessSchema),
    defaultValues: {
      invitedSubcontractors: [],
      byTradeType: false,
      selectedTrade: '',
    },
  });

  // Fetch subcontractors
  const { data: allContacts = [] } = useQuery({
    queryKey: ['/api/contacts'],
    enabled: isOpen,
  });

  const subcontractors = allContacts.filter((contact: Contact) => contact.role === 'subcontractor');
  
  // Filter subcontractors by trade if selecting by trade type
  const filteredSubcontractors = byTradeType && selectedTrade
    ? subcontractors.filter((sub: Contact) => sub.trade === selectedTrade)
    : subcontractors;

  // Get unique trades from subcontractors
  const availableTrades = [...new Set(subcontractors.map((sub: Contact) => sub.trade).filter(Boolean))];

  const createBidProcessMutation = useMutation({
    mutationFn: async (bidProcessData: any) => {
      return apiRequest('/api/bid-processes', 'POST', bidProcessData);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Bid process started successfully. Subcontractors have been invited to submit bids.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/estimates'] });
      queryClient.invalidateQueries({ queryKey: ['/api/bid-processes'] });
      onClose();
      resetForm();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to start bid process. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubcontractorToggle = (subcontractorId: number) => {
    setSelectedSubcontractors(prev => 
      prev.includes(subcontractorId)
        ? prev.filter(id => id !== subcontractorId)
        : [...prev, subcontractorId]
    );
  };

  const handleTradeTypeToggle = (checked: boolean) => {
    setByTradeType(checked);
    if (checked) {
      // Clear manual selections when switching to trade type
      setSelectedSubcontractors([]);
      setSelectedTrade(estimateItem?.trade || '');
    } else {
      setSelectedTrade('');
    }
  };

  const handleTradeSelection = (trade: string) => {
    setSelectedTrade(trade);
    // Auto-select all subcontractors of this trade
    const tradeSubcontractors = subcontractors
      .filter((sub: Contact) => sub.trade === trade)
      .map((sub: Contact) => sub.id);
    setSelectedSubcontractors(tradeSubcontractors);
  };

  const resetForm = () => {
    setSelectedSubcontractors([]);
    setByTradeType(false);
    setSelectedTrade('');
    form.reset();
  };

  const onSubmit = (data: z.infer<typeof bidProcessSchema>) => {
    if (!estimateItem) return;

    const invitedSubs = byTradeType 
      ? filteredSubcontractors.map((sub: Contact) => sub.id)
      : selectedSubcontractors;

    const bidProcessData = {
      projectId: parseInt(projectId),
      estimateItemId: estimateItem.id,
      trade: estimateItem.trade,
      invitedSubcontractors: invitedSubs,
      selectedEstimateSnapshot: {
        trade: estimateItem.trade,
        description: estimateItem.description,
        estimatedCost: estimateItem.estimatedCost,
        duration: estimateItem.duration,
        markup: estimateItem.markup,
        contingency: estimateItem.contingency,
      },
    };

    createBidProcessMutation.mutate(bidProcessData);
  };

  if (!estimateItem) return null;

  const finalSubcontractors = byTradeType ? filteredSubcontractors : 
    subcontractors.filter((sub: Contact) => selectedSubcontractors.includes(sub.id));

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite Subcontractors to Bid</DialogTitle>
          <DialogDescription>
            Select multiple subcontractors to invite for this trade item. They will submit their own bids through their portal.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Estimate Item Details */}
            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Estimate Item Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Trade</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline">{estimateItem.trade}</Badge>
                      <StatusBadge status={estimateItem.status} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Current Vendor</Label>
                    <p className="text-sm text-gray-600 mt-1">
                      {estimateItem.vendor || 'Not assigned'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Estimated Cost</Label>
                    <p className="text-sm font-medium text-green-600 mt-1">
                      ${estimateItem.estimatedCost.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Duration</Label>
                    <p className="text-sm text-gray-600 mt-1">
                      {estimateItem.duration} days
                    </p>
                  </div>
                </div>
                {estimateItem.description && (
                  <div>
                    <Label className="text-sm font-medium">Description</Label>
                    <p className="text-sm text-gray-600 mt-1">
                      {estimateItem.description}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Subcontractor Selection */}
            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Select Subcontractors
                </CardTitle>
                <CardDescription>
                  Selected subcontractors will receive invitations to submit their own bids through their portal
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Selection Mode Toggle */}
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="byTradeType"
                    checked={byTradeType}
                    onCheckedChange={handleTradeTypeToggle}
                  />
                  <Label htmlFor="byTradeType" className="text-sm font-medium">
                    Invite all subcontractors of this trade type
                  </Label>
                </div>

                {/* Trade Type Selection */}
                {byTradeType && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Select Trade Type</Label>
                    <TradeTypeComboBox
                      value={selectedTrade}
                      onValueChange={handleTradeSelection}
                      placeholder="Choose a trade type"
                    />
                    {selectedTrade && (
                      <p className="text-sm text-gray-600">
                        {filteredSubcontractors.length} subcontractor(s) will be invited
                      </p>
                    )}
                  </div>
                )}

                {/* Manual Subcontractor Selection */}
                {!byTradeType && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Select Subcontractors Manually</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                      {subcontractors.map((sub: Contact) => (
                        <div 
                          key={sub.id}
                          className={`flex items-center space-x-2 p-2 rounded-md border cursor-pointer transition-colors ${
                            selectedSubcontractors.includes(sub.id)
                              ? 'border-theme-primary bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                          onClick={() => handleSubcontractorToggle(sub.id)}
                        >
                          <Checkbox
                            checked={selectedSubcontractors.includes(sub.id)}
                            onChange={() => handleSubcontractorToggle(sub.id)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-gray-500" />
                              <p className="text-sm font-medium truncate">{sub.name}</p>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                              <span className="flex items-center gap-1">
                                <Building2 className="h-3 w-3" />
                                {sub.company}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {sub.trade}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Selected Subcontractors Summary */}
                {finalSubcontractors.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">
                      Selected Subcontractors ({finalSubcontractors.length})
                    </Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                      {finalSubcontractors.map((sub: Contact) => (
                        <div 
                          key={sub.id}
                          className="flex items-center justify-between p-2 bg-green-50 rounded-md border border-green-200"
                        >
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <div>
                              <p className="text-sm font-medium">{sub.name}</p>
                              <p className="text-xs text-gray-500">{sub.company}</p>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {sub.trade}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={createBidProcessMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  createBidProcessMutation.isPending ||
                  (byTradeType ? !selectedTrade : selectedSubcontractors.length === 0)
                }
              >
                {createBidProcessMutation.isPending ? (
                  <>
                    <AlertCircle className="h-4 w-4 mr-2 animate-spin" />
                    Sending Invitations...
                  </>
                ) : (
                  <>
                    <Users className="h-4 w-4 mr-2" />
                    Send Invitations
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
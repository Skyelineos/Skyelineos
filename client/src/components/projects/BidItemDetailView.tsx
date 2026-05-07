import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Users, 
  Send, 
  Clock, 
  DollarSign, 
  Building2, 
  User,
  Search,
  Filter
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

const bidInvitationSchema = z.object({
  selectedSubs: z.array(z.union([z.number(), z.string()])).min(1, 'Select at least one subcontractor'),
  notes: z.string().optional(),
  dueDate: z.string().optional(),
  attachments: z.array(z.any()).optional()
});

interface BidItemDetailViewProps {
  item: any;
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function BidItemDetailView({ item, projectId, isOpen, onClose }: BidItemDetailViewProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTradeFilter, setSelectedTradeFilter] = useState('');

  // Debug logging for modal state
  // Search/lookup operation

  // Add error boundary protection
  if (!item && isOpen) {
    console.error('🚨 BidItemDetailView: No item provided but modal should be open');
    onClose();
    return null;
  }

  // Early return if not open to prevent unnecessary queries
  if (!isOpen) {
    return null;
  }

  // Generate a unique ID for the item if it doesn't have one
  const itemId = item?.id || `${item?.trade}-${item?.estimatedCost || 0}-${item?.description?.substring(0,20) || 'item'}`;

  // Fetch bid processes for this item
  const { data: bidProcesses = [] } = useQuery({
    queryKey: ['/api/bid-processes/item', itemId],
    queryFn: async () => {
      if (!itemId) return [];
      try {
        const response = await fetch(`/api/bid-processes/item/${itemId}`);
        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data) ? data : [];
      } catch (error) {
        console.error('Error fetching bid processes:', error);
        return [];
      }
    },
    enabled: !!itemId && isOpen
  });

  // Fetch bid responses for this item
  const { data: bidResponses = [] } = useQuery({
    queryKey: ['/api/bid-responses/item', itemId],
    queryFn: async () => {
      if (!itemId) return [];
      try {
        const response = await fetch(`/api/bid-responses/item/${itemId}`);
        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data) ? data : [];
      } catch (error) {
        console.error('Error fetching bid responses:', error);
        return [];
      }
    },
    enabled: !!itemId && isOpen
  });

  // Fetch bid invitations for this item
  const { data: bidInvitations = [] } = useQuery({
    queryKey: ['/api/bid-invitations/item', itemId],
    queryFn: async () => {
      if (!itemId) return [];
      try {
        const response = await fetch(`/api/bid-invitations/item/${itemId}`);
        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data) ? data : [];
      } catch (error) {
        console.error('Error fetching bid invitations:', error);
        return [];
      }
    },
    enabled: !!itemId && isOpen
  });

  // Fetch subcontractors
  const { data: allSubcontractors = [] } = useQuery({
    queryKey: ['/api/contacts'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/contacts');
        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data) ? data.filter((contact: any) => 
          contact.role?.toLowerCase() === 'subcontractor'
        ) : [];
      } catch (error) {
        console.error('Error fetching contacts:', error);
        return [];
      }
    },
    enabled: isOpen
  });

  // Filter subcontractors by trade match
  const matchingSubcontractors = allSubcontractors.filter((sub: any) => 
    sub.specialties?.toLowerCase().includes(item?.trade?.toLowerCase())
  );

  // Get unique trade types from all subcontractors
  const uniqueTrades = Array.from(new Set(allSubcontractors.map((sub: any) => sub.specialties).filter(Boolean)));

  // Filter subcontractors by search term and trade filter
  const filteredSubcontractors = allSubcontractors.filter((sub: any) => {
    const matchesSearch = searchTerm === '' || 
      sub.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.specialties?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesTradeFilter = selectedTradeFilter === '' || 
      sub.specialties?.toLowerCase().includes(selectedTradeFilter.toLowerCase());
    
    return matchesSearch && matchesTradeFilter;
  });

  // Split filtered subcontractors into matching and others
  const filteredMatchingSubcontractors = filteredSubcontractors.filter((sub: any) => 
    sub.specialties?.toLowerCase().includes(item?.trade?.toLowerCase())
  );
  
  const filteredOtherSubcontractors = filteredSubcontractors.filter((sub: any) => 
    !sub.specialties?.toLowerCase().includes(item?.trade?.toLowerCase())
  );

  // Form for bid invitations
  const bidForm = useForm({
    resolver: zodResolver(bidInvitationSchema),
    defaultValues: {
      selectedSubs: [] as any[],
      notes: '',
      dueDate: '',
      attachments: [] as any[]
    }
  });

  // Send bid invitation mutation
  const sendBidInvitationMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('/api/bid-invitations', 'POST', {
        ...data,
        itemId,
        projectId,
        estimateItemId: item.id
      });
    },
    onSuccess: () => {
      toast({
        title: "Invitations Sent",
        description: `Bid invitations sent to ${bidForm.getValues('selectedSubs').length} subcontractors`,
      });
      bidForm.reset();
      queryClient.invalidateQueries({ queryKey: ['/api/bid-invitations'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send invitations",
        variant: "destructive",
      });
    }
  });

  // Function to select all subcontractors of a specific trade
  const selectAllByTrade = (trade: string) => {
    const tradeSubcontractors = allSubcontractors
      .filter((sub: any) => sub.specialties?.toLowerCase().includes(trade.toLowerCase()))
      .map((sub: any) => sub.id);
    
    bidForm.setValue('selectedSubs', tradeSubcontractors as any);
    toast({
      title: "Trade Selected",
      description: `Selected ${tradeSubcontractors.length} ${trade} subcontractors`,
    });
  };

  const getStatusBadge = (status: string) => {
    const statusLower = status?.toLowerCase() || 'not started';
    
    switch (statusLower) {
      case 'job awarded':
      case 'awarded':
        return { variant: 'default' as const, className: 'bg-green-100 text-green-800 border-green-200' };
      case 'bids received':
        return { variant: 'secondary' as const, className: 'bg-purple-100 text-purple-800 border-purple-200' };
      case 'actively bidding':
      case 'bidding':
        return { variant: 'secondary' as const, className: 'bg-orange-100 text-orange-800 border-orange-200' };
      case 'not started':
      default:
        return { variant: 'outline' as const, className: 'bg-gray-100 text-gray-600 border-gray-200' };
    }
  };

  if (!item) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {item.trade} - Bid Management
          </DialogTitle>
          <DialogDescription>
            Manage bidding process for this estimate item
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* SECTION 1: Item Details */}
          <Card className="bg-gray-50">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{item.trade}</span>
                <Badge 
                  variant={getStatusBadge(item.status).variant}
                  className={getStatusBadge(item.status).className}
                >
                  {item.status || 'Not Started'}
                </Badge>
              </CardTitle>
              {item.description && (
                <CardDescription>{item.description}</CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-sm text-gray-500 mb-1">Estimated Cost</div>
                  <div className="text-lg font-bold flex items-center justify-center gap-1">
                    <DollarSign className="h-4 w-4" />
                    {(item.cost || item.estimatedCost || 0).toLocaleString()}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-gray-500 mb-1">Duration</div>
                  <div className="text-lg font-bold flex items-center justify-center gap-1">
                    <Clock className="h-4 w-4" />
                    {item.duration || 0} days
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-gray-500 mb-1">Vendor</div>
                  <div className="text-lg font-bold flex items-center justify-center gap-1">
                    <User className="h-4 w-4" />
                    {item.vendor || 'Not assigned'}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-gray-500 mb-1">Invitations Sent</div>
                  <div className="text-lg font-bold flex items-center justify-center gap-1">
                    <Send className="h-4 w-4" />
                    {bidInvitations.length}
                  </div>
                </div>
              </div>

              {item.notes && (
                <div>
                  <div className="text-sm text-gray-500 mb-2">Notes</div>
                  <div className="text-sm p-3 bg-gray-50 rounded border">
                    {item.notes}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* SECTION 2: Send Invitations */}
          <Card className="bg-gray-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Send Bid Invitations
              </CardTitle>
              <CardDescription>
                Select subcontractors to invite for bidding on this {item.trade} work
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...bidForm}>
                <form onSubmit={bidForm.handleSubmit((data) => sendBidInvitationMutation.mutate(data))} className="space-y-4">
                  <FormField
                    control={bidForm.control}
                    name="selectedSubs"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Select Subcontractors</FormLabel>
                        
                        {/* Search and Filter Controls */}
                        <div className="space-y-3 mb-4">
                          <div className="flex gap-2">
                            <div className="flex-1 relative">
                              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                              <Input
                                placeholder="Search subcontractors by name, company, or trade..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                              />
                            </div>
                            <Select value={selectedTradeFilter} onValueChange={setSelectedTradeFilter}>
                              <SelectTrigger className="w-48">
                                <SelectValue placeholder="Filter by trade" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all-trades">All Trades</SelectItem>
                                {uniqueTrades.map((trade) => (
                                  <SelectItem key={trade} value={trade}>
                                    {trade}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          
                          {/* Quick Select by Trade */}
                          <div className="flex flex-wrap gap-2">
                            <span className="text-sm text-gray-500 self-center">Quick select:</span>
                            {uniqueTrades.slice(0, 5).map((trade) => (
                              <Button
                                key={trade}
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => selectAllByTrade(trade)}
                                className="h-7 text-xs"
                              >
                                <Filter className="h-3 w-3 mr-1" />
                                All {trade}
                              </Button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          {filteredMatchingSubcontractors.length > 0 && (
                            <div>
                              <div className="text-sm text-green-600 mb-2 font-medium flex items-center justify-between">
                                <span>Recommended ({item.trade} specialists):</span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => selectAllByTrade(item.trade)}
                                  className="h-6 text-xs text-green-600"
                                >
                                  Select All
                                </Button>
                              </div>
                              {filteredMatchingSubcontractors.map((sub: any) => (
                                <div key={sub.id} className="flex items-center space-x-2 p-2 bg-green-50 rounded border border-green-200">
                                  <Checkbox
                                    checked={(field.value as any[])?.includes(sub.id) || false}
                                    onCheckedChange={(checked) => {
                                      const currentValue = field.value as any[] || [];
                                      const newValue = checked
                                        ? [...currentValue, sub.id]
                                        : currentValue.filter((id: any) => id !== sub.id);
                                      field.onChange(newValue);
                                    }}
                                  />
                                  <div className="flex-1">
                                    <div className="font-medium">{sub.name}</div>
                                    <div className="text-sm text-gray-600">{sub.company}</div>
                                    <div className="text-xs text-green-600">{sub.specialties}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          
                          {filteredOtherSubcontractors.length > 0 && (
                            <div>
                              <div className="text-sm text-gray-600 mb-2 font-medium">
                                Other Subcontractors:
                              </div>
                              {filteredOtherSubcontractors.map((sub: any) => (
                                  <div key={sub.id} className="flex items-center space-x-2 p-2 bg-gray-50 rounded border">
                                    <Checkbox
                                      checked={(field.value as any[])?.includes(sub.id) || false}
                                      onCheckedChange={(checked) => {
                                        const currentValue = field.value as any[] || [];
                                        const newValue = checked
                                          ? [...currentValue, sub.id]
                                          : currentValue.filter((id: any) => id !== sub.id);
                                        field.onChange(newValue);
                                      }}
                                    />
                                    <div className="flex-1">
                                      <div className="font-medium">{sub.name}</div>
                                      <div className="text-sm text-gray-600">{sub.company}</div>
                                      <div className="text-xs text-gray-600">{sub.specialties}</div>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          )}
                          
                          {filteredSubcontractors.length === 0 && (
                            <div className="text-center py-4 text-gray-500">
                              <Users className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                              <p>No subcontractors found matching your search</p>
                              <p className="text-sm">Try adjusting your search terms or filters</p>
                            </div>
                          )}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={bidForm.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Additional Notes (Optional)</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Add any special instructions or requirements..."
                            className="min-h-[80px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={bidForm.control}
                    name="dueDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bid Due Date (Optional)</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    disabled={sendBidInvitationMutation.isPending || !bidForm.watch('selectedSubs')?.length}
                    className="w-full"
                  >
                    {sendBidInvitationMutation.isPending ? (
                      <>
                        <Clock className="h-4 w-4 mr-2 animate-spin" />
                        Sending Invitations...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Send Bid Invitations ({bidForm.watch('selectedSubs')?.length || 0} selected)
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          {/* SECTION 3: Bid Status */}
          <Card className="bg-gray-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Bid Status & Responses
              </CardTitle>
              <CardDescription>
                Track invitations sent and bids received for this item
              </CardDescription>
            </CardHeader>
            <CardContent>
              {bidInvitations.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Users className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No bid invitations sent yet</p>
                  <p className="text-sm">Use the invitation form above to get started</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {bidInvitations.map((invitation: any) => {
                    const response = bidResponses.find((r: any) => r.bidInvitationId === invitation.id);
                    
                    return (
                      <div key={invitation.id} className="flex items-center justify-between p-3 bg-gray-50 rounded border">
                        <div className="flex-1">
                          <div className="font-medium">{invitation.subcontractorName}</div>
                          <div className="text-sm text-gray-600">{invitation.subcontractorCompany}</div>
                          <div className="text-xs text-gray-500">
                            Invited: {new Date(invitation.sentAt).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="text-right">
                          {response ? (
                            <div className="space-y-1">
                              <Badge className="bg-green-100 text-green-800">
                                Bid Received
                              </Badge>
                              <div className="text-sm font-medium">
                                ${response.bidAmount?.toLocaleString() || 'N/A'}
                              </div>
                              <div className="text-xs text-gray-500">
                                {response.timeline} days
                              </div>
                            </div>
                          ) : (
                            <Badge variant="outline">
                              Waiting for Response
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
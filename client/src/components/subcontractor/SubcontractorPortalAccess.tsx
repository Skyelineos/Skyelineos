import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { 
  Users, 
  Building2, 
  DollarSign, 
  Clock, 
  Send,
  CheckCircle,
  XCircle,
  AlertCircle,
  User,
  LogIn
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface Contact {
  id: number;
  name: string;
  email: string;
  phone: string;
  company: string;
  type: string;
  trade?: string;
}

interface BidProcess {
  id: number;
  projectId: number;
  estimateItemId: number;
  trade: string;
  description: string;
  estimatedCost: number;
  status: 'draft' | 'sent' | 'received' | 'closed';
  createdAt: string;
  dueDate?: string;
  notes?: string;
  invitedSubcontractors: number[];
}

interface BidResponse {
  id: number;
  bidProcessId: number;
  estimateItemId: number;
  contactId: number;
  bidAmount: number;
  timeline: number;
  notes?: string;
  status: 'submitted' | 'selected' | 'rejected';
  submittedAt: string;
  contact?: Contact;
}

interface SubcontractorPortalAccessProps {
  projectId: string;
}

export default function SubcontractorPortalAccess({ projectId }: SubcontractorPortalAccessProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedSubcontractor, setSelectedSubcontractor] = useState<Contact | null>(null);
  const [bidDialogOpen, setBidDialogOpen] = useState(false);
  const [selectedBidProcess, setSelectedBidProcess] = useState<BidProcess | null>(null);
  const [bidAmount, setBidAmount] = useState('');
  const [timeline, setTimeline] = useState('');
  const [notes, setNotes] = useState('');

  // Fetch subcontractors
  const { data: subcontractors = [], isLoading: subsLoading } = useQuery({
    queryKey: ['/api/contacts'],
    select: (data: Contact[]) => data.filter((contact: Contact) => contact.type === 'subcontractor')
  });

  // Fetch bid processes for the project
  const { data: bidProcesses = [], isLoading: bidProcessesLoading, refetch: refetchBidProcesses } = useQuery({
    queryKey: ['/api/bid-processes/project'],
    queryFn: async () => {
      const response = await fetch('/api/bid-processes/project');
      return response.json();
    }
  });

  // Fetch bid responses
  const { data: bidResponses = [], isLoading: bidResponsesLoading, refetch: refetchBidResponses } = useQuery({
    queryKey: [`/api/bid-responses/project/${projectId}`]
  });

  // Submit bid response mutation
  const submitBidMutation = useMutation({
    mutationFn: async (bidData: {
      bidProcessId: number;
      contactId: number;
      bidAmount: number;
      timeline: number;
      notes?: string;
    }) => {
      const response = await fetch('/api/bid-responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bidData)
      });
      return response.json();
    },
    onSuccess: () => {
      refetchBidProcesses();
      refetchBidResponses();
      setBidDialogOpen(false);
      setSelectedBidProcess(null);
      setBidAmount('');
      setTimeline('');
      setNotes('');
      toast({
        title: 'Bid Submitted',
        description: `Bid submitted successfully as ${selectedSubcontractor?.company}`
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Bid Submission Failed',
        description: error.message || 'Failed to submit bid',
        variant: 'destructive'
      });
    }
  });

  // Get available bid processes for selected subcontractor
  const getAvailableBidsForSubcontractor = (subcontractor: Contact): BidProcess[] => {
    if (!subcontractor) return [];
    
    return bidProcesses.filter((bp: BidProcess) => {
      // Check if this subcontractor was invited
      const isInvited = bp.invitedSubcontractors.includes(subcontractor.id);
      
      // Check if they haven't already submitted a bid
      const hasSubmitted = bidResponses.some((br: BidResponse) => 
        br.bidProcessId === bp.id && br.contactId === subcontractor.id
      );
      
      // Check if the trade matches
      const tradeMatches = subcontractor.trade?.toLowerCase().includes(bp.trade.toLowerCase()) ||
                          bp.trade.toLowerCase().includes(subcontractor.trade?.toLowerCase() || '');
      
      return isInvited && !hasSubmitted && tradeMatches && bp.status === 'sent';
    });
  };

  // Get submitted bids for subcontractor
  const getSubmittedBidsForSubcontractor = (subcontractor: Contact): BidResponse[] => {
    if (!subcontractor) return [];
    
    return bidResponses.filter((br: BidResponse) => br.contactId === subcontractor.id);
  };

  // Handle bid submission
  const handleSubmitBid = () => {
    if (!selectedSubcontractor || !selectedBidProcess || !bidAmount || !timeline) {
      toast({
        title: 'Missing Information',
        description: 'Please fill in all required fields',
        variant: 'destructive'
      });
      return;
    }

    submitBidMutation.mutate({
      bidProcessId: selectedBidProcess.id,
      contactId: selectedSubcontractor.id,
      bidAmount: parseFloat(bidAmount),
      timeline: parseInt(timeline),
      notes
    });
  };

  // Handle login as subcontractor
  const handleLoginAsSubcontractor = (subcontractor: Contact) => {
    setSelectedSubcontractor(subcontractor);
    toast({
      title: 'Logged in as Subcontractor',
      description: `You are now viewing as ${subcontractor.company} (${subcontractor.name})`
    });
  };

  const handleStartBid = (bidProcess: BidProcess) => {
    setSelectedBidProcess(bidProcess);
    setBidDialogOpen(true);
  };

  if (subsLoading || bidProcessesLoading || bidResponsesLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-theme-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p>Loading subcontractor portal data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Subcontractor Portal Access</h2>
        <p className="text-gray-600">Access individual subcontractor portals to manually submit bids</p>
      </div>

      {/* Subcontractor Selection */}
      {!selectedSubcontractor && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {subcontractors.map((subcontractor: Contact) => (
            <Card 
              key={subcontractor.id} 
              className="cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => handleLoginAsSubcontractor(subcontractor)}
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-theme-primary" />
                  {subcontractor.company}
                </CardTitle>
                <p className="text-sm text-gray-600">{subcontractor.name}</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{subcontractor.trade || 'General'}</Badge>
                  </div>
                  <div className="text-sm text-gray-600">
                    {subcontractor.email}
                  </div>
                  <Button 
                    size="sm" 
                    className="w-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLoginAsSubcontractor(subcontractor);
                    }}
                  >
                    <LogIn className="h-4 w-4 mr-2" />
                    Access Portal
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Subcontractor Portal View */}
      {selectedSubcontractor && (
        <div className="space-y-6">
          {/* Current User Header */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <User className="h-8 w-8 text-theme-primary" />
                  <div>
                    <h3 className="font-semibold text-lg">{selectedSubcontractor.company}</h3>
                    <p className="text-sm text-gray-600">{selectedSubcontractor.name} • {selectedSubcontractor.trade}</p>
                  </div>
                </div>
                <Button 
                  variant="outline"
                  onClick={() => setSelectedSubcontractor(null)}
                >
                  Switch User
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Available Bids */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5 text-green-600" />
                Available Bid Opportunities
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const availableBids = getAvailableBidsForSubcontractor(selectedSubcontractor);
                
                return availableBids.length > 0 ? (
                  <div className="space-y-4">
                    {availableBids.map((bidProcess: BidProcess) => (
                      <div key={bidProcess.id} className="p-4 border rounded-lg">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h4 className="font-medium text-lg">{bidProcess.trade}</h4>
                            <p className="text-gray-600 mt-1">{bidProcess.description}</p>
                            <div className="flex items-center gap-4 mt-3">
                              <div className="flex items-center gap-1 text-green-600">
                                <DollarSign className="h-4 w-4" />
                                <span className="font-medium">${bidProcess.estimatedCost.toLocaleString()}</span>
                              </div>
                              {bidProcess.dueDate && (
                                <div className="flex items-center gap-1 text-gray-600">
                                  <Clock className="h-4 w-4" />
                                  <span className="text-sm">Due: {new Date(bidProcess.dueDate).toLocaleDateString()}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          <Button 
                            onClick={() => handleStartBid(bidProcess)}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            Submit Bid
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Send className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No available bid opportunities</p>
                    <p className="text-sm">Check back later for new opportunities</p>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Submitted Bids */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-theme-primary" />
                My Submitted Bids
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const submittedBids = getSubmittedBidsForSubcontractor(selectedSubcontractor);
                
                return submittedBids.length > 0 ? (
                  <div className="space-y-4">
                    {submittedBids.map((bidResponse: BidResponse) => {
                      const bidProcess = bidProcesses.find((bp: BidProcess) => bp.id === bidResponse.bidProcessId);
                      
                      return (
                        <div key={bidResponse.id} className="p-4 border rounded-lg">
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-medium">{bidProcess?.trade || 'Unknown Trade'}</h4>
                              <p className="text-gray-600 text-sm">{bidProcess?.description}</p>
                              <div className="flex items-center gap-4 mt-2">
                                <div className="text-green-600 font-medium">
                                  ${bidResponse.bidAmount.toLocaleString()}
                                </div>
                                <div className="text-gray-600 text-sm">
                                  {bidResponse.timeline} days
                                </div>
                                <div className="text-gray-500 text-sm">
                                  Submitted: {new Date(bidResponse.submittedAt).toLocaleDateString()}
                                </div>
                              </div>
                              {bidResponse.notes && (
                                <p className="text-gray-600 text-sm mt-2">{bidResponse.notes}</p>
                              )}
                            </div>
                            <Badge 
                              className={
                                bidResponse.status === 'selected' ? 'bg-green-500 text-white' :
                                bidResponse.status === 'rejected' ? 'bg-red-500 text-white' :
                                'bg-yellow-500 text-white'
                              }
                            >
                              {bidResponse.status === 'selected' && <CheckCircle className="h-3 w-3 mr-1" />}
                              {bidResponse.status === 'rejected' && <XCircle className="h-3 w-3 mr-1" />}
                              {bidResponse.status === 'submitted' && <AlertCircle className="h-3 w-3 mr-1" />}
                              {bidResponse.status.charAt(0).toUpperCase() + bidResponse.status.slice(1)}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No bids submitted yet</p>
                    <p className="text-sm">Submit your first bid from the available opportunities above</p>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bid Submission Dialog */}
      <Dialog open={bidDialogOpen} onOpenChange={setBidDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Submit Bid - {selectedBidProcess?.trade}</DialogTitle>
          </DialogHeader>
          
          {selectedBidProcess && selectedSubcontractor && (
            <div className="space-y-4">
              {/* Project Details */}
              <div className="bg-gray-50 p-4 rounded">
                <h4 className="font-medium mb-2">Project Details</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <Label>Trade</Label>
                    <p className="font-medium">{selectedBidProcess.trade}</p>
                  </div>
                  <div>
                    <Label>Estimated Cost</Label>
                    <p className="font-medium text-green-600">${selectedBidProcess.estimatedCost.toLocaleString()}</p>
                  </div>
                </div>
                <div className="mt-2">
                  <Label>Description</Label>
                  <p className="text-gray-600">{selectedBidProcess.description}</p>
                </div>
                {selectedBidProcess.notes && (
                  <div className="mt-2">
                    <Label>Additional Notes</Label>
                    <p className="text-gray-600">{selectedBidProcess.notes}</p>
                  </div>
                )}
              </div>

              {/* Bid Form */}
              <div className="space-y-4">
                <div>
                  <Label htmlFor="bidAmount">Your Bid Amount *</Label>
                  <Input
                    id="bidAmount"
                    type="number"
                    placeholder="0.00"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="timeline">Timeline (Days) *</Label>
                  <Input
                    id="timeline"
                    type="number"
                    placeholder="Number of days to complete"
                    value={timeline}
                    onChange={(e) => setTimeline(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Add any additional information about your bid..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setBidDialogOpen(false)}
              disabled={submitBidMutation.isPending}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSubmitBid}
              disabled={submitBidMutation.isPending || !bidAmount || !timeline}
              className="bg-green-600 hover:bg-green-700"
            >
              {submitBidMutation.isPending ? 'Submitting...' : 'Submit Bid'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Clock, Check, X, AlertCircle, DollarSign, Calendar, FileText, Trophy, Send, Download } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { format } from 'date-fns';

interface BidResponseManagerProps {
  projectId: number;
  estimateId: number;
}

interface BidResponse {
  id: number;
  bidProcessId: number;
  contactId: number;
  bidAmount: number;
  timeline: number;
  notes: string;
  status: 'submitted' | 'selected' | 'rejected';
  submittedAt: string;
  estimateItemId: number;
  contact?: {
    id: number;
    name: string;
    company: string;
    email: string;
    phone: string;
    trade: string;
  };
}

interface BidProcess {
  id: number;
  estimateItemId: number;
  projectId: number;
  trade: string;
  description: string;
  estimatedCost: number;
  invitedSubcontractors: number[];
  deadline: string;
  status: 'open' | 'closed' | 'awarded';
  createdAt: string;
}

export default function BidResponseManager({ projectId, estimateId }: BidResponseManagerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedBidProcess, setSelectedBidProcess] = useState<BidProcess | null>(null);
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false);
  const [comparisonDialogOpen, setComparisonDialogOpen] = useState(false);
  const [reminderMessage, setReminderMessage] = useState('');

  // Fetch bid processes for the project
  const { data: bidProcesses = [], isLoading: loadingProcesses } = useQuery({
    queryKey: ['/api/bid-processes/project', projectId],
    queryFn: () => apiRequest(`/api/bid-processes/project?projectId=${projectId}`, 'GET'),
  });

  // Fetch bid responses for the project
  const { data: bidResponses = [], isLoading: loadingResponses } = useQuery({
    queryKey: ['/api/bid-responses/project', projectId],
    queryFn: () => apiRequest(`/api/bid-responses/project/${projectId}`, 'GET'),
  });

  // Fetch all contacts for subcontractor info
  const { data: contacts = [] } = useQuery({
    queryKey: ['/api/contacts'],
  });

  // Send reminder mutation
  const sendReminderMutation = useMutation({
    mutationFn: async (data: { bidProcessId: number; message: string }) => {
      return apiRequest('/api/bid-processes/remind', 'POST', data);
    },
    onSuccess: () => {
      toast({
        title: "Reminder Sent",
        description: "Bid reminder has been sent to all invited subcontractors",
      });
      setReminderDialogOpen(false);
      setReminderMessage('');
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to send reminder",
        variant: "destructive",
      });
    },
  });

  // Award bid mutation
  const awardBidMutation = useMutation({
    mutationFn: async (bidResponseId: number) => {
      return apiRequest(`/api/bid-responses/${bidResponseId}/select`, 'PATCH');
    },
    onSuccess: () => {
      toast({
        title: "Bid Awarded and Files Transferred",
        description: "Bid has been awarded, estimate updated, and bid documents transferred to estimate item",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/bid-responses/project'] });
      queryClient.invalidateQueries({ queryKey: ['/api/estimates'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to award bid",
        variant: "destructive",
      });
    },
  });

  // Close bidding process mutation
  const closeBiddingMutation = useMutation({
    mutationFn: async (bidProcessId: number) => {
      return apiRequest(`/api/bid-processes/${bidProcessId}/close`, 'PATCH');
    },
    onSuccess: () => {
      toast({
        title: "Bidding Closed",
        description: "Bidding process has been closed",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/bid-processes/project'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to close bidding process",
        variant: "destructive",
      });
    },
  });

  // Get bid responses for a specific process
  const getBidResponsesForProcess = (bidProcessId: number) => {
    return bidResponses.filter((response: BidResponse) => response.bidProcessId === bidProcessId);
  };

  // Get contact info for a bid response
  const getContactInfo = (contactId: number) => {
    return (contacts as any[]).find((contact: any) => contact.id === contactId);
  };

  // Calculate bidding statistics
  const getBiddingStats = (bidProcess: BidProcess) => {
    const responses = getBidResponsesForProcess(bidProcess.id);
    const invitedCount = bidProcess.invitedSubcontractors?.length || 0;
    const responseCount = responses.length;
    const responseRate = invitedCount > 0 ? (responseCount / invitedCount) * 100 : 0;
    
    const amounts = responses.map((r: any) => r.bidAmount);
    const avgAmount = amounts.length > 0 ? amounts.reduce((a: number, b: number) => a + b, 0) / amounts.length : 0;
    const minAmount = amounts.length > 0 ? Math.min(...amounts) : 0;
    const maxAmount = amounts.length > 0 ? Math.max(...amounts) : 0;
    
    return {
      invitedCount,
      responseCount,
      responseRate,
      avgAmount,
      minAmount,
      maxAmount,
      isOverdue: new Date(bidProcess.deadline) < new Date(),
    };
  };

  // Render bid response comparison
  const renderBidComparison = (bidProcess: BidProcess) => {
    const responses = getBidResponsesForProcess(bidProcess.id);
    const stats = getBiddingStats(bidProcess);
    
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="p-3 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-theme-primary">{stats.responseCount}</div>
            <div className="text-sm text-gray-600">Responses</div>
          </div>
          <div className="p-3 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">{formatCurrency(stats.minAmount)}</div>
            <div className="text-sm text-gray-600">Lowest Bid</div>
          </div>
          <div className="p-3 bg-orange-50 rounded-lg">
            <div className="text-2xl font-bold text-orange-600">{formatCurrency(stats.avgAmount)}</div>
            <div className="text-sm text-gray-600">Average</div>
          </div>
        </div>

        <div className="space-y-3">
          {responses.map((response) => {
            const contact = getContactInfo(response.contactId);
            const isLowest = response.bidAmount === stats.minAmount;
            const isHighest = response.bidAmount === stats.maxAmount;
            
            return (
              <Card key={response.id} className={`${isLowest ? 'ring-2 ring-green-500' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="font-semibold">{contact?.company || contact?.name}</div>
                        <div className="text-sm text-gray-600">{contact?.email}</div>
                      </div>
                      {isLowest && (
                        <Badge variant="default" className="bg-green-100 text-green-800">
                          <Trophy className="h-3 w-3 mr-1" />
                          Lowest
                        </Badge>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold">{formatCurrency(response.bidAmount)}</div>
                      <div className="text-sm text-gray-600">{response.timeline} days</div>
                    </div>
                  </div>

                  {response.notes && (
                    <div className="mb-3 p-2 bg-gray-50 rounded text-sm">
                      {response.notes}
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-500">
                      Submitted {response.submittedAt && !isNaN(Date.parse(response.submittedAt)) ? format(new Date(response.submittedAt), 'MMM d, yyyy') : 'Date unknown'}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => awardBidMutation.mutate(response.id)}
                        disabled={awardBidMutation.isPending || response.status === 'selected'}
                      >
                        {response.status === 'selected' ? (
                          <>
                            <Check className="h-4 w-4 mr-1" />
                            Selected
                          </>
                        ) : (
                          <>
                            <Trophy className="h-4 w-4 mr-1" />
                            Award
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  };

  if (loadingProcesses || loadingResponses) {
    return <div className="p-4">Loading bid responses...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Bid Response Management</h3>
        <Badge variant="outline">
          {bidProcesses.length} Active Processes
        </Badge>
      </div>

      <div className="grid gap-4">
        {bidProcesses.map((bidProcess: BidProcess) => {
          const stats = getBiddingStats(bidProcess);
          const responses = getBidResponsesForProcess(bidProcess.id);
          const hasResponses = responses.length > 0;

          return (
            <Card key={bidProcess.id} className={stats.isOverdue ? 'border-red-200 bg-red-50' : ''}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-lg">{bidProcess.trade}</CardTitle>
                    <Badge variant={stats.isOverdue ? 'destructive' : 'secondary'}>
                      {stats.isOverdue ? 'Overdue' : 'Active'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Dialog open={reminderDialogOpen && selectedBidProcess?.id === bidProcess.id}>
                      <DialogTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setSelectedBidProcess(bidProcess);
                            setReminderDialogOpen(true);
                          }}
                        >
                          <Send className="h-4 w-4 mr-1" />
                          Remind
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Send Bid Reminder</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <Label htmlFor="reminderMessage">Message</Label>
                            <Textarea
                              id="reminderMessage"
                              value={reminderMessage}
                              onChange={(e) => setReminderMessage(e.target.value)}
                              placeholder="Enter reminder message for subcontractors..."
                              className="mt-1"
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button 
                              variant="outline" 
                              onClick={() => {
                                setReminderDialogOpen(false);
                                setReminderMessage('');
                              }}
                            >
                              Cancel
                            </Button>
                            <Button 
                              onClick={() => sendReminderMutation.mutate({ 
                                bidProcessId: bidProcess.id, 
                                message: reminderMessage 
                              })}
                              disabled={sendReminderMutation.isPending}
                            >
                              Send Reminder
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>

                    {hasResponses && (
                      <Dialog open={comparisonDialogOpen && selectedBidProcess?.id === bidProcess.id}>
                        <DialogTrigger asChild>
                          <Button 
                            variant="default" 
                            size="sm"
                            onClick={() => {
                              setSelectedBidProcess(bidProcess);
                              setComparisonDialogOpen(true);
                            }}
                          >
                            <FileText className="h-4 w-4 mr-1" />
                            Compare ({responses.length})
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl">
                          <DialogHeader>
                            <DialogTitle>Bid Comparison - {bidProcess.trade}</DialogTitle>
                          </DialogHeader>
                          {renderBidComparison(bidProcess)}
                          <div className="flex justify-end">
                            <Button 
                              variant="outline" 
                              onClick={() => setComparisonDialogOpen(false)}
                            >
                              Close
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-gray-500" />
                      <span>Est: {formatCurrency(bidProcess.estimatedCost)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-gray-500" />
                      <span>Due: {bidProcess.deadline && !isNaN(Date.parse(bidProcess.deadline)) ? format(new Date(bidProcess.deadline), 'MMM d') : 'Not set'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Send className="h-4 w-4 text-gray-500" />
                      <span>Invited: {stats.invitedCount}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-gray-500" />
                      <span>Responses: {stats.responseCount}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Response Rate</span>
                      <span className="font-medium">{stats.responseRate.toFixed(0)}%</span>
                    </div>
                    <Progress value={stats.responseRate} className="h-2" />
                  </div>

                  {hasResponses && (
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="font-medium text-green-600">Lowest</div>
                          <div>{formatCurrency(stats.minAmount)}</div>
                        </div>
                        <div>
                          <div className="font-medium text-theme-primary">Average</div>
                          <div>{formatCurrency(stats.avgAmount)}</div>
                        </div>
                        <div>
                          <div className="font-medium text-orange-600">Highest</div>
                          <div>{formatCurrency(stats.maxAmount)}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {!hasResponses && (
                    <div className="p-4"></div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {bidProcesses.length === 0 && (
        <Card className="bg-gray-50">
          <CardContent className="p-4">
          </CardContent>
        </Card>
      )}
    </div>
  );
}
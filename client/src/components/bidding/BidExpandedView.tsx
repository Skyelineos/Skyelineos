import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { 
  Clock, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  Bell, 
  Award, 
  FileText,
  Calendar,
  DollarSign,
  Timer,
  User
} from 'lucide-react';
import { format, addBusinessDays, differenceInDays, isPast } from 'date-fns';

interface BidSubmission {
  subId: string;
  subName: string;
  subCompany: string;
  trade: string;
  bidAmount?: number;
  durationDays?: number;
  submittedAt?: string;
  bidSentAt: string;
  status: 'pending' | 'submitted' | 'expired';
  attachments?: string[];
  lastReminderSentAt?: string;
}

interface BidExpandedViewProps {
  bidItem: {
    id: string;
    trade: string;
    description: string;
    estimatedCost: number;
    bids: BidSubmission[];
    selectedSubId?: string;
    status: string;
    projectId: string;
  };
  onUpdateBid: (bidItemId: string, updates: any) => void;
  children: React.ReactNode;
}

export function BidExpandedView({ bidItem, onUpdateBid, children }: BidExpandedViewProps) {
  const { toast } = useToast();
  const [selectedWinner, setSelectedWinner] = useState<string | null>(bidItem.selectedSubId || null);
  const [isAwarding, setIsAwarding] = useState(false);

  const calculateDeadline = (bidSentAt: string) => {
    const sentDate = new Date(bidSentAt);
    return addBusinessDays(sentDate, 3);
  };

  const getTimeUntilDeadline = (bidSentAt: string) => {
    const deadline = calculateDeadline(bidSentAt);
    const now = new Date();
    const daysLeft = differenceInDays(deadline, now);
    
    if (daysLeft < 0) return `${Math.abs(daysLeft)} days overdue`;
    if (daysLeft === 0) return 'Due today';
    return `${daysLeft} days left`;
  };

  const getBidStatus = (bid: BidSubmission) => {
    const deadline = calculateDeadline(bid.bidSentAt);
    const now = new Date();
    
    if (bid.submittedAt) return 'submitted';
    if (isPast(deadline)) return 'expired';
    return 'pending';
  };

  const getStatusColor = (status: string, isSelected?: boolean) => {
    if (isSelected) return 'bg-green-50 border-green-200';
    switch (status) {
      case 'submitted': return 'bg-blue-50 border-blue-200';
      case 'pending': return 'bg-yellow-50 border-yellow-200';
      case 'expired': return 'bg-gray-50 border-gray-200';
      default: return 'bg-white border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'submitted': return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'pending': return <Clock className="w-4 h-4 text-yellow-600" />;
      case 'expired': return <XCircle className="w-4 h-4 text-red-600" />;
      default: return <AlertTriangle className="w-4 h-4 text-gray-600" />;
    }
  };

  const sendReminder = async (bid: BidSubmission) => {
    try {
      // API call to send reminder
      const response = await fetch('/api/bids/send-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: bidItem.projectId,
          bidItemId: bidItem.id,
          subId: bid.subId,
          trade: bidItem.trade,
          description: bidItem.description
        })
      });

      if (response.ok) {
        // Update the lastReminderSentAt timestamp
        const updatedBids = bidItem.bids.map(b => 
          b.subId === bid.subId 
            ? { ...b, lastReminderSentAt: new Date().toISOString() }
            : b
        );
        
        onUpdateBid(bidItem.id, { bids: updatedBids });
        
        toast({
          title: "Reminder Sent",
          description: `Reminder sent to ${bid.subName} via email and text`,
        });
      } else {
        throw new Error('Failed to send reminder');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send reminder. Please try again.",
        variant: "destructive",
      });
    }
  };

  const awardBid = async (winnerSubId: string) => {
    setIsAwarding(true);
    try {
      // Update bid item with selected subcontractor
      const updates = {
        selectedSubId: winnerSubId,
        status: 'waiting_approval'
      };
      
      // API call to update bid and trigger client approval process
      const response = await fetch(`/api/bids/${bidItem.id}/award`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: bidItem.projectId,
          selectedSubId: winnerSubId
        })
      });

      if (response.ok) {
        onUpdateBid(bidItem.id, updates);
        setSelectedWinner(winnerSubId);
        
        const winner = bidItem.bids.find(b => b.subId === winnerSubId);
        toast({
          title: "Bid Awarded",
          description: `Job awarded to ${winner?.subName}. Client approval notification sent.`,
        });
      } else {
        throw new Error('Failed to award bid');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to award bid. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAwarding(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Bid Details: {bidItem.trade}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Bid Item Summary */}
          <Card className="bg-gray-50">
            <CardHeader>
              <CardTitle className="text-lg">Item Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-600">Trade</p>
                  <p className="text-lg">{bidItem.trade}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Estimated Cost</p>
                  <p className="text-lg font-semibold text-green-600">
                    {formatCurrency(bidItem.estimatedCost)}
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <p className="text-sm font-medium text-gray-600">Description</p>
                <p className="text-gray-800">{bidItem.description}</p>
              </div>
            </CardContent>
          </Card>

          {/* Bidders List */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Invited Bidders ({bidItem.bids.length})</h3>
              <Badge variant="outline" className="text-sm">
                Status: {bidItem.status.replace('_', ' ')}
              </Badge>
            </div>

            <div className="space-y-4">
              {bidItem.bids.map((bid) => {
                const currentStatus = getBidStatus(bid);
                const isSelected = selectedWinner === bid.subId;
                const deadline = calculateDeadline(bid.bidSentAt);
                const timeInfo = getTimeUntilDeadline(bid.bidSentAt);
                
                return (
                  <Card
                    key={bid.subId}
                    className={`transition-all ${getStatusColor(currentStatus, isSelected)} ${
                      isSelected ? 'ring-2 ring-green-500' : ''
                    }`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        {/* Bidder Info */}
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-gray-500" />
                              <h4 className="font-semibold text-lg">{bid.subName}</h4>
                              {isSelected && (
                                <Badge className="bg-green-600">
                                  <Award className="w-3 h-3 mr-1" />
                                  Winner
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {getStatusIcon(currentStatus)}
                              <Badge variant="outline" className="text-xs">
                                {currentStatus}
                              </Badge>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <p className="text-gray-600">Company</p>
                              <p className="font-medium">{bid.subCompany}</p>
                            </div>
                            <div>
                              <p className="text-gray-600">Trade</p>
                              <p className="font-medium">{bid.trade}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-gray-500" />
                              <div>
                                <p className="text-gray-600">Deadline</p>
                                <p className="font-medium">{format(deadline, 'MMM d, yyyy')}</p>
                                <p className="text-xs text-gray-500">{timeInfo}</p>
                              </div>
                            </div>
                            <div>
                              <p className="text-gray-600">Sent</p>
                              <p className="font-medium">
                                {format(new Date(bid.bidSentAt), 'MMM d')}
                              </p>
                            </div>
                          </div>

                          {/* Bid Submission Details */}
                          {bid.submittedAt && (
                            <div className="mt-3 p-3 bg-white rounded-md border">
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                                <div className="flex items-center gap-2">
                                  <DollarSign className="w-4 h-4 text-green-600" />
                                  <div>
                                    <p className="text-gray-600">Bid Amount</p>
                                    <p className="font-semibold text-green-600">
                                      {bid.bidAmount ? formatCurrency(bid.bidAmount) : 'N/A'}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Timer className="w-4 h-4 text-theme-primary" />
                                  <div>
                                    <p className="text-gray-600">Duration</p>
                                    <p className="font-semibold text-theme-primary">
                                      {bid.durationDays ? `${bid.durationDays} days` : 'N/A'}
                                    </p>
                                  </div>
                                </div>
                                <div>
                                  <p className="text-gray-600">Submitted</p>
                                  <p className="font-medium">
                                    {format(new Date(bid.submittedAt), 'MMM d, h:mm a')}
                                  </p>
                                </div>
                              </div>
                              
                              {bid.attachments && bid.attachments.length > 0 && (
                                <div className="mt-2">
                                  <p className="text-sm text-gray-600 mb-1">Attachments:</p>
                                  <div className="flex gap-2">
                                    {bid.attachments.map((attachment, index) => (
                                      <Badge key={index} variant="secondary" className="text-xs">
                                        <FileText className="w-3 h-3 mr-1" />
                                        Document {index + 1}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-col gap-2 ml-4">
                          {currentStatus === 'pending' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => sendReminder(bid)}
                              className="text-xs"
                            >
                              <Bell className="w-3 h-3 mr-1" />
                              Send Reminder
                            </Button>
                          )}

                          {currentStatus === 'submitted' && !selectedWinner && (
                            <Button
                              onClick={() => awardBid(bid.subId)}
                              disabled={isAwarding}
                              size="sm"
                              className="text-xs bg-green-600 hover:bg-green-700"
                            >
                              <Award className="w-3 h-3 mr-1" />
                              Award Job
                            </Button>
                          )}

                          <Button variant="ghost" size="sm" className="text-xs">
                            View Details
                          </Button>
                        </div>
                      </div>

                      {bid.lastReminderSentAt && (
                        <div className="mt-2 text-xs text-gray-500 flex items-center gap-1">
                          <Bell className="w-3 h-3" />
                          Last reminder: {format(new Date(bid.lastReminderSentAt), 'MMM d, h:mm a')}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {bidItem.bids.length === 0 && (
              <div className="p-4"></div>
            )}
          </div>

          {/* Summary Stats */}
          {bidItem.bids.length > 0 && (
            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle className="text-base">Bid Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Total Invited</p>
                    <p className="text-2xl font-bold">{bidItem.bids.length}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Submitted</p>
                    <p className="text-2xl font-bold text-green-600">
                      {bidItem.bids.filter(b => getBidStatus(b) === 'submitted').length}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600">Pending</p>
                    <p className="text-2xl font-bold text-yellow-600">
                      {bidItem.bids.filter(b => getBidStatus(b) === 'pending').length}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600">Expired</p>
                    <p className="text-2xl font-bold text-red-600">
                      {bidItem.bids.filter(b => getBidStatus(b) === 'expired').length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
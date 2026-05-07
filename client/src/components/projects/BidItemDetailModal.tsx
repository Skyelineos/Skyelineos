import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { BidSubmissionDetailsModal } from './BidSubmissionDetailsModal';
import { 
  Clock, 
  DollarSign, 
  FileText, 
  Bell, 
  Award, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Calendar,
  User,
  Building2,
  Eye,
  Edit2,
  Trash2,
  Send,
  Users
} from 'lucide-react';
import type { Contact } from '@shared/messaging-types';

interface BidItemDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  bidItem: any;
  onSendReminder: (subId: string) => void;
  onAwardBid: (subId: string, bidData: any) => void;
  onViewBidDetails: (bidData: any) => void;
  onInviteBids?: (item: any) => void;
  onEditItem?: (item: any) => void;
  onDeleteBidProcess?: (itemId: number) => void;
}

export function BidItemDetailModal({ 
  isOpen, 
  onClose, 
  bidItem, 
  onSendReminder, 
  onAwardBid, 
  onViewBidDetails,
  onInviteBids,
  onEditItem,
  onDeleteBidProcess
}: BidItemDetailModalProps) {
  const { toast } = useToast();
  const [selectedWinner, setSelectedWinner] = useState<string | null>(bidItem?.selectedSubId || null);
  const [viewDetailsOpen, setViewDetailsOpen] = useState(false);
  const [selectedBidResponseId, setSelectedBidResponseId] = useState<number | null>(null);
  
  if (!bidItem) return null;

  // Extract data from the new structure
  const invitations = bidItem.invitations || [];
  const bidResponses = bidItem.bidResponses || [];
  const contacts = bidItem.contacts || [];
  
  // Helper function to get contractor info
  const getContractorInfo = (subcontractorId: number) => {
    const contractor = contacts.find((c: Contact) => c.id === subcontractorId);
    return {
      name: contractor?.name || `Contact ${subcontractorId}`,
      company: contractor?.company || `Company ${subcontractorId}`,
      email: contractor?.email || '',
      phone: contractor?.phone || ''
    };
  };

  // Transform invitations to match expected format
  const transformedInvitations = invitations.map((inv: any) => {
    const contractor = getContractorInfo(inv.subcontractorId);
    const response = bidResponses.find((br: any) => br.subcontractorId === inv.subcontractorId);
    
    // Check if this bid has been awarded or declined
    let status = 'pending';
    if (response) {
      if (response.status === 'awarded') {
        status = 'awarded';
      } else if (response.status === 'declined') {
        status = 'declined';
      } else {
        status = 'submitted';
      }
    }
    
    // Search/lookup operation
    
    return {
      subId: inv.subcontractorId,
      subName: contractor.name,
      subCompany: contractor.company,
      trade: inv.trade,
      bidSentAt: inv.sentAt,
      status: status,
      bidAmount: response?.proposedCost || response?.bidAmount,
      durationDays: response?.duration || 0,
      submittedAt: response?.submittedAt,
      attachments: response?.attachments || [],
      estimateItemId: response?.estimateItemId || inv.estimateItemId || bidItem.estimateItemId || bidItem.id
    };
  });

  // Calculate business days deadline (3 business days from bidSentAt)
  const calculateDeadline = (bidSentAt: string) => {
    const sentDate = new Date(bidSentAt);
    let businessDaysAdded = 0;
    let currentDate = new Date(sentDate);
    
    while (businessDaysAdded < 3) {
      currentDate.setDate(currentDate.getDate() + 1);
      // Skip weekends (0 = Sunday, 6 = Saturday)
      if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
        businessDaysAdded++;
      }
    }
    return currentDate;
  };

  // Calculate time since bid request
  const getTimeSinceBidSent = (bidSentAt: string) => {
    const sentDate = new Date(bidSentAt);
    const now = new Date();
    const diffInMs = now.getTime() - sentDate.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    
    if (diffInDays > 0) {
      return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
    } else if (diffInHours > 0) {
      return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
    } else {
      return 'Just now';
    }
  };

  // Determine bid status with deadline logic
  const getBidStatus = (bid: any) => {
    // Priority 1: Check if bid has been awarded or declined
    if (bid.status === 'awarded') return 'awarded';
    if (bid.status === 'declined') return 'declined';
    if (bid.status === 'submitted') return 'submitted';
    
    const deadline = calculateDeadline(bid.bidSentAt);
    const now = new Date();
    
    if (now > deadline) {
      return 'expired';
    }
    
    // Check if nearing deadline (within 24 hours)
    const hoursUntilDeadline = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursUntilDeadline <= 24) {
      return 'warning';
    }
    
    return 'pending';
  };

  // Get status badge styling
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'awarded':
        return <Badge className="bg-green-500 text-white border-green-300">AWARDED</Badge>;
      case 'declined':
        return <Badge className="bg-red-500 text-white border-red-300">Declined</Badge>;
      case 'submitted':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Submitted</Badge>;
      case 'expired':
        return <Badge className="bg-red-100 text-red-800 border-red-200">Expired</Badge>;
      case 'warning':
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Due Soon</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800 border-gray-200">Pending</Badge>;
    }
  };

  // Get card styling based on status
  const getCardStyling = (bid: any, status: string) => {
    switch (status) {
      case 'awarded':
        return "border-green-500 bg-green-50";
      case 'declined':
        return "border-red-300 bg-red-50";
      case 'warning':
        return "border-yellow-400 bg-yellow-50";
      case 'expired':
        return "border-gray-300 bg-gray-50";
      case 'submitted':
        return "border-blue-400 bg-blue-50";
      default:
        return "border-gray-200";
    }
  };

  const handleSendReminder = (subId: string) => {
    onSendReminder(subId);
    toast({
      title: "Reminder Sent",
      description: "Email and text reminder sent to subcontractor.",
    });
  };

  const handleAwardBid = (bid: any) => {
    // Development logging removed
    
    // Find the actual bid response from the bid responses data
    const bidResponse = bidResponses.find((br: any) => br.subcontractorId === bid.subId);
    
    if (!bidResponse) {
      toast({
        title: "Error",
        description: "Could not find bid response data for awarding",
        variant: "destructive"
      });
      return;
    }
    
    // Development logging removed
    
    setSelectedWinner(bid.subId);
    onAwardBid(bid.subId, bidResponse);
    toast({
      title: "Bid Awarded",
      description: `Job awarded to ${bid.subName}. Client approval required.`,
    });
  };

  const formatDeadline = (bidSentAt: string) => {
    const deadline = calculateDeadline(bidSentAt);
    return deadline.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {bidItem.title || bidItem.trade} - All Bidders
          </DialogTitle>
          <DialogDescription>
            {bidItem.description} • Estimated Cost: ${bidItem.estimatedCost?.toLocaleString()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">

          {/* Bidders List */}
          <div className="space-y-3">
            <h4 className="font-semibold text-lg">Invited Subcontractors</h4>
            
            {transformedInvitations.length > 0 ? transformedInvitations.map((bid: any, index: number) => {
              const status = getBidStatus(bid);
              const deadline = formatDeadline(bid.bidSentAt);
              const timeSince = getTimeSinceBidSent(bid.bidSentAt);
              
              return (
                <Card key={index} className={`transition-all duration-200 ${getCardStyling(bid, status)}`}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="font-semibold text-lg">{bid.subName}</div>
                          <div className="text-sm text-gray-600">{bid.subCompany}</div>
                        </div>
                        {selectedWinner === bid.subId && (
                          <Badge className="bg-green-600 text-white">
                            <Award className="h-3 w-3 mr-1" />
                            Selected Winner
                          </Badge>
                        )}
                      </div>
                      {getStatusBadge(status)}
                    </div>

                    {/* Bid Details (if submitted) */}
                    {bid.status === 'submitted' && (
                      <div className="mt-3 flex gap-6 text-sm">
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-green-600" />
                          <span className="font-medium">Bid:</span> ${bid.bidAmount?.toLocaleString()}
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-theme-primary" />
                          <span className="font-medium">Duration:</span> {bid.durationDays} days
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-2 flex-wrap">
                      {(bid.status === 'submitted' || bid.status === 'awarded' || bid.status === 'declined') && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              // Find the bid response ID for this subcontractor
                              const bidResponse = bidResponses.find((br: any) => br.subcontractorId === bid.subId);
                              if (bidResponse) {
                                setSelectedBidResponseId(bidResponse.id);
                                setViewDetailsOpen(true);
                              } else {
                                toast({
                                  title: "Error",
                                  description: "Could not find bid response details",
                                  variant: "destructive"
                                });
                              }
                            }}
                            className="flex items-center gap-1"
                          >
                            <Eye className="h-3 w-3" />
                            View Details
                          </Button>
                          
                          {bid.status === 'submitted' && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-1"
                                >
                                  <Award className="h-3 w-3" />
                                  Award Job
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Award Job to {bid.subName}?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will select {bid.subName} as the winning bidder for {bidItem.trade} work. 
                                    The bid amount is ${bid.bidAmount?.toLocaleString()} for {bid.durationDays} days.
                                    This will require client approval before proceeding.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction 
                                    onClick={() => {
                                      // Development logging removed
                                      // Development logging removed);
                                      // Development logging removed);
                                      
                                      // Use the estimateItemId from bid response data
                                      const itemId = bid.estimateItemId || bidItem.estimateItemId || bidItem.id;
                                      // Development logging removed
                                      
                                      onAwardBid(bid.subId, { 
                                        ...bid, 
                                        itemId: itemId,
                                        estimateItemId: itemId,
                                        bidAmount: bid.bidAmount,
                                        durationDays: bid.durationDays
                                      });
                                    }}
                                    className="bg-green-600 hover:bg-green-700"
                                  >
                                    Award Job
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </>
                      )}

                      {bid.status === 'pending' && status !== 'expired' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSendReminder(bid.subId)}
                          className="flex items-center gap-1 text-orange-600 hover:text-orange-700"
                        >
                          <Bell className="h-3 w-3" />
                          Send Reminder
                        </Button>
                      )}

                      {status === 'expired' && (
                        <Badge className="bg-red-100 text-red-800 border-red-200 flex items-center gap-1">
                          <XCircle className="h-3 w-3" />
                          Deadline Passed
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            }) : (
            <div className="text-center py-8 text-gray-500">
              <Building2 className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>No subcontractors have been invited to bid on this item yet.</p>
            </div>
          )}
          </div>

        </div>

        <DialogFooter className="gap-2">
          {/* Primary Actions */}
          <div className="flex gap-2 flex-wrap">
            {/* Invite Bids - Only show for Estimating status */}
            {bidItem.status === 'Estimating' && onInviteBids && (
              <Button
                onClick={() => {
                  onInviteBids(bidItem);
                  onClose();
                }}
                className="bg-theme-primary hover:bg-theme-primary-hover text-white"
              >
                <Send className="h-4 w-4 mr-2" />
                Invite Bids
              </Button>
            )}

            {/* Send Reminder - Only if bidding is active with pending responses */}
            {(() => {
              // Check if there are any invited subcontractors
              const hasInvitations = transformedInvitations.length > 0;
              
              // Check if there are any pending bids (not submitted yet)
              const hasPendingBids = transformedInvitations.some((bid: any) => 
                bid.status === 'pending' || bid.status === 'invited' || bid.status === 'no_response'
              );
              
              // Check if job has been awarded
              const isJobAwarded = bidItem.status === 'Job Awarded' || bidItem.status === 'Approved';
              
              // Show button only if: has invitations AND has pending bids AND job not awarded
              const shouldShowReminder = hasInvitations && hasPendingBids && !isJobAwarded;
              
              return shouldShowReminder ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    // Send reminder to all pending bidders
                    transformedInvitations.forEach((bid: any) => {
                      if (bid.status === 'pending' || bid.status === 'invited' || bid.status === 'no_response') {
                        onSendReminder(bid.subId);
                      }
                    });
                    toast({
                      title: "Reminders Sent",
                      description: "Reminders sent to all pending subcontractors.",
                    });
                  }}
                  className="text-orange-600 hover:text-orange-700 border-orange-200"
                >
                  <Bell className="h-4 w-4 mr-2" />
                  Send Reminder to All
                </Button>
              ) : null;
            })()}

            {/* Edit Item */}
            {onEditItem && (
              <Button
                variant="outline"
                onClick={() => {
                  onEditItem(bidItem);
                  onClose();
                }}
              >
                <Edit2 className="h-4 w-4 mr-2" />
                Edit Item
              </Button>
            )}

            {/* Delete Bid Process */}
            {bidItem.bids?.length > 0 && onDeleteBidProcess && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="text-red-600 hover:text-red-700 border-red-200"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Bid Process
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Bid Process?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete the bid process for "{bidItem.trade}" and cancel all pending invitations. 
                      Subcontractors will be notified that this bid opportunity is no longer available.
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={() => {
                        onDeleteBidProcess?.(bidItem.id);
                        onClose();
                      }}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Delete Process
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>

          {/* Close button */}
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
      
      {/* View Details Modal */}
      <BidSubmissionDetailsModal
        isOpen={viewDetailsOpen}
        onClose={() => setViewDetailsOpen(false)}
        bidResponseId={selectedBidResponseId}
      />
    </Dialog>
  );
}
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BidExpandedView } from './BidExpandedView';
import { 
  DollarSign, 
  Clock, 
  Users, 
  Eye, 
  CheckCircle, 
  AlertTriangle,
  XCircle
} from 'lucide-react';

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

interface BidItemCardProps {
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
}

export function BidItemCard({ bidItem, onUpdateBid }: BidItemCardProps) {
  const submittedBids = bidItem.bids.filter(b => b.submittedAt);
  const pendingBids = bidItem.bids.filter(b => !b.submittedAt && b.status !== 'expired');
  const expiredBids = bidItem.bids.filter(b => b.status === 'expired');

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'waiting_approval': return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'bidding': return <Clock className="w-4 h-4 text-yellow-600" />;
      case 'awarded': return <CheckCircle className="w-4 h-4 text-theme-primary" />;
      default: return <AlertTriangle className="w-4 h-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'waiting_approval': return 'bg-green-100 text-green-800';
      case 'bidding': return 'bg-yellow-100 text-yellow-800';
      case 'awarded': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const lowestBid = submittedBids.reduce((min, bid) => {
    return bid.bidAmount && (!min || bid.bidAmount < min) ? bid.bidAmount : min;
  }, 0);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg font-semibold">{bidItem.trade}</CardTitle>
            <p className="text-sm text-gray-600 mt-1">{bidItem.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={getStatusColor(bidItem.status)} variant="secondary">
              {getStatusIcon(bidItem.status)}
              <span className="ml-1">{bidItem.status.replace('_', ' ')}</span>
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-green-600" />
            <div>
              <p className="text-xs text-gray-600">Estimated</p>
              <p className="font-semibold">{formatCurrency(bidItem.estimatedCost)}</p>
            </div>
          </div>
          
          {lowestBid > 0 && (
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-theme-primary" />
              <div>
                <p className="text-xs text-gray-600">Lowest Bid</p>
                <p className="font-semibold text-theme-primary">{formatCurrency(lowestBid)}</p>
              </div>
            </div>
          )}
          
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-purple-600" />
            <div>
              <p className="text-xs text-gray-600">Invited</p>
              <p className="font-semibold">{bidItem.bids.length}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <div>
              <p className="text-xs text-gray-600">Submitted</p>
              <p className="font-semibold text-green-600">{submittedBids.length}</p>
            </div>
          </div>
        </div>

        {/* Status Summary */}
        <div className="flex items-center gap-4 mb-4 text-sm">
          {pendingBids.length > 0 && (
            <div className="flex items-center gap-1 text-yellow-600">
              <Clock className="w-3 h-3" />
              <span>{pendingBids.length} pending</span>
            </div>
          )}
          {expiredBids.length > 0 && (
            <div className="flex items-center gap-1 text-red-600">
              <XCircle className="w-3 h-3" />
              <span>{expiredBids.length} expired</span>
            </div>
          )}
          {bidItem.selectedSubId && (
            <div className="flex items-center gap-1 text-green-600">
              <CheckCircle className="w-3 h-3" />
              <span>Winner selected</span>
            </div>
          )}
        </div>

        {/* Action Button */}
        <BidExpandedView
          bidItem={bidItem}
          onUpdateBid={onUpdateBid}
        >
          <Button variant="outline" className="w-full">
            <Eye className="w-4 h-4 mr-2" />
            View Bidder Details
          </Button>
        </BidExpandedView>
      </CardContent>
    </Card>
  );
}
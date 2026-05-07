import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BidItemCard } from '@/components/bidding/BidItemCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  Search,
  Filter,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertTriangle,
  Users,
  DollarSign,
  RefreshCw
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

interface BidItem {
  id: string;
  projectId: string;
  trade: string;
  description: string;
  estimatedCost: number;
  bids: BidSubmission[];
  selectedSubId?: string;
  status: string;
}

interface BidProcessTabProps {
  projectId: number;
}

export function BidProcessTab({ projectId }: BidProcessTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Fetch bid items for this project
  const { data: bidItems = [], isLoading, error } = useQuery({
    queryKey: ['/api/bid-items', projectId],
    queryFn: async () => {
      const response = await fetch(`/api/bid-items?projectId=${projectId}`);
      if (!response.ok) throw new Error('Failed to fetch bid items');
      return response.json();
    },
    retry: 1
  });

  // Update bid item mutation
  const updateBidMutation = useMutation({
    mutationFn: async ({ bidItemId, updates }: { bidItemId: string; updates: any }) => {
      const response = await fetch(`/api/bid-items/${bidItemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (!response.ok) throw new Error('Failed to update bid item');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bid-items'] });
      toast({
        title: "Success",
        description: "Bid item updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update bid item",
        variant: "destructive",
      });
    }
  });

  const handleUpdateBid = (bidItemId: string, updates: any) => {
    updateBidMutation.mutate({ bidItemId, updates });
  };

  // Helper function to get item status based on bid lifecycle
  const getItemStatus = (item: BidItem) => {
    if (item.bids.length === 0 || item.bids.every(bid => !bid.bidSentAt)) {
      return 'estimating';
    }
    if (item.bids.some(bid => bid.bidSentAt && !bid.submittedAt) && !item.selectedSubId) {
      return 'bidding';
    }
    if (item.bids.length > 0 && item.bids.every(bid => bid.submittedAt) && !item.selectedSubId) {
      return 'waiting_approval';
    }
    if (Boolean(item.selectedSubId) && item.status !== 'rejected') {
      return 'approved';
    }
    if (item.status === 'rejected') {
      return 'rejected';
    }
    return 'estimating'; // fallback
  };

  // Filter bid items based on search and status
  const filteredBidItems = bidItems.filter((item: BidItem) => {
    const matchesSearch = searchTerm === '' || 
      item.trade.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const itemStatus = getItemStatus(item);
    const matchesStatus = statusFilter === 'all' || itemStatus === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Calculate summary statistics based on proper bid lifecycle
  const stats = {
    // Items that haven't started bidding yet (no bids sent)
    estimating: bidItems.filter((item: BidItem) => 
      item.bids.length === 0 || item.bids.every(bid => !bid.bidSentAt)
    ).length,
    
    // Items with active bids sent but not all submitted yet
    bidding: bidItems.filter((item: BidItem) => 
      item.bids.some(bid => bid.bidSentAt && !bid.submittedAt) && 
      !item.selectedSubId
    ).length,
    
    // Items with all bids submitted, waiting for selection
    waitingApproval: bidItems.filter((item: BidItem) => 
      item.bids.length > 0 && 
      item.bids.every(bid => bid.submittedAt) && 
      !item.selectedSubId
    ).length,
    
    // Items with approved/selected subcontractor
    approved: bidItems.filter((item: BidItem) => 
      Boolean(item.selectedSubId) && item.status !== 'rejected'
    ).length,
    
    // Items that were rejected or cancelled
    rejected: bidItems.filter((item: BidItem) => 
      item.status === 'rejected'
    ).length,
    
    // Additional stats
    totalBids: bidItems.reduce((sum: number, item: BidItem) => sum + item.bids.length, 0),
    submittedBids: bidItems.reduce((sum: number, item: BidItem) => 
      sum + item.bids.filter(bid => bid.submittedAt).length, 0),
    estimatedTotal: bidItems.reduce((sum: number, item: BidItem) => sum + item.estimatedCost, 0),
    lowestBidsTotal: bidItems.reduce((sum: number, item: BidItem) => {
      const submittedBids = item.bids.filter(bid => bid.bidAmount);
      if (submittedBids.length === 0) return sum + item.estimatedCost;
      const lowestBid = Math.min(...submittedBids.map(bid => bid.bidAmount!));
      return sum + lowestBid;
    }, 0)
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Unable to Load Bid Items</h3>
          <p className="text-gray-600 mb-4">There was an error loading the bid process data.</p>
          <Button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/bid-items'] })}
            variant="outline"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards - Bid Status Overview */}
      <div className="grid grid-cols-5 gap-4">
        <Card className="bg-gray-50">
          <CardContent className="p-4">
            <div className="text-center">
              <Badge variant="secondary" className="mb-2">Estimating</Badge>
              <p className="text-3xl font-bold">{stats.estimating}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardContent className="p-4">
            <div className="text-center">
              <Badge variant="default" className="mb-2 bg-yellow-500 hover:bg-yellow-600">Bidding</Badge>
              <p className="text-3xl font-bold">{stats.bidding}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardContent className="p-4">
            <div className="text-center">
              <Badge variant="default" className="mb-2 bg-theme-primary hover:bg-theme-primary-hover">Waiting Approval</Badge>
              <p className="text-3xl font-bold">{stats.waitingApproval}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardContent className="p-4">
            <div className="text-center">
              <Badge variant="default" className="mb-2 bg-green-500 hover:bg-green-600">Approved</Badge>
              <p className="text-3xl font-bold">{stats.approved}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardContent className="p-4">
            <div className="text-center">
              <Badge variant="destructive" className="mb-2">Rejected</Badge>
              <p className="text-3xl font-bold">{stats.rejected}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filter & Search
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search by trade or description..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="estimating">Estimating</SelectItem>
                <SelectItem value="bidding">Bidding</SelectItem>
                <SelectItem value="waiting_approval">Waiting Approval</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
              }}
            >
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bid Items Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="h-3 bg-gray-200 rounded"></div>
                  <div className="h-3 bg-gray-200 rounded w-5/6"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredBidItems.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredBidItems.map((bidItem: BidItem) => (
            <BidItemCard
              key={bidItem.id}
              bidItem={bidItem}
              onUpdateBid={handleUpdateBid}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {searchTerm || statusFilter !== 'all' ? 'No Matching Items' : 'No Bid Items Yet'}
            </h3>
            <p className="text-gray-600">
              {searchTerm || statusFilter !== 'all' 
                ? 'Try adjusting your search or filter criteria.'
                : ''}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
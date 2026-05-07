import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency } from '@/lib/utils';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { 
  FileText, 
  CheckCircle, 
  AlertCircle, 
  Eye, 
  Link, 
  Unlink,
  Settings,
  RefreshCw,
  Download,
  Search
} from 'lucide-react';

interface InvoiceMatchingSystemProps {
  projectId: number;
}

export default function InvoiceMatchingSystem({ projectId }: InvoiceMatchingSystemProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedMatching, setSelectedMatching] = useState<any>(null);
  const [showDiscrepancies, setShowDiscrepancies] = useState(false);
  const [matchingThreshold, setMatchingThreshold] = useState(0.85);

  // Fetch invoice matching records
  const { data: invoiceMatching, isLoading: matchingLoading } = useQuery({
    queryKey: [`/api/financial/invoice-matching/${projectId}`],
    refetchInterval: 30000,
  });

  // Fetch unmatched invoices
  const { data: unmatchedInvoices, isLoading: invoicesLoading } = useQuery({
    queryKey: [`/api/financial/unmatched-invoices/${projectId}`],
    refetchInterval: 30000,
  });

  // Fetch unmatched purchase orders
  const { data: unmatchedPOs, isLoading: posLoading } = useQuery({
    queryKey: [`/api/financial/unmatched-pos/${projectId}`],
    refetchInterval: 30000,
  });

  // Auto-match invoices
  const autoMatchMutation = useMutation({
    mutationFn: async (threshold: number) => {
      const response = await apiRequest('/api/financial/auto-match-invoices', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          matchingThreshold: threshold,
        }),
      });
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/financial/invoice-matching/${projectId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/financial/unmatched-invoices/${projectId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/financial/unmatched-pos/${projectId}`] });
      toast({
        title: "Success",
        description: `Auto-matched ${data.matchedCount} invoices`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to auto-match invoices",
        variant: "destructive",
      });
    },
  });

  // Manual match invoices
  const manualMatchMutation = useMutation({
    mutationFn: async ({ invoiceId, purchaseOrderId }: { invoiceId: number; purchaseOrderId: number }) => {
      const response = await apiRequest('/api/financial/manual-match-invoice', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          invoiceId,
          purchaseOrderId,
        }),
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/financial/invoice-matching/${projectId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/financial/unmatched-invoices/${projectId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/financial/unmatched-pos/${projectId}`] });
      toast({
        title: "Success",
        description: "Invoice matched successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to match invoice",
        variant: "destructive",
      });
    },
  });

  // Approve manual match
  const approveMatchMutation = useMutation({
    mutationFn: async ({ matchId, notes }: { matchId: number; notes?: string }) => {
      const response = await apiRequest(`/api/financial/invoice-matching/${matchId}/approve`, {
        method: 'POST',
        body: JSON.stringify({ notes }),
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/financial/invoice-matching/${projectId}`] });
      toast({
        title: "Success",
        description: "Invoice matching approved",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to approve match",
        variant: "destructive",
      });
    },
  });

  // Reject match
  const rejectMatchMutation = useMutation({
    mutationFn: async ({ matchId, notes }: { matchId: number; notes?: string }) => {
      const response = await apiRequest(`/api/financial/invoice-matching/${matchId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ notes }),
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/financial/invoice-matching/${projectId}`] });
      toast({
        title: "Success",
        description: "Invoice matching rejected",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to reject match",
        variant: "destructive",
      });
    },
  });

  const getMatchingStatusColor = (status: string) => {
    switch (status) {
      case 'auto_matched':
        return 'bg-green-100 text-green-800';
      case 'requires_review':
        return 'bg-yellow-100 text-yellow-800';
      case 'manual_match':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getMatchingStatusIcon = (status: string) => {
    switch (status) {
      case 'auto_matched':
        return <CheckCircle className="w-4 h-4" />;
      case 'requires_review':
        return <AlertCircle className="w-4 h-4" />;
      case 'manual_match':
        return <Link className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const getMatchingScoreColor = (score: number) => {
    if (score >= 0.9) return 'text-green-600';
    if (score >= 0.7) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (matchingLoading || invoicesLoading || posLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Invoice Matching System</h2>
          <p className="text-gray-600">Automatically match invoices with purchase orders</p>
        </div>
        <div className="flex gap-2">
          <Select value={matchingThreshold.toString()} onValueChange={(value) => setMatchingThreshold(parseFloat(value))}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Matching threshold" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0.95">95% Match</SelectItem>
              <SelectItem value="0.9">90% Match</SelectItem>
              <SelectItem value="0.85">85% Match</SelectItem>
              <SelectItem value="0.8">80% Match</SelectItem>
              <SelectItem value="0.75">75% Match</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            onClick={() => autoMatchMutation.mutate(matchingThreshold)}
            disabled={autoMatchMutation.isPending}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Auto-Match
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gray-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Auto-Matched</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {invoiceMatching?.filter(m => m.matchingStatus === 'auto_matched').length || 0}
            </div>
            <div className="text-sm text-gray-500">
              High confidence matches
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Needs Review</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {invoiceMatching?.filter(m => m.matchingStatus === 'requires_review').length || 0}
            </div>
            <div className="text-sm text-gray-500">
              Requires manual review
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Unmatched Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {unmatchedInvoices?.length || 0}
            </div>
            <div className="text-sm text-gray-500">
              No matching PO found
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Match Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-theme-primary">
              {invoiceMatching?.length > 0 ? 
                (((invoiceMatching.filter(m => m.matchingStatus === 'auto_matched').length) / invoiceMatching.length) * 100).toFixed(1) : 0}%
            </div>
            <div className="text-sm text-gray-500">
              Automatic matching success
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="matched" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="matched">Matched Invoices</TabsTrigger>
          <TabsTrigger value="unmatched">Unmatched Items</TabsTrigger>
          <TabsTrigger value="discrepancies">Discrepancies</TabsTrigger>
        </TabsList>

        <TabsContent value="matched" className="space-y-4">
          <Card className="bg-gray-50">
            <CardHeader>
              <CardTitle>Invoice Matching Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Invoice #</th>
                      <th className="text-left p-2">PO #</th>
                      <th className="text-left p-2">Vendor</th>
                      <th className="text-right p-2">Invoice Amount</th>
                      <th className="text-right p-2">PO Amount</th>
                      <th className="text-right p-2">Match Score</th>
                      <th className="text-left p-2">Status</th>
                      <th className="text-left p-2">Matched</th>
                      <th className="text-center p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceMatching?.map((match, index) => (
                      <tr key={index} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-medium">INV-{match.invoiceId}</td>
                        <td className="p-2">PO-{match.purchaseOrderId}</td>
                        <td className="p-2">{match.vendorName}</td>
                        <td className="p-2 text-right">{formatCurrency(match.invoiceAmount)}</td>
                        <td className="p-2 text-right">{formatCurrency(match.poAmount)}</td>
                        <td className={`p-2 text-right font-medium ${getMatchingScoreColor(match.matchingScore)}`}>
                          {(match.matchingScore * 100).toFixed(1)}%
                        </td>
                        <td className="p-2">
                          <Badge className={getMatchingStatusColor(match.matchingStatus)}>
                            <div className="flex items-center gap-1">
                              {getMatchingStatusIcon(match.matchingStatus)}
                              {match.matchingStatus.replace('_', ' ')}
                            </div>
                          </Badge>
                        </td>
                        <td className="p-2">
                          {match.autoMatchedAt ? format(new Date(match.autoMatchedAt), 'MMM d, yyyy') : 'Manual'}
                        </td>
                        <td className="p-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedMatching(match)}
                              title="View Details"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            {match.matchingStatus === 'requires_review' && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => approveMatchMutation.mutate({ matchId: match.id })}
                                  disabled={approveMatchMutation.isPending}
                                  title="Approve Match"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => rejectMatchMutation.mutate({ matchId: match.id })}
                                  disabled={rejectMatchMutation.isPending}
                                  title="Reject Match"
                                >
                                  <Unlink className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="unmatched" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle>Unmatched Invoices</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {unmatchedInvoices?.map((invoice, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                      <div>
                        <div className="font-medium">INV-{invoice.id}</div>
                        <div className="text-sm text-gray-500">
                          {invoice.vendorName} • {formatCurrency(invoice.amount)}
                        </div>
                        <div className="text-xs text-gray-400">
                          {format(new Date(invoice.createdAt), 'MMM d, yyyy')}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          title="View Invoice"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Find Match"
                        >
                          <Search className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle>Unmatched Purchase Orders</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {unmatchedPOs?.map((po, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                      <div>
                        <div className="font-medium">PO-{po.id}</div>
                        <div className="text-sm text-gray-500">
                          {po.vendorName} • {formatCurrency(po.amount)}
                        </div>
                        <div className="text-xs text-gray-400">
                          {format(new Date(po.createdAt), 'MMM d, yyyy')}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          title="View PO"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Find Match"
                        >
                          <Search className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="discrepancies" className="space-y-4">
          <Card className="bg-gray-50">
            <CardHeader>
              <CardTitle>Discrepancy Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {invoiceMatching?.filter(m => m.discrepancies && JSON.parse(m.discrepancies).length > 0).map((match, index) => (
                  <div key={index} className="p-4 border rounded">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="font-medium">INV-{match.invoiceId} ↔ PO-{match.purchaseOrderId}</h4>
                        <div className="text-sm text-gray-500">
                          {match.vendorName} • Match Score: {(match.matchingScore * 100).toFixed(1)}%
                        </div>
                      </div>
                      <Badge className={getMatchingStatusColor(match.matchingStatus)}>
                        {match.matchingStatus.replace('_', ' ')}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <h5 className="font-medium text-sm">Discrepancies:</h5>
                      <ul className="space-y-1">
                        {JSON.parse(match.discrepancies || '[]').map((discrepancy: any, discIndex: number) => (
                          <li key={discIndex} className="text-sm flex items-center gap-2">
                            <AlertCircle className="w-3 h-3 text-red-500" />
                            <span>{discrepancy.field}: {discrepancy.description}</span>
                            <span className="text-gray-500">
                              (Expected: {discrepancy.expected}, Actual: {discrepancy.actual})
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex justify-end gap-2 mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => approveMatchMutation.mutate({ matchId: match.id })}
                        disabled={approveMatchMutation.isPending}
                      >
                        Approve Despite Discrepancies
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => rejectMatchMutation.mutate({ matchId: match.id })}
                        disabled={rejectMatchMutation.isPending}
                      >
                        Reject Match
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Match Details Dialog */}
      {selectedMatching && (
        <Dialog open={!!selectedMatching} onOpenChange={() => setSelectedMatching(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Invoice Match Details</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium mb-2">Invoice Information</h4>
                  <div className="space-y-1 text-sm">
                    <div><span className="font-medium">Invoice #:</span> INV-{selectedMatching.invoiceId}</div>
                    <div><span className="font-medium">Amount:</span> {formatCurrency(selectedMatching.invoiceAmount)}</div>
                    <div><span className="font-medium">Date:</span> {format(new Date(selectedMatching.invoiceDate), 'MMM d, yyyy')}</div>
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Purchase Order Information</h4>
                  <div className="space-y-1 text-sm">
                    <div><span className="font-medium">PO #:</span> PO-{selectedMatching.purchaseOrderId}</div>
                    <div><span className="font-medium">Amount:</span> {formatCurrency(selectedMatching.poAmount)}</div>
                    <div><span className="font-medium">Date:</span> {format(new Date(selectedMatching.poDate), 'MMM d, yyyy')}</div>
                  </div>
                </div>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Matching Details</h4>
                <div className="space-y-1 text-sm">
                  <div><span className="font-medium">Match Score:</span> {(selectedMatching.matchingScore * 100).toFixed(1)}%</div>
                  <div><span className="font-medium">Status:</span> {selectedMatching.matchingStatus.replace('_', ' ')}</div>
                  <div><span className="font-medium">Vendor:</span> {selectedMatching.vendorName}</div>
                </div>
              </div>

              {selectedMatching.discrepancies && JSON.parse(selectedMatching.discrepancies).length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Discrepancies</h4>
                  <div className="space-y-2">
                    {JSON.parse(selectedMatching.discrepancies).map((discrepancy: any, index: number) => (
                      <div key={index} className="p-2 bg-red-50 rounded text-sm">
                        <div className="font-medium">{discrepancy.field}</div>
                        <div>{discrepancy.description}</div>
                        <div className="text-xs text-gray-500">
                          Expected: {discrepancy.expected} | Actual: {discrepancy.actual}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSelectedMatching(null)}>
                  Close
                </Button>
                {selectedMatching.matchingStatus === 'requires_review' && (
                  <>
                    <Button 
                      onClick={() => {
                        approveMatchMutation.mutate({ matchId: selectedMatching.id });
                        setSelectedMatching(null);
                      }}
                      disabled={approveMatchMutation.isPending}
                    >
                      Approve Match
                    </Button>
                    <Button 
                      variant="destructive"
                      onClick={() => {
                        rejectMatchMutation.mutate({ matchId: selectedMatching.id });
                        setSelectedMatching(null);
                      }}
                      disabled={rejectMatchMutation.isPending}
                    >
                      Reject Match
                    </Button>
                  </>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
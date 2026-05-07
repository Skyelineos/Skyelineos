import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Eye, FileText, Download, CheckCircle, Clock, Send, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PurchaseOrder {
  id: string;
  poId: string;
  projectId: number;
  subcontractorId: number;
  trade: string;
  amount: number;
  description: string;
  status: 'draft' | 'sent' | 'signed';
  createdAt: string;
  sentToSubAt?: string;
  signedBySubAt?: string;
  projectInfo?: {
    name: string;
    address: string;
  };
}

interface SubcontractorPurchaseOrdersProps {
  subcontractorId: number;
}

export default function SubcontractorPurchaseOrders({ subcontractorId }: SubcontractorPurchaseOrdersProps) {
  const [signingPO, setSigningPO] = useState<string | null>(null);
  const [digitalSignature, setDigitalSignature] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch POs for the subcontractor
  const { data: purchaseOrders = [], isLoading, refetch } = useQuery({
    queryKey: ['/api/purchase-orders/subcontractor', subcontractorId],
    queryFn: async () => {
      const response = await fetch(`/api/purchase-orders/subcontractor/${subcontractorId}`);
      if (!response.ok) throw new Error('Failed to fetch purchase orders');
      return response.json();
    }
  });

  // Sign PO mutation
  const signPOMutation = useMutation({
    mutationFn: async (poId: string) => {
      const response = await fetch(`/api/purchase-orders/${poId}/sign`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          subcontractorId,
          digitalSignature
        })
      });
      if (!response.ok) throw new Error('Failed to sign purchase order');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Purchase Order Signed",
        description: "You have successfully signed the purchase order.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/purchase-orders/subcontractor', subcontractorId] });
      setSigningPO(null);
      setDigitalSignature('');
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: "Signing Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <Badge variant="secondary" className="bg-gray-100 text-gray-800"><Clock className="w-3 h-3 mr-1" />Draft</Badge>;
      case 'sent':
        return <Badge variant="accent" className="bg-blue-100 text-blue-800"><Send className="w-3 h-3 mr-1" />Awaiting Signature</Badge>;
      case 'signed':
        return <Badge variant="accent" className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Signed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  const handleSignPO = () => {
    if (!digitalSignature.trim()) {
      toast({
        title: "Signature Required",
        description: "Please enter your digital signature before signing.",
        variant: "destructive",
      });
      return;
    }
    if (signingPO) {
      signPOMutation.mutate(signingPO);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Purchase Orders</h2>
          <p className="text-gray-600">Review and sign purchase orders sent by the general contractor</p>
        </div>
      </div>

      {purchaseOrders.length === 0 ? (
        <Card className="bg-gray-50">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-500 text-center">
              No purchase orders found. POs will appear here when the general contractor sends them.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {purchaseOrders.map((po: PurchaseOrder) => (
            <Card key={po.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <CardTitle className="text-lg">{po.poId}</CardTitle>
                      <p className="text-sm text-gray-600">
                        {po.trade} • {formatCurrency(po.amount)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(po.status)}
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Project Details</h4>
                    <div className="space-y-1 text-sm">
                      <p><span className="font-medium">Project:</span> {po.projectInfo?.name || `Project ${po.projectId}`}</p>
                      <p><span className="font-medium">Address:</span> {po.projectInfo?.address || 'N/A'}</p>
                      <p><span className="font-medium">Work Description:</span> {po.description}</p>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Contract Details</h4>
                    <div className="space-y-1 text-sm">
                      <p><span className="font-medium">Trade:</span> {po.trade}</p>
                      <p><span className="font-medium">Contract Amount:</span> {formatCurrency(po.amount)}</p>
                      <p><span className="font-medium">PO Created:</span> {formatDate(po.createdAt)}</p>
                      {po.sentToSubAt && (
                        <p><span className="font-medium">Sent Date:</span> {formatDate(po.sentToSubAt)}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <div className="flex justify-between items-center">
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline">
                        <Eye className="w-4 h-4 mr-1" />
                        View Details
                      </Button>
                      <Button size="sm" variant="outline">
                        <Download className="w-4 h-4 mr-1" />
                        Download PDF
                      </Button>
                    </div>
                    
                    {po.status === 'sent' && (
                      <Dialog open={signingPO === po.id} onOpenChange={(open) => setSigningPO(open ? po.id : null)}>
                        <DialogTrigger asChild>
                          <Button size="sm" className="bg-green-600 hover:bg-green-700">
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Sign Purchase Order
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Sign Purchase Order</DialogTitle>
                            <DialogDescription>
                              By signing this purchase order, you agree to perform the specified work for the agreed amount.
                            </DialogDescription>
                          </DialogHeader>
                          
                          <div className="space-y-4">
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                              <div className="flex items-start">
                                <AlertCircle className="h-5 w-5 text-theme-primary mt-0.5 mr-3 flex-shrink-0" />
                                <div>
                                  <h4 className="font-medium text-blue-800">Contract Summary</h4>
                                  <div className="text-sm text-theme-primary mt-1 space-y-1">
                                    <p><strong>PO Number:</strong> {po.poId}</p>
                                    <p><strong>Trade:</strong> {po.trade}</p>
                                    <p><strong>Amount:</strong> {formatCurrency(po.amount)}</p>
                                    <p><strong>Project:</strong> {po.projectInfo?.name}</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                            
                            <div>
                              <Label htmlFor="signature">Digital Signature *</Label>
                              <Textarea
                                id="signature"
                                placeholder="Type your full name to serve as your digital signature..."
                                value={digitalSignature}
                                onChange={(e) => setDigitalSignature(e.target.value)}
                                className="mt-1"
                              />
                              <p className="text-xs text-gray-500 mt-1">
                                By typing your name, you are providing a legally binding digital signature.
                              </p>
                            </div>
                          </div>
                          
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setSigningPO(null)}>
                              Cancel
                            </Button>
                            <Button 
                              onClick={handleSignPO}
                              disabled={signPOMutation.isPending || !digitalSignature.trim()}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              {signPOMutation.isPending ? "Signing..." : "Sign Purchase Order"}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    )}
                    
                    {po.status === 'signed' && po.signedBySubAt && (
                      <div className="text-sm text-green-600 flex items-center">
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Signed on {formatDate(po.signedBySubAt)}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
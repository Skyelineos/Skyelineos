import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/utils';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { 
  Zap, 
  FileText, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  Settings,
  Play,
  Pause,
  RotateCcw,
  Eye,
  Download,
  Send
} from 'lucide-react';

interface AutomatedPOSystemProps {
  projectId: number;
}

export default function AutomatedPOSystem({ projectId }: AutomatedPOSystemProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedBids, setSelectedBids] = useState<number[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [autoGenSettings, setAutoGenSettings] = useState({
    autoApprove: false,
    autoSend: false,
    requireComplianceCheck: true,
    minAmountThreshold: 1000,
    maxAmountThreshold: 50000,
  });

  // Fetch approved bids ready for PO generation
  const { data: approvedBids, isLoading: bidsLoading } = useQuery({
    queryKey: [`/api/financial/approved-bids/${projectId}`],
    refetchInterval: 30000,
  });

  // Fetch automated PO queue
  const { data: automatedPOs, isLoading: posLoading } = useQuery({
    queryKey: [`/api/financial/automated-pos/${projectId}`],
    refetchInterval: 15000,
  });

  // Fetch automation settings
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: [`/api/financial/automation-settings/${projectId}`],
    refetchInterval: 60000,
  });

  // Generate automated POs from selected bids
  const generatePOsMutation = useMutation({
    mutationFn: async (bidIds: number[]) => {
      const response = await apiRequest('/api/financial/generate-automated-pos', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          bidIds,
          settings: autoGenSettings,
        }),
      });
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/financial/automated-pos/${projectId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/financial/approved-bids/${projectId}`] });
      setSelectedBids([]);
      toast({
        title: "Success",
        description: `Generated ${data.count} purchase orders automatically`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to generate automated purchase orders",
        variant: "destructive",
      });
    },
  });

  // Approve automated PO
  const approvePOMutation = useMutation({
    mutationFn: async (poId: number) => {
      const response = await apiRequest(`/api/financial/automated-pos/${poId}/approve`, {
        method: 'POST',
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/financial/automated-pos/${projectId}`] });
      toast({
        title: "Success",
        description: "Purchase order approved successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to approve purchase order",
        variant: "destructive",
      });
    },
  });

  // Send automated PO
  const sendPOMutation = useMutation({
    mutationFn: async (poId: number) => {
      const response = await apiRequest(`/api/financial/automated-pos/${poId}/send`, {
        method: 'POST',
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/financial/automated-pos/${projectId}`] });
      toast({
        title: "Success",
        description: "Purchase order sent to subcontractor",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to send purchase order",
        variant: "destructive",
      });
    },
  });

  // Bulk process selected bids
  const handleBulkGenerate = () => {
    if (selectedBids.length === 0) {
      toast({
        title: "No Selection",
        description: "Please select at least one bid to generate POs",
        variant: "destructive",
      });
      return;
    }
    generatePOsMutation.mutate(selectedBids);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'generated':
        return 'bg-blue-100 text-blue-800';
      case 'sent':
        return 'bg-green-100 text-green-800';
      case 'accepted':
        return 'bg-emerald-100 text-emerald-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4" />;
      case 'generated':
        return <FileText className="w-4 h-4" />;
      case 'sent':
        return <Send className="w-4 h-4" />;
      case 'accepted':
        return <CheckCircle className="w-4 h-4" />;
      default:
        return <AlertCircle className="w-4 h-4" />;
    }
  };

  if (bidsLoading || posLoading || settingsLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
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
          <h2 className="text-2xl font-bold">Automated Purchase Order System</h2>
          <p className="text-gray-600">Generate purchase orders directly from approved bids</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showSettings} onOpenChange={setShowSettings}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Automation Settings</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="auto-approve">Auto-approve POs</Label>
                  <Switch
                    id="auto-approve"
                    checked={autoGenSettings.autoApprove}
                    onCheckedChange={(checked) => 
                      setAutoGenSettings(prev => ({ ...prev, autoApprove: checked }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="auto-send">Auto-send POs</Label>
                  <Switch
                    id="auto-send"
                    checked={autoGenSettings.autoSend}
                    onCheckedChange={(checked) => 
                      setAutoGenSettings(prev => ({ ...prev, autoSend: checked }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="compliance-check">Require compliance check</Label>
                  <Switch
                    id="compliance-check"
                    checked={autoGenSettings.requireComplianceCheck}
                    onCheckedChange={(checked) => 
                      setAutoGenSettings(prev => ({ ...prev, requireComplianceCheck: checked }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="min-threshold">Min Amount Threshold</Label>
                  <input
                    id="min-threshold"
                    type="number"
                    className="w-full p-2 border rounded"
                    value={autoGenSettings.minAmountThreshold}
                    onChange={(e) => 
                      setAutoGenSettings(prev => ({ ...prev, minAmountThreshold: parseInt(e.target.value) }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max-threshold">Max Amount Threshold</Label>
                  <input
                    id="max-threshold"
                    type="number"
                    className="w-full p-2 border rounded"
                    value={autoGenSettings.maxAmountThreshold}
                    onChange={(e) => 
                      setAutoGenSettings(prev => ({ ...prev, maxAmountThreshold: parseInt(e.target.value) }))
                    }
                  />
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Button 
            onClick={handleBulkGenerate}
            disabled={selectedBids.length === 0 || generatePOsMutation.isPending}
          >
            <Zap className="w-4 h-4 mr-2" />
            Generate POs ({selectedBids.length})
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gray-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Available Bids</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-theme-primary">
              {approvedBids?.length || 0}
            </div>
            <div className="text-sm text-gray-500">
              Ready for PO generation
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Pending POs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {automatedPOs?.filter(po => po.status === 'pending').length || 0}
            </div>
            <div className="text-sm text-gray-500">
              Awaiting approval
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Generated POs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {automatedPOs?.filter(po => po.status === 'generated').length || 0}
            </div>
            <div className="text-sm text-gray-500">
              Ready to send
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {formatCurrency(
                automatedPOs?.reduce((sum, po) => sum + parseFloat(po.amount), 0) || 0
              )}
            </div>
            <div className="text-sm text-gray-500">
              Automated POs
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="available" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="available">Available Bids</TabsTrigger>
          <TabsTrigger value="automated">Automated POs</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="available" className="space-y-4">
          <Card className="bg-gray-50">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Approved Bids Ready for PO Generation</span>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    if (selectedBids.length === approvedBids?.length) {
                      setSelectedBids([]);
                    } else {
                      setSelectedBids(approvedBids?.map(bid => bid.id) || []);
                    }
                  }}
                >
                  {selectedBids.length === approvedBids?.length ? 'Deselect All' : 'Select All'}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">
                        <input
                          type="checkbox"
                          checked={selectedBids.length === approvedBids?.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedBids(approvedBids?.map(bid => bid.id) || []);
                            } else {
                              setSelectedBids([]);
                            }
                          }}
                        />
                      </th>
                      <th className="text-left p-2">Trade</th>
                      <th className="text-left p-2">Subcontractor</th>
                      <th className="text-right p-2">Amount</th>
                      <th className="text-left p-2">Timeline</th>
                      <th className="text-left p-2">Compliance</th>
                      <th className="text-center p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvedBids?.map((bid, index) => (
                      <tr key={index} className="border-b hover:bg-gray-50">
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={selectedBids.includes(bid.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedBids(prev => [...prev, bid.id]);
                              } else {
                                setSelectedBids(prev => prev.filter(id => id !== bid.id));
                              }
                            }}
                          />
                        </td>
                        <td className="p-2 font-medium">{bid.trade}</td>
                        <td className="p-2">{bid.subcontractorName}</td>
                        <td className="p-2 text-right font-medium">{formatCurrency(bid.amount)}</td>
                        <td className="p-2">{bid.timeline} days</td>
                        <td className="p-2">
                          <Badge className={bid.isCompliant ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                            {bid.isCompliant ? 'Compliant' : 'Non-Compliant'}
                          </Badge>
                        </td>
                        <td className="p-2 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => generatePOsMutation.mutate([bid.id])}
                            disabled={generatePOsMutation.isPending}
                          >
                            <Zap className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="automated" className="space-y-4">
          <Card className="bg-gray-50">
            <CardHeader>
              <CardTitle>Automated Purchase Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">PO Number</th>
                      <th className="text-left p-2">Trade</th>
                      <th className="text-left p-2">Subcontractor</th>
                      <th className="text-right p-2">Amount</th>
                      <th className="text-left p-2">Status</th>
                      <th className="text-left p-2">Generated</th>
                      <th className="text-center p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {automatedPOs?.map((po, index) => (
                      <tr key={index} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-medium">PO-{po.id}</td>
                        <td className="p-2">{po.trade}</td>
                        <td className="p-2">{po.subcontractorName}</td>
                        <td className="p-2 text-right font-medium">{formatCurrency(po.amount)}</td>
                        <td className="p-2">
                          <Badge className={getStatusColor(po.status)}>
                            <div className="flex items-center gap-1">
                              {getStatusIcon(po.status)}
                              {po.status}
                            </div>
                          </Badge>
                        </td>
                        <td className="p-2">{format(new Date(po.autoGeneratedAt), 'MMM d, yyyy')}</td>
                        <td className="p-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              title="View PO"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            {po.status === 'pending' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => approvePOMutation.mutate(po.id)}
                                disabled={approvePOMutation.isPending}
                                title="Approve PO"
                              >
                                <CheckCircle className="w-4 h-4" />
                              </Button>
                            )}
                            {po.status === 'generated' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => sendPOMutation.mutate(po.id)}
                                disabled={sendPOMutation.isPending}
                                title="Send PO"
                              >
                                <Send className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Download PO"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
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

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle>Generation Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <span>Total POs Generated</span>
                    <span className="font-medium">{automatedPOs?.length || 0}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <span>Success Rate</span>
                    <span className="font-medium text-green-600">
                      {automatedPOs?.length > 0 ? 
                        (((automatedPOs.filter(po => po.status === 'accepted').length) / automatedPOs.length) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <span>Average Processing Time</span>
                    <span className="font-medium">2.3 minutes</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <span>Total Value Processed</span>
                    <span className="font-medium">
                      {formatCurrency(
                        automatedPOs?.reduce((sum, po) => sum + parseFloat(po.amount), 0) || 0
                      )}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle>Time Savings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-blue-50 rounded">
                    <span>Manual PO Creation</span>
                    <span className="font-medium">30 min/PO</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-green-50 rounded">
                    <span>Automated PO Creation</span>
                    <span className="font-medium">2 min/PO</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-purple-50 rounded">
                    <span>Time Saved per PO</span>
                    <span className="font-medium text-green-600">28 minutes</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-yellow-50 rounded">
                    <span>Total Time Saved</span>
                    <span className="font-medium text-green-600">
                      {((automatedPOs?.length || 0) * 28 / 60).toFixed(1)} hours
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
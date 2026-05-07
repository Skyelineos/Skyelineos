import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, ComposedChart, Area, AreaChart } from 'recharts';
import { formatCurrency } from '@/lib/utils';
import { format, addDays, addMonths, startOfMonth, endOfMonth } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  DollarSign,
  Plus,
  Edit,
  Trash2,
  AlertCircle,
  CheckCircle,
  Clock,
  Target
} from 'lucide-react';

const cashFlowSchema = z.object({
  projectId: z.number(),
  forecastDate: z.string(),
  forecastType: z.enum(['payment_in', 'payment_out', 'milestone']),
  description: z.string().min(1, 'Description is required'),
  amount: z.number().min(0.01, 'Amount must be greater than 0'),
  probability: z.number().min(0).max(1).default(1.0),
  notes: z.string().optional(),
  createdBy: z.number(),
});

type CashFlowFormData = z.infer<typeof cashFlowSchema>;

interface CashFlowForecastingProps {
  projectId: number;
}

export default function CashFlowForecasting({ projectId }: CashFlowForecastingProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showAddForecast, setShowAddForecast] = useState(false);
  const [editingForecast, setEditingForecast] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'monthly' | 'weekly' | 'daily'>('monthly');

  const form = useForm<CashFlowFormData>({
    resolver: zodResolver(cashFlowSchema),
    defaultValues: {
      projectId,
      forecastDate: format(new Date(), 'yyyy-MM-dd'),
      forecastType: 'payment_out',
      description: '',
      amount: 0,
      probability: 1.0,
      notes: '',
      createdBy: 1, // Mock user ID
    },
  });

  // Fetch cash flow forecasts
  const { data: forecasts, isLoading: forecastsLoading } = useQuery({
    queryKey: [`/api/financial/cash-flow-forecasts/${projectId}`],
    refetchInterval: 30000,
  });

  // Fetch cash flow analysis
  const { data: analysis, isLoading: analysisLoading } = useQuery({
    queryKey: [`/api/financial/cash-flow-analysis/${projectId}`, viewMode],
    refetchInterval: 60000,
  });

  // Create cash flow forecast mutation
  const createForecastMutation = useMutation({
    mutationFn: async (data: CashFlowFormData) => {
      return await apiRequest('POST', '/api/financial/cash-flow-forecasts', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/financial/cash-flow-forecasts/${projectId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/financial/cash-flow-analysis/${projectId}`] });
      setShowAddForecast(false);
      form.reset();
      toast({
        title: "Success",
        description: "Cash flow forecast created successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create cash flow forecast",
        variant: "destructive",
      });
    },
  });

  // Update cash flow forecast mutation
  const updateForecastMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<CashFlowFormData> }) => {
      const response = await apiRequest(`/api/financial/cash-flow-forecasts/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/financial/cash-flow-forecasts/${projectId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/financial/cash-flow-analysis/${projectId}`] });
      setEditingForecast(null);
      toast({
        title: "Success",
        description: "Cash flow forecast updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update cash flow forecast",
        variant: "destructive",
      });
    },
  });

  // Delete cash flow forecast mutation
  const deleteForecastMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(`/api/financial/cash-flow-forecasts/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/financial/cash-flow-forecasts/${projectId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/financial/cash-flow-analysis/${projectId}`] });
      toast({
        title: "Success",
        description: "Cash flow forecast deleted successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete cash flow forecast",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CashFlowFormData) => {
    if (editingForecast) {
      updateForecastMutation.mutate({ id: editingForecast.id, data });
    } else {
      createForecastMutation.mutate(data);
    }
  };

  const handleEdit = (forecast: any) => {
    setEditingForecast(forecast);
    form.reset({
      ...forecast,
      forecastDate: format(new Date(forecast.forecastDate), 'yyyy-MM-dd'),
      amount: parseFloat(forecast.amount),
      probability: parseFloat(forecast.probability),
    });
    setShowAddForecast(true);
  };

  const handleDelete = (id: number) => {
    if (confirm('Are you sure you want to delete this forecast?')) {
      deleteForecastMutation.mutate(id);
    }
  };

  const getForecastTypeIcon = (type: string) => {
    switch (type) {
      case 'payment_in':
        return <TrendingUp className="w-4 h-4 text-green-600" />;
      case 'payment_out':
        return <TrendingDown className="w-4 h-4 text-red-600" />;
      case 'milestone':
        return <Target className="w-4 h-4 text-theme-primary" />;
      default:
        return <DollarSign className="w-4 h-4 text-gray-600" />;
    }
  };

  const getForecastTypeColor = (type: string) => {
    switch (type) {
      case 'payment_in':
        return 'bg-green-100 text-green-800';
      case 'payment_out':
        return 'bg-red-100 text-red-800';
      case 'milestone':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Calculate summary statistics
  const calculateSummaryStats = (forecasts: any[]) => {
    if (!forecasts || forecasts.length === 0) return null;

    const totalInflows = forecasts
      .filter(f => f.forecastType === 'payment_in')
      .reduce((sum, f) => sum + (parseFloat(f.amount) * parseFloat(f.probability)), 0);

    const totalOutflows = forecasts
      .filter(f => f.forecastType === 'payment_out')
      .reduce((sum, f) => sum + (parseFloat(f.amount) * parseFloat(f.probability)), 0);

    const netCashFlow = totalInflows - totalOutflows;

    const upcomingPayments = forecasts
      .filter(f => f.forecastType === 'payment_out' && new Date(f.forecastDate) <= addDays(new Date(), 30))
      .reduce((sum, f) => sum + parseFloat(f.amount), 0);

    const upcomingReceipts = forecasts
      .filter(f => f.forecastType === 'payment_in' && new Date(f.forecastDate) <= addDays(new Date(), 30))
      .reduce((sum, f) => sum + parseFloat(f.amount), 0);

    return {
      totalInflows,
      totalOutflows,
      netCashFlow,
      upcomingPayments,
      upcomingReceipts,
      totalForecasts: forecasts.length
    };
  };

  const stats = calculateSummaryStats(forecasts);

  if (forecastsLoading || analysisLoading) {
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
          <h2 className="text-2xl font-bold">Cash Flow Forecasting</h2>
          <p className="text-gray-600">Predict payment schedules and cash requirements</p>
        </div>
        <div className="flex gap-2">
          <Select value={viewMode} onValueChange={(value: 'monthly' | 'weekly' | 'daily') => setViewMode(value)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={showAddForecast} onOpenChange={setShowAddForecast}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Forecast
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingForecast ? 'Edit Cash Flow Forecast' : 'Add Cash Flow Forecast'}
                </DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="forecastType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select forecast type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="payment_in">Payment In</SelectItem>
                            <SelectItem value="payment_out">Payment Out</SelectItem>
                            <SelectItem value="milestone">Milestone</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter description" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            step="0.01" 
                            placeholder="0.00" 
                            {...field} 
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="forecastDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Forecast Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="probability"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Probability (0-1)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            step="0.1" 
                            min="0" 
                            max="1" 
                            placeholder="1.0" 
                            {...field} 
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 1.0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Optional notes" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => {
                      setShowAddForecast(false);
                      setEditingForecast(null);
                      form.reset();
                    }}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createForecastMutation.isPending || updateForecastMutation.isPending}>
                      {editingForecast ? 'Update' : 'Create'} Forecast
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Statistics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gray-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-600" />
                Total Inflows
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(stats.totalInflows)}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gray-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-red-600" />
                Total Outflows
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency(stats.totalOutflows)}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gray-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Net Cash Flow
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${stats.netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(stats.netCashFlow)}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gray-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                30-Day Outlook
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <div className="text-sm text-green-600">
                  In: {formatCurrency(stats.upcomingReceipts)}
                </div>
                <div className="text-sm text-red-600">
                  Out: {formatCurrency(stats.upcomingPayments)}
                </div>
                <div className={`text-sm font-medium ${(stats.upcomingReceipts - stats.upcomingPayments) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  Net: {formatCurrency(stats.upcomingReceipts - stats.upcomingPayments)}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts and Analysis */}
      <Tabs defaultValue="forecast" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="forecast">Forecast Chart</TabsTrigger>
          <TabsTrigger value="schedule">Payment Schedule</TabsTrigger>
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="forecast" className="space-y-4">
          <Card className="bg-gray-50">
            <CardHeader>
              <CardTitle>Cash Flow Forecast</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <ComposedChart data={analysis?.chartData || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`} />
                  <Tooltip 
                    formatter={(value, name) => [formatCurrency(value), name]}
                    labelFormatter={(label) => `Date: ${label}`}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="cumulativeInflows" 
                    stackId="1" 
                    stroke="#10b981" 
                    fill="#10b981" 
                    fillOpacity={0.3}
                    name="Cumulative Inflows"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="cumulativeOutflows" 
                    stackId="2" 
                    stroke="#ef4444" 
                    fill="#ef4444" 
                    fillOpacity={0.3}
                    name="Cumulative Outflows"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="netCashFlow" 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    name="Net Cash Flow"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule" className="space-y-4">
          <Card className="bg-gray-50">
            <CardHeader>
              <CardTitle>Payment Schedule</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Date</th>
                      <th className="text-left p-2">Type</th>
                      <th className="text-left p-2">Description</th>
                      <th className="text-right p-2">Amount</th>
                      <th className="text-right p-2">Probability</th>
                      <th className="text-right p-2">Expected</th>
                      <th className="text-center p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecasts
                      ?.sort((a, b) => new Date(a.forecastDate).getTime() - new Date(b.forecastDate).getTime())
                      .map((forecast, index) => (
                        <tr key={index} className="border-b hover:bg-gray-50">
                          <td className="p-2">{format(new Date(forecast.forecastDate), 'MMM d, yyyy')}</td>
                          <td className="p-2">
                            <Badge className={getForecastTypeColor(forecast.forecastType)}>
                              <div className="flex items-center gap-1">
                                {getForecastTypeIcon(forecast.forecastType)}
                                {forecast.forecastType.replace('_', ' ')}
                              </div>
                            </Badge>
                          </td>
                          <td className="p-2">{forecast.description}</td>
                          <td className="p-2 text-right font-medium">
                            {formatCurrency(forecast.amount)}
                          </td>
                          <td className="p-2 text-right">
                            {(parseFloat(forecast.probability) * 100).toFixed(0)}%
                          </td>
                          <td className="p-2 text-right font-medium">
                            {formatCurrency(parseFloat(forecast.amount) * parseFloat(forecast.probability))}
                          </td>
                          <td className="p-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(forecast)}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(forecast.id)}
                              >
                                <Trash2 className="w-4 h-4" />
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

        <TabsContent value="analysis" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle>Cash Flow Health</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <span>Current Cash Position</span>
                    </div>
                    <span className="font-medium text-green-600">
                      {formatCurrency(stats?.netCashFlow || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-theme-primary" />
                      <span>30-Day Projection</span>
                    </div>
                    <span className={`font-medium ${(stats?.upcomingReceipts - stats?.upcomingPayments) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency((stats?.upcomingReceipts || 0) - (stats?.upcomingPayments || 0))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <div className="flex items-center gap-2">
                      <Target className="w-5 h-5 text-purple-600" />
                      <span>Total Forecasts</span>
                    </div>
                    <span className="font-medium">
                      {stats?.totalForecasts || 0}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle>Risk Assessment</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {analysis?.riskFactors?.map((risk, index) => (
                    <div key={index} className={`p-3 rounded border-l-4 ${
                      risk.severity === 'high' ? 'border-red-500 bg-red-50' :
                      risk.severity === 'medium' ? 'border-yellow-500 bg-yellow-50' :
                      'border-green-500 bg-green-50'
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        <AlertCircle className={`w-4 h-4 ${
                          risk.severity === 'high' ? 'text-red-600' :
                          risk.severity === 'medium' ? 'text-yellow-600' :
                          'text-green-600'
                        }`} />
                        <span className="font-medium">{risk.factor}</span>
                      </div>
                      <p className="text-sm text-gray-600">{risk.description}</p>
                    </div>
                  )) || (
                    <div className="p-3 rounded border-l-4 border-green-500 bg-green-50">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span className="font-medium">Low Risk</span>
                      </div>
                      <p className="text-sm text-gray-600">
                        Cash flow appears healthy with no major risk factors identified.
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
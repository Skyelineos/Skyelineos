import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { formatCurrency } from '@/lib/utils';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle, 
  DollarSign,
  Calculator,
  Target,
  AlertCircle
} from 'lucide-react';

interface CostVarianceAnalysisProps {
  projectId: number;
}

export default function CostVarianceAnalysis({ projectId }: CostVarianceAnalysisProps) {
  const queryClient = useQueryClient();
  const [selectedTrade, setSelectedTrade] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<string>('30days');

  // Fetch budget variances
  const { data: variances, isLoading: variancesLoading } = useQuery({
    queryKey: [`/api/financial/budget-variances/${projectId}`],
    refetchInterval: 30000, // Real-time updates every 30 seconds
  });

  // Fetch actual costs
  const { data: actualCosts, isLoading: costsLoading } = useQuery({
    queryKey: [`/api/financial/actual-costs/${projectId}`],
    refetchInterval: 30000,
  });

  // Fetch cost trends
  const { data: costTrends, isLoading: trendsLoading } = useQuery({
    queryKey: [`/api/financial/cost-trends/${projectId}`, timeRange],
    refetchInterval: 60000, // Update every minute
  });

  // Calculate variance statistics
  const calculateVarianceStats = (variances: any[]) => {
    if (!variances || variances.length === 0) return null;

    const totalBudgeted = variances.reduce((sum, v) => sum + parseFloat(v.budgetedAmount), 0);
    const totalActual = variances.reduce((sum, v) => sum + parseFloat(v.actualAmount), 0);
    const totalVariance = totalActual - totalBudgeted;
    const variancePercentage = totalBudgeted > 0 ? (totalVariance / totalBudgeted) * 100 : 0;

    const overBudget = variances.filter(v => parseFloat(v.varianceAmount) > 0).length;
    const underBudget = variances.filter(v => parseFloat(v.varianceAmount) < 0).length;
    const onBudget = variances.filter(v => Math.abs(parseFloat(v.varianceAmount)) <= 100).length;

    return {
      totalBudgeted,
      totalActual,
      totalVariance,
      variancePercentage,
      overBudget,
      underBudget,
      onBudget,
      totalTrades: variances.length
    };
  };

  const filteredVariances = variances?.filter(v => 
    selectedTrade === 'all' || v.trade === selectedTrade
  ) || [];

  const stats = calculateVarianceStats(filteredVariances);

  // Get unique trades for filter
  const trades = Array.from(new Set(variances?.map(v => v.trade).filter(Boolean))) || [];

  const getVarianceColor = (variance: number, percentage: number) => {
    if (Math.abs(percentage) <= 5) return 'text-green-600';
    if (Math.abs(percentage) <= 15) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getVarianceIcon = (variance: number, percentage: number) => {
    if (Math.abs(percentage) <= 5) return <CheckCircle className="w-4 h-4 text-green-600" />;
    if (Math.abs(percentage) <= 15) return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
    return <AlertCircle className="w-4 h-4 text-red-600" />;
  };

  const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];

  if (variancesLoading || costsLoading || trendsLoading) {
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
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Cost Variance Analysis</h2>
          <p className="text-gray-600">Real-time budget vs actual cost tracking</p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedTrade} onValueChange={setSelectedTrade}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter by trade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Trades</SelectItem>
              {trades.map(trade => (
                <SelectItem key={trade} value={trade}>{trade}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7days">7 Days</SelectItem>
              <SelectItem value="30days">30 Days</SelectItem>
              <SelectItem value="90days">90 Days</SelectItem>
              <SelectItem value="ytd">Year to Date</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Statistics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gray-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Budgeted</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-theme-primary">
                {formatCurrency(stats.totalBudgeted)}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gray-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Actual</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">
                {formatCurrency(stats.totalActual)}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gray-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Variance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold flex items-center gap-2 ${getVarianceColor(stats.totalVariance, stats.variancePercentage)}`}>
                {stats.totalVariance > 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                {formatCurrency(Math.abs(stats.totalVariance))}
              </div>
              <div className="text-sm text-gray-500">
                {stats.variancePercentage > 0 ? '+' : ''}{stats.variancePercentage.toFixed(1)}%
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gray-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Variance Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-green-600">On Budget</span>
                  <span className="font-medium">{stats.onBudget}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-red-600">Over Budget</span>
                  <span className="font-medium">{stats.overBudget}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-theme-primary">Under Budget</span>
                  <span className="font-medium">{stats.underBudget}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts and Analysis */}
      <Tabs defaultValue="variance" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="variance">Variance Analysis</TabsTrigger>
          <TabsTrigger value="trends">Cost Trends</TabsTrigger>
          <TabsTrigger value="breakdown">Trade Breakdown</TabsTrigger>
        </TabsList>

        <TabsContent value="variance" className="space-y-4">
          <Card className="bg-gray-50">
            <CardHeader>
              <CardTitle>Budget vs Actual by Trade</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={filteredVariances}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="trade" />
                  <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`} />
                  <Tooltip 
                    formatter={(value, name) => [formatCurrency(value), name]}
                    labelFormatter={(label) => `Trade: ${label}`}
                  />
                  <Bar dataKey="budgetedAmount" fill="#3b82f6" name="Budgeted" />
                  <Bar dataKey="actualAmount" fill="#ef4444" name="Actual" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Detailed Variance Table */}
          <Card className="bg-gray-50">
            <CardHeader>
              <CardTitle>Detailed Variance Report</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Trade</th>
                      <th className="text-right p-2">Budgeted</th>
                      <th className="text-right p-2">Actual</th>
                      <th className="text-right p-2">Variance</th>
                      <th className="text-right p-2">%</th>
                      <th className="text-center p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVariances.map((variance, index) => (
                      <tr key={index} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-medium">{variance.trade}</td>
                        <td className="p-2 text-right">{formatCurrency(variance.budgetedAmount)}</td>
                        <td className="p-2 text-right">{formatCurrency(variance.actualAmount)}</td>
                        <td className={`p-2 text-right font-medium ${getVarianceColor(variance.varianceAmount, variance.variancePercentage)}`}>
                          {variance.varianceAmount > 0 ? '+' : ''}{formatCurrency(variance.varianceAmount)}
                        </td>
                        <td className={`p-2 text-right ${getVarianceColor(variance.varianceAmount, variance.variancePercentage)}`}>
                          {variance.variancePercentage > 0 ? '+' : ''}{variance.variancePercentage.toFixed(1)}%
                        </td>
                        <td className="p-2 text-center">
                          {getVarianceIcon(variance.varianceAmount, variance.variancePercentage)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          <Card className="bg-gray-50">
            <CardHeader>
              <CardTitle>Cost Trends Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={costTrends}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`} />
                  <Tooltip 
                    formatter={(value, name) => [formatCurrency(value), name]}
                    labelFormatter={(label) => `Date: ${label}`}
                  />
                  <Line type="monotone" dataKey="budgetedCumulative" stroke="#3b82f6" name="Budgeted (Cumulative)" />
                  <Line type="monotone" dataKey="actualCumulative" stroke="#ef4444" name="Actual (Cumulative)" />
                  <Line type="monotone" dataKey="forecastedCumulative" stroke="#10b981" strokeDasharray="5 5" name="Forecasted" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="breakdown" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle>Variance Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Over Budget', value: stats?.overBudget || 0, color: '#ef4444' },
                        { name: 'On Budget', value: stats?.onBudget || 0, color: '#10b981' },
                        { name: 'Under Budget', value: stats?.underBudget || 0, color: '#3b82f6' }
                      ]}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {[
                        { name: 'Over Budget', value: stats?.overBudget || 0, color: '#ef4444' },
                        { name: 'On Budget', value: stats?.onBudget || 0, color: '#10b981' },
                        { name: 'Under Budget', value: stats?.underBudget || 0, color: '#3b82f6' }
                      ].map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle>Top Variance Contributors</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {filteredVariances
                    .sort((a, b) => Math.abs(b.variancePercentage) - Math.abs(a.variancePercentage))
                    .slice(0, 5)
                    .map((variance, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                        <div className="flex items-center gap-2">
                          {getVarianceIcon(variance.varianceAmount, variance.variancePercentage)}
                          <span className="font-medium">{variance.trade}</span>
                        </div>
                        <div className="text-right">
                          <div className={`font-medium ${getVarianceColor(variance.varianceAmount, variance.variancePercentage)}`}>
                            {variance.variancePercentage > 0 ? '+' : ''}{variance.variancePercentage.toFixed(1)}%
                          </div>
                          <div className="text-sm text-gray-500">
                            {formatCurrency(Math.abs(variance.varianceAmount))}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
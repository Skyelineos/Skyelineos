import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { formatCurrency } from '@/lib/utils';
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  DollarSign,
  Percent,
  AlertCircle,
  CheckCircle,
  TrendingUp as GrowthIcon
} from 'lucide-react';

interface ProfitMarginAnalysisProps {
  projectId: number;
}

export default function ProfitMarginAnalysis({ projectId }: ProfitMarginAnalysisProps) {
  const [selectedTrade, setSelectedTrade] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<string>('project');
  const [viewType, setViewType] = useState<'summary' | 'detailed'>('summary');

  // Fetch profit margin analysis
  const { data: marginAnalysis, isLoading: marginLoading } = useQuery({
    queryKey: [`/api/financial/profit-margin-analysis/${projectId}`, selectedTrade, timeRange],
    refetchInterval: 30000,
  });

  // Fetch profit trends
  const { data: profitTrends, isLoading: trendsLoading } = useQuery({
    queryKey: [`/api/financial/profit-trends/${projectId}`, timeRange],
    refetchInterval: 60000,
  });

  // Fetch benchmark data
  const { data: benchmarks, isLoading: benchmarksLoading } = useQuery({
    queryKey: [`/api/financial/profit-benchmarks/${projectId}`],
    refetchInterval: 300000, // Update every 5 minutes
  });

  const filteredAnalysis = marginAnalysis?.filter(analysis => 
    selectedTrade === 'all' || analysis.trade === selectedTrade
  ) || [];

  // Get unique trades for filter
  const trades = Array.from(new Set(marginAnalysis?.map(analysis => analysis.trade).filter(Boolean))) || [];

  // Calculate overall project metrics
  const calculateOverallMetrics = (analyses: any[]) => {
    if (!analyses || analyses.length === 0) return null;

    const totalRevenue = analyses.reduce((sum, a) => sum + parseFloat(a.revenue), 0);
    const totalDirectCosts = analyses.reduce((sum, a) => sum + parseFloat(a.directCosts), 0);
    const totalIndirectCosts = analyses.reduce((sum, a) => sum + parseFloat(a.indirectCosts), 0);
    const totalGrossProfit = analyses.reduce((sum, a) => sum + parseFloat(a.grossProfit), 0);
    const totalNetProfit = analyses.reduce((sum, a) => sum + parseFloat(a.netProfit), 0);

    const grossMarginPercentage = totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0;
    const netMarginPercentage = totalRevenue > 0 ? (totalNetProfit / totalRevenue) * 100 : 0;

    const bestPerformingTrade = analyses.reduce((best, current) => 
      parseFloat(current.netMarginPercentage) > parseFloat(best.netMarginPercentage) ? current : best
    );

    const worstPerformingTrade = analyses.reduce((worst, current) => 
      parseFloat(current.netMarginPercentage) < parseFloat(worst.netMarginPercentage) ? current : worst
    );

    return {
      totalRevenue,
      totalDirectCosts,
      totalIndirectCosts,
      totalGrossProfit,
      totalNetProfit,
      grossMarginPercentage,
      netMarginPercentage,
      bestPerformingTrade,
      worstPerformingTrade,
      totalTrades: analyses.length
    };
  };

  const overallMetrics = calculateOverallMetrics(filteredAnalysis);

  const getMarginStatus = (percentage: number) => {
    if (percentage >= 20) return { color: 'text-green-600', status: 'Excellent', icon: CheckCircle };
    if (percentage >= 15) return { color: 'text-theme-primary', status: 'Good', icon: Target };
    if (percentage >= 10) return { color: 'text-yellow-600', status: 'Fair', icon: AlertCircle };
    return { color: 'text-red-600', status: 'Poor', icon: AlertCircle };
  };

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

  if (marginLoading || trendsLoading || benchmarksLoading) {
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
          <h2 className="text-2xl font-bold">Profit Margin Analysis</h2>
          <p className="text-gray-600">Track profitability by project and trade</p>
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
              <SelectItem value="project">Project</SelectItem>
              <SelectItem value="30days">30 Days</SelectItem>
              <SelectItem value="90days">90 Days</SelectItem>
              <SelectItem value="ytd">Year to Date</SelectItem>
            </SelectContent>
          </Select>
          <Select value={viewType} onValueChange={(value: 'summary' | 'detailed') => setViewType(value)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="summary">Summary</SelectItem>
              <SelectItem value="detailed">Detailed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Overall Metrics */}
      {overallMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gray-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Total Revenue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(overallMetrics.totalRevenue)}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gray-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Gross Profit
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-theme-primary">
                {formatCurrency(overallMetrics.totalGrossProfit)}
              </div>
              <div className="text-sm text-gray-500">
                {overallMetrics.grossMarginPercentage.toFixed(1)}% margin
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gray-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <Target className="w-4 h-4" />
                Net Profit
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${overallMetrics.totalNetProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(overallMetrics.totalNetProfit)}
              </div>
              <div className="text-sm text-gray-500">
                {overallMetrics.netMarginPercentage.toFixed(1)}% margin
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gray-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <Percent className="w-4 h-4" />
                Margin Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {(() => {
                  const status = getMarginStatus(overallMetrics.netMarginPercentage);
                  const Icon = status.icon;
                  return (
                    <>
                      <Icon className={`w-5 h-5 ${status.color}`} />
                      <span className={`font-medium ${status.color}`}>{status.status}</span>
                    </>
                  );
                })()}
              </div>
              <div className="text-sm text-gray-500">
                {overallMetrics.totalTrades} trades analyzed
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Analysis Tabs */}
      <Tabs defaultValue="breakdown" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="benchmarks">Benchmarks</TabsTrigger>
          <TabsTrigger value="optimization">Optimization</TabsTrigger>
        </TabsList>

        <TabsContent value="breakdown" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle>Profit Margin by Trade</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={filteredAnalysis}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="trade" />
                    <YAxis tickFormatter={(value) => `${value}%`} />
                    <Tooltip 
                      formatter={(value, name) => [`${value}%`, name]}
                      labelFormatter={(label) => `Trade: ${label}`}
                    />
                    <Bar dataKey="grossMarginPercentage" fill="#10b981" name="Gross Margin %" />
                    <Bar dataKey="netMarginPercentage" fill="#3b82f6" name="Net Margin %" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle>Revenue Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={filteredAnalysis}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ trade, revenue }) => `${trade}: ${formatCurrency(revenue)}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="revenue"
                    >
                      {filteredAnalysis.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Table */}
          <Card className="bg-gray-50">
            <CardHeader>
              <CardTitle>Detailed Profit Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Trade</th>
                      <th className="text-right p-2">Revenue</th>
                      <th className="text-right p-2">Direct Costs</th>
                      <th className="text-right p-2">Indirect Costs</th>
                      <th className="text-right p-2">Gross Profit</th>
                      <th className="text-right p-2">Net Profit</th>
                      <th className="text-right p-2">Net Margin %</th>
                      <th className="text-center p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAnalysis.map((analysis, index) => {
                      const status = getMarginStatus(parseFloat(analysis.netMarginPercentage));
                      return (
                        <tr key={index} className="border-b hover:bg-gray-50">
                          <td className="p-2 font-medium">{analysis.trade}</td>
                          <td className="p-2 text-right">{formatCurrency(analysis.revenue)}</td>
                          <td className="p-2 text-right">{formatCurrency(analysis.directCosts)}</td>
                          <td className="p-2 text-right">{formatCurrency(analysis.indirectCosts)}</td>
                          <td className="p-2 text-right font-medium text-green-600">
                            {formatCurrency(analysis.grossProfit)}
                          </td>
                          <td className={`p-2 text-right font-medium ${parseFloat(analysis.netProfit) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(analysis.netProfit)}
                          </td>
                          <td className={`p-2 text-right font-medium ${status.color}`}>
                            {parseFloat(analysis.netMarginPercentage).toFixed(1)}%
                          </td>
                          <td className="p-2 text-center">
                            <Badge className={`${status.color.replace('text-', 'bg-').replace('600', '100')} ${status.color}`}>
                              {status.status}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          <Card className="bg-gray-50">
            <CardHeader>
              <CardTitle>Profit Trends Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={profitTrends}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis yAxisId="left" tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `${value}%`} />
                  <Tooltip 
                    formatter={(value, name) => {
                      if (name.includes('%')) return [`${value}%`, name];
                      return [formatCurrency(value), name];
                    }}
                    labelFormatter={(label) => `Period: ${label}`}
                  />
                  <Line yAxisId="left" type="monotone" dataKey="grossProfit" stroke="#10b981" name="Gross Profit" />
                  <Line yAxisId="left" type="monotone" dataKey="netProfit" stroke="#3b82f6" name="Net Profit" />
                  <Line yAxisId="right" type="monotone" dataKey="netMarginPercentage" stroke="#f59e0b" name="Net Margin %" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="benchmarks" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle>Industry Benchmarks</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {benchmarks?.industryBenchmarks?.map((benchmark, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                      <div>
                        <div className="font-medium">{benchmark.category}</div>
                        <div className="text-sm text-gray-500">{benchmark.description}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{benchmark.averageMargin}%</div>
                        <div className="text-sm text-gray-500">Industry Avg</div>
                      </div>
                    </div>
                  )) || (
                    <div className="text-center py-8 text-gray-500">
                      Industry benchmark data not available
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle>Performance vs Benchmarks</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {overallMetrics && (
                    <>
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                        <div>
                          <div className="font-medium">Your Net Margin</div>
                          <div className="text-sm text-gray-500">Current project performance</div>
                        </div>
                        <div className="text-right">
                          <div className={`font-medium ${overallMetrics.netMarginPercentage >= 15 ? 'text-green-600' : 'text-yellow-600'}`}>
                            {overallMetrics.netMarginPercentage.toFixed(1)}%
                          </div>
                          <div className="text-sm text-gray-500">
                            {overallMetrics.netMarginPercentage >= 15 ? 'Above Average' : 'Below Average'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                        <div>
                          <div className="font-medium">Best Performing Trade</div>
                          <div className="text-sm text-gray-500">{overallMetrics.bestPerformingTrade?.trade}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium text-green-600">
                            {parseFloat(overallMetrics.bestPerformingTrade?.netMarginPercentage).toFixed(1)}%
                          </div>
                          <div className="text-sm text-gray-500">Top performer</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                        <div>
                          <div className="font-medium">Improvement Opportunity</div>
                          <div className="text-sm text-gray-500">{overallMetrics.worstPerformingTrade?.trade}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium text-red-600">
                            {parseFloat(overallMetrics.worstPerformingTrade?.netMarginPercentage).toFixed(1)}%
                          </div>
                          <div className="text-sm text-gray-500">Needs attention</div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="optimization" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle>Optimization Recommendations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 border-l-4 border-theme-primary bg-blue-50">
                    <div className="flex items-center gap-2 mb-2">
                      <GrowthIcon className="w-5 h-5 text-theme-primary" />
                      <span className="font-medium">Cost Optimization</span>
                    </div>
                    <p className="text-sm text-gray-600">
                      Focus on reducing indirect costs which represent {overallMetrics ? ((overallMetrics.totalIndirectCosts / overallMetrics.totalRevenue) * 100).toFixed(1) : '0'}% of total revenue.
                    </p>
                  </div>
                  <div className="p-4 border-l-4 border-green-500 bg-green-50">
                    <div className="flex items-center gap-2 mb-2">
                      <Target className="w-5 h-5 text-green-600" />
                      <span className="font-medium">Revenue Enhancement</span>
                    </div>
                    <p className="text-sm text-gray-600">
                      Consider value-added services for your best-performing trade: {overallMetrics?.bestPerformingTrade?.trade}.
                    </p>
                  </div>
                  <div className="p-4 border-l-4 border-yellow-500 bg-yellow-50">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="w-5 h-5 text-yellow-600" />
                      <span className="font-medium">Risk Mitigation</span>
                    </div>
                    <p className="text-sm text-gray-600">
                      Review pricing strategy for {overallMetrics?.worstPerformingTrade?.trade} to improve margins.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle>Action Items</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded">
                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                    <div className="flex-1">
                      <div className="font-medium">Review Low-Margin Trades</div>
                      <div className="text-sm text-gray-500">Analyze trades with margins below 10%</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                    <div className="flex-1">
                      <div className="font-medium">Optimize Indirect Costs</div>
                      <div className="text-sm text-gray-500">Identify opportunities to reduce overhead</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <div className="flex-1">
                      <div className="font-medium">Benchmark Analysis</div>
                      <div className="text-sm text-gray-500">Compare performance to industry standards</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <div className="flex-1">
                      <div className="font-medium">Pricing Strategy Review</div>
                      <div className="text-sm text-gray-500">Evaluate pricing for underperforming trades</div>
                    </div>
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
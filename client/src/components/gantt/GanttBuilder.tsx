import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import Plot from 'react-plotly.js';
import type { PlotData, Layout, Config } from 'plotly.js';
import { format, parseISO, isToday, isWeekend, addDays, differenceInDays } from 'date-fns';

// UI Components
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';

// Icons
import { Plus, Filter, Download, Upload, Settings, Calendar, Users, Clock, Target, MoreVertical, Edit2, Trash2, Move3D, FileText, Image, FileDown } from 'lucide-react';

// Types and utilities
import type { Trade, Milestone, TradeStatus, Phase, GanttViewConfig, GanttExportOptions } from '@/types/gantt';
import type { WbsTask, Link, LinkType } from '@/types/wbs';
import { useScheduleData } from './useScheduleData';
import { exportToPNG, exportToPDF, exportToJSON, importFromJSON } from './export';
import { generateMilestones } from './milestones';
import { 
  flattenTasks, 
  calculateSummaryDates, 
  validateDependencies, 
  resolvePredecessorDate, 
  wbsTaskToTrade,
  tradeToWbsTask 
} from './wbsUtils';
import { computeWbs, flattenVisible, getVisibleDateRange, type FlatRow } from './wbsModel';

interface GanttBuilderProps {
  projectId?: string;
  projectName?: string;
  readonly?: boolean;
  useFirestore?: boolean;
  className?: string;
  // WBS Integration
  wbsTasks?: WbsTask[];
  onWbsTaskUpdate?: (task: WbsTask) => void;
  showHierarchy?: boolean;
}

// Status color mapping - matching traditional Gantt colors
const STATUS_COLORS = {
  on_track: '#3b82f6',        // Blue (Active)
  pending_approval: '#f59e0b', // Yellow (Planned)
  delayed: '#ef4444',         // Red (Delayed)
  completed: '#10b981',       // Green (Completed)
  not_started: '#6b7280'      // Gray (Not Started)
} as const;

// Traditional construction trade colors
const TRADE_COLORS = {
  'Excavation': '#ea580c',
  'Foundation': '#475569', 
  'Framing': '#eab308',
  'Roofing': '#dc2626',
  'Plumbing': '#2563eb',
  'Electrical': '#f59e0b',
  'HVAC': '#16a34a',
  'Insulation': '#ec4899',
  'Drywall': '#6366f1',
  'Flooring': '#9333ea',
  'Painting': '#0d9488',
  'Cabinets': '#059669',
  'Countertops': '#64748b',
  'Landscaping': '#84cc16',
  'Final Inspection': '#e11d48'
} as const;

const PHASE_COLORS = {
  rough: 'rgba(59, 130, 246, 0.1)',  // Light blue background
  finish: 'rgba(168, 85, 247, 0.1)'  // Light purple background
} as const;

export function GanttBuilder({ 
  projectId, 
  projectName = 'Project Schedule', 
  readonly = false,
  useFirestore = false,
  className = '',
  wbsTasks,
  onWbsTaskUpdate,
  showHierarchy = false
}: GanttBuilderProps) {
  // Data management
  const { 
    trades, 
    milestones, 
    isLoading, 
    error, 
    createTrade, 
    updateTrade, 
    deleteTrade 
  } = useScheduleData({ projectId, useFirestore });

  // UI State
  const [viewConfig, setViewConfig] = useState<GanttViewConfig>({
    zoomLevel: 'week',
    showWeekends: true,
    showMilestones: true,
    showDependencies: true,
    phaseFilter: undefined,
    statusFilter: undefined,
    // WBS options
    showHierarchy: showHierarchy,
    expandAll: true,
    linkTypeFilter: undefined
  });

  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState<string | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [draggedTrade, setDraggedTrade] = useState<string | null>(null);
  const [collapsedTasks, setCollapsedTasks] = useState<Record<string, boolean>>({});

  const plotlyRef = useRef<any>(null); // PlotlyHTMLElement

  // Enhanced WBS processing with proper hierarchy
  const { flatRows, convertedTrades } = useMemo(() => {
    if (wbsTasks) {
      // Use enhanced WBS model for proper hierarchy handling
      const rows = flattenVisible(wbsTasks, collapsedTasks);
      const trades = rows.map(row => {
        const trade = wbsTaskToTrade(row.task);
        trade.wbsId = row.wbs; // Use computed WBS code
        return trade;
      });
      return { flatRows: rows, convertedTrades: trades };
    }
    return { flatRows: [], convertedTrades: trades };
  }, [wbsTasks, trades, collapsedTasks]);

  // Filter trades based on current filters
  const filteredTrades = useMemo(() => {
    let filtered = [...convertedTrades];

    if (viewConfig.phaseFilter) {
      filtered = filtered.filter(trade => trade.phase === viewConfig.phaseFilter);
    }

    if (viewConfig.statusFilter) {
      filtered = filtered.filter(trade => trade.status === viewConfig.statusFilter);
    }

    // Apply WBS hierarchy filtering if enabled
    if (viewConfig.showHierarchy && !viewConfig.expandAll) {
      // Only show top-level tasks when collapsed
      filtered = filtered.filter(trade => !trade.parentId);
    }

    return filtered.sort((a, b) => {
      // Sort by WBS hierarchy if available, otherwise by date
      if (a.wbsId && b.wbsId) {
        return a.wbsId.localeCompare(b.wbsId);
      }
      return a.startDate.localeCompare(b.startDate);
    });
  }, [convertedTrades, viewConfig.phaseFilter, viewConfig.statusFilter, viewConfig.showHierarchy, viewConfig.expandAll]);

  // Calculate date range for chart
  const dateRange = useMemo(() => {
    if (filteredTrades.length === 0) {
      const today = new Date();
      return {
        minDate: format(today, 'yyyy-MM-dd'),
        maxDate: format(addDays(today, 90), 'yyyy-MM-dd')
      };
    }

    const startDates = filteredTrades.map(t => t.startDate);
    const endDates = filteredTrades.map(t => t.endDate);
    
    const minDate = startDates.reduce((min, date) => date < min ? date : min);
    const maxDate = endDates.reduce((max, date) => date > max ? date : max);

    // Add padding
    const minDateObj = parseISO(minDate);
    const maxDateObj = parseISO(maxDate);
    
    return {
      minDate: format(addDays(minDateObj, -7), 'yyyy-MM-dd'),
      maxDate: format(addDays(maxDateObj, 14), 'yyyy-MM-dd')
    };
  }, [filteredTrades]);

  // Constants for Gantt chart calculations
  const MS_DAY = 24 * 60 * 60 * 1000;

  // Prepare data for Plotly Gantt chart
  const plotData = useMemo<PlotData[]>(() => {
    if (filteredTrades.length === 0) return [];

    const y = filteredTrades.map(t => t.name);
    const base = filteredTrades.map(t => t.startDate); // dates OK on date axis
    const durationsMs = filteredTrades.map(t => {
      const start = parseISO(t.startDate).getTime();
      const end = parseISO(t.endDate).getTime();
      // inclusive bar so add one day
      return (end - start) + MS_DAY;
    });

    const bar: any = {
      type: 'bar',
      orientation: 'h',
      y,
      x: durationsMs,
      base,
      marker: {
        color: filteredTrades.map(t => {
          // Use trade-specific colors if available, otherwise status colors
          return TRADE_COLORS[t.name as keyof typeof TRADE_COLORS] || STATUS_COLORS[t.status];
        }),
        line: {
          color: filteredTrades.map(t => {
            const baseColor = TRADE_COLORS[t.name as keyof typeof TRADE_COLORS] || STATUS_COLORS[t.status];
            return baseColor;
          }),
          width: 1
        }
      },
      customdata: filteredTrades.map(t => [
        t.id, t.phase, t.status, t.startDate, t.endDate, t.dependencies.join(', '),
        t.wbsId || '',
        t._isSummary ? 'Summary' : 'Task',
        t.percent || 0,
        t.parentId || ''
      ]),
      hovertemplate:
        '<b>%{y}</b><br>' +
        'WBS: %{customdata[6]}<br>' +
        'Type: %{customdata[7]}<br>' +
        'Start: %{base|%Y-%m-%d}<br>' +
        'End: %{customdata[4]}<br>' +
        'Progress: %{customdata[8]}%<br>' +
        'Status: %{customdata[2]}<br>' +
        'Phase: %{customdata[1]}<br>' +
        '<extra></extra>',
      name: 'Trades'
    };

    return [bar];
  }, [filteredTrades]);

  // Helper to build weekend rectangles
  const weekendRects = useMemo(() => {
    const rects: any[] = [];
    const start = parseISO(dateRange.minDate);
    const end = parseISO(dateRange.maxDate);
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
      if (isWeekend(d) && viewConfig.showWeekends) {
        const x0 = format(d, 'yyyy-MM-dd');
        const x1 = format(addDays(d, 1), 'yyyy-MM-dd');
        rects.push({
          type: 'rect',
          xref: 'x' as const, 
          yref: 'paper' as const,
          x0, x1, y0: 0, y1: 1,
          fillcolor: '#f3f4f6',
          opacity: 0.6,
          line: { width: 0 }
        });
      }
    }
    return rects;
  }, [dateRange, viewConfig.showWeekends]);

  const milestoneAnnotations = useMemo(() => {
    if (!viewConfig.showMilestones || milestones.length === 0) return [];
    return milestones.map(m => ({
      x: m.date,
      y: 1.03,
      xref: 'x' as const,
      yref: 'paper' as const,
      showarrow: true,
      arrowhead: 2,
      ay: -20,
      text: m.name,
      bgcolor: m.status === 'done' ? '#22c55e' : m.status === 'at_risk' ? '#ef4444' : '#3b82f6',
      bordercolor: '#111827',
      font: { color: 'white', size: 10 },
    }));
  }, [milestones, viewConfig.showMilestones]);

  const dtick =
    viewConfig.zoomLevel === 'day' ? MS_DAY :
    viewConfig.zoomLevel === 'week' ? 7 * MS_DAY : 'M1';

  const layout = useMemo<Partial<Layout>>(() => ({
    title: { 
      text: `${projectName} - Construction Schedule`,
      font: { size: 18, color: '#1f2937', family: 'Inter, system-ui, sans-serif' },
      x: 0.02
    },
    xaxis: {
      type: 'date',
      range: [dateRange.minDate, dateRange.maxDate],
      title: { 
        text: 'Project Timeline',
        font: { size: 14, color: '#374151' }
      },
      showgrid: true,
      gridcolor: '#e5e7eb',
      gridwidth: 1,
      tickformat: viewConfig.zoomLevel === 'day' ? '%b %d' :
                  viewConfig.zoomLevel === 'week' ? '%b %d' : '%b %Y',
      dtick,
      tickfont: { size: 12, color: '#6b7280' },
      linecolor: '#d1d5db',
      linewidth: 1
    },
    yaxis: {
      title: { 
        text: 'Construction Trades',
        font: { size: 14, color: '#374151' }
      },
      autorange: 'reversed',
      showgrid: true,
      gridcolor: '#f3f4f6',
      gridwidth: 1,
      tickfont: { size: 12, color: '#374151' },
      linecolor: '#d1d5db',
      linewidth: 1
    },
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#f9fafb',
    font: { family: 'Inter, system-ui, -apple-system, sans-serif' },
    margin: { l: 180, r: 80, t: 100, b: 60 },
    hovermode: 'closest',
    showlegend: false,
    height: Math.max(500, filteredTrades.length * 45 + 250),
    shapes: [
      // Today line
      {
        type: 'line',
        x0: format(new Date(), 'yyyy-MM-dd'),
        x1: format(new Date(), 'yyyy-MM-dd'),
        y0: 0,
        y1: 1,
        yref: 'paper',
        line: { color: '#dc2626', width: 2, dash: 'dash' }
      },
      ...weekendRects
    ],
    annotations: milestoneAnnotations
  }), [projectName, dateRange, viewConfig.zoomLevel, filteredTrades.length, weekendRects, milestoneAnnotations]);

  // Chart configuration
  const config: Partial<Config> = useMemo(() => ({
    responsive: true,
    displayModeBar: true,
    modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d'],
    displaylogo: false,
    toImageButtonOptions: {
      format: 'png',
      filename: `${projectName.toLowerCase().replace(/\s+/g, '_')}_gantt`,
      height: 600,
      width: 1200,
      scale: 2
    }
  }), [projectName]);

  // Event handlers
  const handleCreateTrade = useCallback(async (tradeData: Omit<Trade, 'id'>) => {
    try {
      await createTrade(tradeData);
      setShowCreateDialog(false);
      toast({ title: "Trade created", description: "New trade added to schedule successfully." });
    } catch (error) {
      toast({ 
        title: "Error", 
        description: "Failed to create trade. Please try again.", 
        variant: "destructive" 
      });
    }
  }, [createTrade]);

  const handleUpdateTrade = useCallback(async (id: string, updates: Partial<Trade>) => {
    try {
      await updateTrade(id, updates);
      setEditingTrade(null);
      toast({ title: "Trade updated", description: "Trade details saved successfully." });
    } catch (error) {
      toast({ 
        title: "Error", 
        description: "Failed to update trade. Please try again.", 
        variant: "destructive" 
      });
    }
  }, [updateTrade]);

  const handleDeleteTrade = useCallback(async (id: string) => {
    try {
      await deleteTrade(id);
      setShowDeleteDialog(null);
      toast({ title: "Trade deleted", description: "Trade removed from schedule." });
    } catch (error) {
      toast({ 
        title: "Error", 
        description: "Failed to delete trade. Please try again.", 
        variant: "destructive" 
      });
    }
  }, [deleteTrade]);

  const handleExport = useCallback(async (format: 'PNG' | 'PDF' | 'JSON') => {
    if (!plotlyRef.current && format !== 'JSON') return;
    try {
      const options: GanttExportOptions = {
        format: format as 'PNG' | 'PDF',
        scale: 2,
        includeTitle: true,
        includeLegend: true,
        projectName
      };
      if (format === 'PNG') {
        await exportToPNG(plotlyRef.current, options);
      } else if (format === 'PDF') {
        await exportToPDF(plotlyRef.current, options);
      } else {
        exportToJSON(trades, projectName);
        toast({ title: "Export successful", description: `Schedule exported as ${format}.` });
        return;
      }
      toast({ title: "Export successful", description: `Schedule exported as ${format}.` });
    } catch {
      toast({ title: "Export failed", description: `Failed to export as ${format}. Please try again.`, variant: "destructive" });
    }
  }, [trades, projectName]);

  const handleImport = useCallback(async (file: File) => {
    try {
      const importedTrades = await importFromJSON(file);
      // Merge imported trades (de-dupe by name or generate new ids)
      for (const trade of importedTrades) {
        const existingTrade = trades.find(t => t.name === trade.name);
        if (!existingTrade) {
          await createTrade({
            name: trade.name,
            phase: trade.phase || 'rough',
            startDate: trade.startDate,
            endDate: trade.endDate,
            status: trade.status || 'on_track',
            dependencies: trade.dependencies || [],
            description: trade.description || ''
          });
        }
      }
      setShowImportDialog(false);
      toast({ title: "Import successful", description: "Trades imported successfully." });
    } catch (error) {
      toast({ 
        title: "Import failed", 
        description: "Failed to import file. Please check the format.", 
        variant: "destructive" 
      });
    }
  }, [trades, createTrade]);

  // Loading state
  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Loading Schedule...</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-96">
            <div className="animate-pulse space-y-4 w-full">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-8 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-red-600">Schedule Error</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-500">Failed to load schedule data. Please try again.</p>
          <Button className="mt-4" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (trades.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="text-center">
          <CardTitle>No Schedule Created</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-gray-500">Create your first trade to get started with project scheduling.</p>
          {!readonly && (
            <Button onClick={() => setShowCreateDialog(true)} className="mx-auto">
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Trade
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-gray-900">{projectName}</h2>
          <Badge variant="outline">
            {filteredTrades.length} trades
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* Filters */}
          <Select value={viewConfig.phaseFilter || 'all'} onValueChange={(value) => 
            setViewConfig(prev => ({ ...prev, phaseFilter: value === 'all' ? undefined : value as Phase }))
          }>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Phase" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Phases</SelectItem>
              <SelectItem value="rough">Rough</SelectItem>
              <SelectItem value="finish">Finish</SelectItem>
            </SelectContent>
          </Select>

          <Select value={viewConfig.statusFilter || 'all'} onValueChange={(value) => 
            setViewConfig(prev => ({ ...prev, statusFilter: value === 'all' ? undefined : value as TradeStatus }))
          }>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="on_track">On Track</SelectItem>
              <SelectItem value="delayed">Delayed</SelectItem>
              <SelectItem value="pending_approval">Pending Approval</SelectItem>
            </SelectContent>
          </Select>

          {/* Export Options */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Export Schedule</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-4">
                <Button className="w-full" onClick={() => handleExport('PNG')}>
                  <Image className="w-4 h-4 mr-2" />
                  Export as PNG
                </Button>
                <Button className="w-full" onClick={() => handleExport('PDF')}>
                  <FileText className="w-4 h-4 mr-2" />
                  Export as PDF
                </Button>
                <Button className="w-full" onClick={() => handleExport('JSON')}>
                  <FileDown className="w-4 h-4 mr-2" />
                  Export as JSON
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          {/* Add Trade */}
          {!readonly && (
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Trade
            </Button>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-sm border" style={{ backgroundColor: STATUS_COLORS.completed, borderColor: '#059669' }}></div>
            <span className="text-sm">Completed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-sm border" style={{ backgroundColor: STATUS_COLORS.on_track, borderColor: '#2563eb' }}></div>
            <span className="text-sm">In Progress</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-sm border" style={{ backgroundColor: STATUS_COLORS.pending_approval, borderColor: '#d97706' }}></div>
            <span className="text-sm">Planned</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-sm border" style={{ backgroundColor: STATUS_COLORS.delayed, borderColor: '#dc2626' }}></div>
            <span className="text-sm">Delayed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-sm border" style={{ backgroundColor: STATUS_COLORS.not_started, borderColor: '#4b5563' }}></div>
            <span className="text-sm">Not Started</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-sm" style={{ background: 'linear-gradient(45deg, #3b82f6, #10b981, #f59e0b, #ef4444)', border: '1px solid #d1d5db' }}></div>
            <span className="text-sm">Trade Colors</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-0.5 h-4 bg-red-600 border-dashed border-r-2"></div>
          <span>Today</span>
        </div>
      </div>

      {/* Professional Gantt Chart */}
      <Card className="border-gray-200 shadow-sm">
        <CardHeader className="bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-3 h-8 bg-gradient-to-b from-blue-500 to-blue-600 rounded-sm"></div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Construction Schedule</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {filteredTrades.length} trades • {Math.ceil(differenceInDays(parseISO(dateRange.maxDate), parseISO(dateRange.minDate)))} days
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {format(new Date(), 'MMM yyyy')}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 bg-white">
          <Plot
            data={plotData}
            layout={layout}
            config={config}
            style={{ width: '100%' }}
            onInitialized={(_: any, graphDiv: any) => { plotlyRef.current = graphDiv; }}
            onUpdate={(_: any, graphDiv: any) => { plotlyRef.current = graphDiv; }}
            onClick={(ev: any) => {
              if (readonly || !ev.points?.length) return;
              const p = ev.points[0];
              const rowIdx = p.pointIndex;               // index into filteredTrades
              const trade = filteredTrades[rowIdx];
              if (trade) setEditingTrade(trade);
            }}
          />
        </CardContent>
      </Card>

      {/* Trade Edit Dialog */}
      {editingTrade && (
        <TradeEditDialog
          trade={editingTrade}
          trades={trades}
          isOpen={!!editingTrade}
          onClose={() => setEditingTrade(null)}
          onSave={(updates) => handleUpdateTrade(editingTrade.id, updates)}
          onDelete={() => setShowDeleteDialog(editingTrade.id)}
          readonly={readonly}
        />
      )}

      {/* Create Trade Dialog */}
      {showCreateDialog && (
        <TradeCreateDialog
          isOpen={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
          onSave={handleCreateTrade}
          trades={trades}
        />
      )}

      {/* Delete Confirmation */}
      {showDeleteDialog && (
        <AlertDialog open={!!showDeleteDialog} onOpenChange={() => setShowDeleteDialog(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Trade</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this trade? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => handleDeleteTrade(showDeleteDialog)}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

// Trade Edit Dialog Component
interface TradeEditDialogProps {
  trade: Trade;
  trades: Trade[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (updates: Partial<Trade>) => void;
  onDelete: () => void;
  readonly?: boolean;
}

function TradeEditDialog({ 
  trade, 
  trades, 
  isOpen, 
  onClose, 
  onSave, 
  onDelete, 
  readonly = false 
}: TradeEditDialogProps) {
  const [formData, setFormData] = useState(trade);

  const handleSave = () => {
    // Validate that endDate >= startDate
    if (formData.endDate < formData.startDate) {
      // Handle validation error - could show toast or set form error
      return;
    }
    onSave(formData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Trade: {trade.name}</DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="name">Trade Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              disabled={readonly}
            />
          </div>
          
          <div>
            <Label htmlFor="phase">Phase</Label>
            <Select 
              value={formData.phase} 
              onValueChange={(value: Phase) => setFormData(prev => ({ ...prev, phase: value }))}
              disabled={readonly}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rough">Rough</SelectItem>
                <SelectItem value="finish">Finish</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="startDate">Start Date</Label>
            <Input
              id="startDate"
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
              disabled={readonly}
            />
          </div>

          <div>
            <Label htmlFor="endDate">End Date</Label>
            <Input
              id="endDate"
              type="date"
              value={formData.endDate}
              onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
              disabled={readonly}
            />
          </div>

          <div className="col-span-2">
            <Label htmlFor="status">Status</Label>
            <Select 
              value={formData.status} 
              onValueChange={(value: TradeStatus) => setFormData(prev => ({ ...prev, status: value }))}
              disabled={readonly}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="on_track">On Track</SelectItem>
                <SelectItem value="delayed">Delayed</SelectItem>
                <SelectItem value="pending_approval">Pending Approval</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              disabled={readonly}
            />
          </div>
        </div>

        <div className="flex justify-between pt-4">
          <Button variant="destructive" onClick={onDelete} disabled={readonly}>
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </Button>
          <div className="space-x-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            {!readonly && (
              <Button onClick={handleSave}>
                Save Changes
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Trade Create Dialog Component
interface TradeCreateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (trade: Omit<Trade, 'id'>) => void;
  trades: Trade[];
}

function TradeCreateDialog({ isOpen, onClose, onSave, trades }: TradeCreateDialogProps) {
  const [formData, setFormData] = useState<Omit<Trade, 'id'>>({
    name: '',
    phase: 'rough',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
    status: 'on_track',
    dependencies: [],
    description: ''
  });

  const handleSave = () => {
    if (!formData.name.trim()) return;
    onSave(formData);
    setFormData({
      name: '',
      phase: 'rough',
      startDate: format(new Date(), 'yyyy-MM-dd'),
      endDate: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
      status: 'on_track',
      dependencies: [],
      description: ''
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New Trade</DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="name">Trade Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Framing, Drywall, Paint"
            />
          </div>
          
          <div>
            <Label htmlFor="phase">Phase</Label>
            <Select 
              value={formData.phase} 
              onValueChange={(value: Phase) => setFormData(prev => ({ ...prev, phase: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rough">Rough</SelectItem>
                <SelectItem value="finish">Finish</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="startDate">Start Date</Label>
            <Input
              id="startDate"
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
            />
          </div>

          <div>
            <Label htmlFor="endDate">End Date</Label>
            <Input
              id="endDate"
              type="date"
              value={formData.endDate}
              onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
            />
          </div>

          <div className="col-span-2">
            <Label htmlFor="status">Status</Label>
            <Select 
              value={formData.status} 
              onValueChange={(value: TradeStatus) => setFormData(prev => ({ ...prev, status: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="on_track">On Track</SelectItem>
                <SelectItem value="delayed">Delayed</SelectItem>
                <SelectItem value="pending_approval">Pending Approval</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Optional description of the trade work..."
            />
          </div>
        </div>

        <div className="flex justify-end space-x-2 pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!formData.name.trim()}>
            Create Trade
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default GanttBuilder;
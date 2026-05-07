// src/components/gantt/WbsGantt.tsx
import React, { useMemo, useRef, useState, useCallback } from 'react';
import Plot from 'react-plotly.js';
import type { PlotData, Layout } from 'plotly.js';
import { addDays, format, isWeekend, parseISO, differenceInDays } from 'date-fns';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { exportToPNG, exportToPDF } from './export';
import type { WbsTask } from '@/types/wbs';
import { flattenVisible, getVisibleDateRange, type FlatRow } from './wbsModel';

const MS_DAY = 24*60*60*1000;

const COLOR_TASK = '#0ea5b7';   // teal-like
const COLOR_SUMMARY = '#22c55e'; // green
const COLOR_DEP = '#f59e0b';     // orange connectors

interface Props {
  projectName?: string;
  tasks: WbsTask[];                       // hierarchical roots
  className?: string;
}

export default function WbsGantt({ projectName='Schedule', tasks, className }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [zoom, setZoom] = useState<'day'|'week'|'month'>('week');
  const [showWeekends, setShowWeekends] = useState(true);

  const rows = useMemo(() => flattenVisible(tasks, collapsed), [tasks, collapsed]);
  const dateRange = useMemo(() => getVisibleDateRange(rows), [rows]);

  // side grid + chart scroll sync
  const gridRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!chartRef.current) return;
    chartRef.current.scrollTop = (e.target as HTMLDivElement).scrollTop;
  };

  const plotlyRef = useRef<any>(null);

  const dtick =
    zoom === 'day' ? MS_DAY :
    zoom === 'week' ? 7 * MS_DAY : 'M1';

  // Chart data (numeric y = row index) so connectors are easy
  const plotData = useMemo<PlotData[]>(() => {
    if (!rows.length) return [];

    const bars: PlotData = {
      type: 'bar',
      orientation: 'h',
      y: rows.map(r => r.index),
      x: rows.map(r => {
        const s = parseISO(r.task.startDate).getTime();
        const e = parseISO(r.task.endDate).getTime();
        return (e - s) + MS_DAY; // inclusive
      }),
      // @ts-ignore - Plotly base property for horizontal bars
      base: rows.map(r => r.task.startDate),
      marker: {
        color: rows.map(r => r.task._isSummary ? COLOR_SUMMARY : COLOR_TASK)
      },
      hovertemplate:
        '<b>%{customdata[0]}</b><br>' +
        'WBS: %{customdata[1]}<br>' +
        'Start: %{base|%Y-%m-%d}<br>' +
        'End: %{customdata[2]}<br>' +
        'Duration: %{customdata[3]}d<extra></extra>',
      customdata: rows.map(r => {
        const d = differenceInDays(parseISO(r.task.endDate), parseISO(r.task.startDate)) + 1;
        return [r.task.name, r.wbs, r.task.endDate, d];
      }),
      name: 'Tasks',
    };

    return [bars];
  }, [rows]);

  // Weekend shading
  const weekendRects = useMemo(() => {
    const rects: any[] = [];
    const start = parseISO(dateRange.minDate);
    const end = parseISO(dateRange.maxDate);
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
      if (!showWeekends || !isWeekend(d)) continue;
      const x0 = format(d, 'yyyy-MM-dd');
      const x1 = format(addDays(d, 1), 'yyyy-MM-dd');
      rects.push({
        type: 'rect',
        xref: 'x', yref: 'paper',
        x0, x1, y0: 0, y1: 1,
        fillcolor: '#f1f5f9',
        opacity: 0.7,
        line: { width: 0 }
      });
    }
    return rects;
  }, [dateRange, showWeekends]);

  // Dependency connectors (orange elbow)
  const depShapes = useMemo(() => {
    const idToRow = new Map(rows.map(r => [r.task.id, r.index]));
    const shapes: any[] = [];
    rows.forEach(r => {
      r.task.predecessors?.forEach(link => {
        const fromIdx = idToRow.get(link.taskId);
        if (fromIdx == null) return; // predecessor hidden or not present
        const pred = rows.find(x => x.index === fromIdx)!.task;
        const succ = r.task;

        const lag = (link.lagDays ?? 0);
        const xPredEnd = format(addDays(parseISO(pred.endDate), lag), 'yyyy-MM-dd');
        const xSuccStart = succ.startDate;

        // elbow path: right from pred end, down/up to succ, then to succ start
        const y0 = fromIdx;
        const y1 = r.index;
        const mid = (y0 + y1) / 2;

        shapes.push({
          type: 'path',
          layer: 'above',
          line: { color: COLOR_DEP, width: 2 },
          path:
            `M ${xPredEnd}, ${y0}` +         // move to pred end
            ` L ${xPredEnd}, ${mid}` +        // vertical halfway
            ` L ${xSuccStart}, ${mid}` +      // horizontal to succ x
            ` L ${xSuccStart}, ${y1}`,        // vertical to succ row
          xref: 'x', yref: 'y'
        });
        // small arrow head
        shapes.push({
          type: 'line',
          x0: xSuccStart, x1: xSuccStart,
          y0: y1, y1: y1 + 0.2,
          xref: 'x', yref: 'y',
          line: { color: COLOR_DEP, width: 2 }
        });
      });
    });
    return shapes;
  }, [rows]);

  const layout = useMemo<Partial<Layout>>(() => ({
    height: Math.max(400, rows.length * 36 + 160),
    margin: { l: 20, r: 20, t: 50, b: 40 },
    paper_bgcolor: 'white',
    plot_bgcolor: 'white',
    title: { text: `${projectName} — Gantt`, font: { size: 18 } },
    xaxis: {
      type: 'date',
      range: [dateRange.minDate, dateRange.maxDate],
      tickformat: zoom === 'month' ? '%b %Y' : '%d %b',
      dtick,
      showgrid: true,
      gridcolor: '#e5e7eb'
    },
    yaxis: {
      autorange: false,
      range: [-1, rows.length], // pad a bit
      tickvals: [],             // hide Plotly y ticks; we render grid ourselves
      showgrid: false
    },
    shapes: [
      // Today line
      {
        type: 'line',
        x0: format(new Date(), 'yyyy-MM-dd'),
        x1: format(new Date(), 'yyyy-MM-dd'),
        y0: 0, y1: 1,
        yref: 'paper',
        line: { color: '#ef4444', width: 2, dash: 'dash' }
      },
      ...weekendRects,
      ...depShapes
    ],
    hovermode: 'closest',
    showlegend: false,
  }), [rows.length, projectName, dateRange, weekendRects, depShapes, zoom, dtick]);

  const zoomToFit = () => {
    const gd = plotlyRef.current;
    if (!gd) return;
    const { minDate, maxDate } = dateRange;
    window.Plotly.relayout(gd, { 'xaxis.range': [minDate, maxDate] });
  };

  const exportPng = async () => plotlyRef.current && exportToPNG(plotlyRef.current, { format: 'PNG', scale: 2, includeLegend: false, includeTitle: true, projectName });
  const exportPdf = async () => plotlyRef.current && exportToPDF(plotlyRef.current, { format: 'PDF', scale: 2, includeLegend: false, includeTitle: true, projectName });

  const toggleAll = (collapse: boolean) => {
    const next: Record<string, boolean> = {};
    const walk = (nodes: WbsTask[]) => nodes.forEach(n => {
      if (n.children?.length) next[n.id] = collapse;
      if (n.children?.length) walk(n.children);
    });
    walk(tasks);
    setCollapsed(next);
  };

  return (
    <div className={cn('space-y-3', className)}>
      {/* Top controls */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={()=>toggleAll(true)}>Collapse All</Button>
          <Button variant="secondary" size="sm" onClick={()=>toggleAll(false)}>Expand All</Button>
          <Button variant="outline" size="sm" onClick={zoomToFit}>Zoom to Fit</Button>
          <Badge variant="outline">{rows.length} rows</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={zoom==='day'?'default':'outline'} size="sm" onClick={()=>setZoom('day')}>Day</Button>
          <Button variant={zoom==='week'?'default':'outline'} size="sm" onClick={()=>setZoom('week')}>Week</Button>
          <Button variant={zoom==='month'?'default':'outline'} size="sm" onClick={()=>setZoom('month')}>Month</Button>
          <Button variant="outline" size="sm" onClick={()=>setShowWeekends(x=>!x)}>
            {showWeekends ? 'Hide Weekends' : 'Show Weekends'}
          </Button>
          <Button variant="outline" size="sm" onClick={exportPng}>PNG</Button>
          <Button variant="outline" size="sm" onClick={exportPdf}>PDF</Button>
        </div>
      </div>

      {/* Grid + Chart */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="grid grid-cols-[520px_1fr]">
            {/* Left: tree grid */}
            <div className="border-r">
              {/* header */}
              <div className="grid grid-cols-[80px_1fr_110px_110px_80px_120px] sticky top-0 z-10 bg-white border-b text-xs text-gray-600">
                <div className="px-3 py-2">WBS</div>
                <div className="px-3 py-2">Task Name</div>
                <div className="px-3 py-2">Start Date</div>
                <div className="px-3 py-2">End Date</div>
                <div className="px-3 py-2">% </div>
                <div className="px-3 py-2">Predecessors</div>
              </div>
              {/* body */}
              <div ref={gridRef} onScroll={onScroll} className="max-h-[600px] overflow-auto">
                {rows.map((r) => {
                  const t = r.task;
                  const isCollapsed = !!collapsed[t.id];
                  const hasKids = !!t.children?.length;
                  return (
                    <div
                      key={t.id}
                      className="grid grid-cols-[80px_1fr_110px_110px_80px_120px] items-center text-sm border-b h-9"
                    >
                      <div className="px-3 text-gray-700">{r.wbs}</div>
                      <div className="flex items-center">
                        <div style={{ width: r.depth * 16 }} />
                        {hasKids ? (
                          <button
                            className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-100"
                            onClick={() => setCollapsed(s => ({ ...s, [t.id]: !isCollapsed }))}
                          >
                            {isCollapsed ? <ChevronRight className="w-4 h-4"/> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        ) : <div className="w-5" />}
                        <span className={cn('ml-1 truncate', t._isSummary && 'font-medium text-gray-900')}>
                          {t.name}
                        </span>
                      </div>
                      <div className="px-3 text-gray-700">{t.startDate}</div>
                      <div className="px-3 text-gray-700">{t.endDate}</div>
                      <div className="px-3">{t.percent ?? 0}%</div>
                      <div className="px-3 text-xs text-gray-600 truncate">
                        {t.predecessors?.map(p => `${p.taskId}${p.type}${p.lagDays? (p.lagDays>0?'+':'')+p.lagDays+'d':''}`).join(', ') ?? ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: chart */}
            <div ref={chartRef} className="max-h-[600px] overflow-auto">
              <Plot
                data={plotData}
                layout={layout}
                config={{ responsive: true, displaylogo: false, modeBarButtonsToRemove: ['lasso2d','select2d','pan2d'] }}
                style={{ width: '100%', height: rows.length * 36 + 220 }}
                onInitialized={(_: any, gd: any) => { plotlyRef.current = gd; }}
                onUpdate={(_: any, gd: any) => { plotlyRef.current = gd; }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
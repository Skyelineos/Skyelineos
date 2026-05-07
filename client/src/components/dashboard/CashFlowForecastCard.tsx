import { useState, useEffect } from 'react';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign } from 'lucide-react';
import { useLocation } from 'wouter';
import {
  ComposedChart, Bar, Line, XAxis, YAxis,
  Tooltip, ResponsiveContainer,
} from 'recharts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface OverheadItem { amount: number }

interface DrawRecord {
  amount: number;
  scheduledDate: string;
  status: string;
  name: string;
  projectName: string;
}

interface ForecastMonth {
  label: string;      // short: "May"
  fullLabel: string;  // "May '26"
  inflow: number;
  outflow: number;    // negative
  cumulative: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const fmt = (n: number) =>
  '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-2.5 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: p.color }} />
          <span className="text-gray-500">{p.name}:</span>
          <span className="font-medium">{fmt(Math.abs(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CashFlowForecastCard() {
  const [, setLocation] = useLocation();
  const [range, setRange] = useState<6 | 12>(6);
  const [allDraws, setAllDraws] = useState<DrawRecord[]>([]);
  const [overheadTotal, setOverheadTotal] = useState(0);
  const [forecast, setForecast] = useState<ForecastMonth[]>([]);
  const [monthlyOverhead, setMonthlyOverhead] = useState(0);
  const [nextDraw, setNextDraw] = useState<DrawRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Load overhead
        const overheadSnap = await getDoc(doc(db, 'settings', 'overhead'));
        const items: OverheadItem[] = overheadSnap.exists()
          ? (overheadSnap.data().items as OverheadItem[]) || []
          : [];
        const totalOverhead = items.reduce((s, i) => s + (i.amount || 0), 0);

        // Load draws from all projects
        const projectsSnap = await getDocs(collection(db, 'projects'));
        const allDraws: DrawRecord[] = [];
        await Promise.all(projectsSnap.docs.map(async pDoc => {
          const projectName = (pDoc.data().name as string) || 'Unknown';
          const drawSnap = await getDocs(collection(db, 'projects', pDoc.id, 'draws'));
          drawSnap.docs.forEach(d => {
            const data = d.data();
            if (data.status !== 'paid') {
              allDraws.push({
                amount: data.amount || 0,
                scheduledDate: data.scheduledDate || data.dueDate || '',
                status: data.status || 'pending',
                name: data.name || 'Draw',
                projectName,
              });
            }
          });
        }));

        allDraws.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

        // Next upcoming draw
        const today = new Date().toISOString().split('T')[0];
        const upcoming = allDraws.find(d => d.scheduledDate >= today);

        if (!cancelled) {
          setAllDraws(allDraws);
          setOverheadTotal(totalOverhead);
          setMonthlyOverhead(totalOverhead);
          setNextDraw(upcoming || null);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // Rebuild forecast when range or data changes
  useEffect(() => {
    if (loading) return;
    const now = new Date();
    const months: ForecastMonth[] = [];
    let cumulative = 0;
    for (let i = 0; i < range + 1; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const inflow = allDraws
        .filter(dr => {
          if (!dr.scheduledDate) return false;
          const sd = new Date(dr.scheduledDate);
          return sd.getFullYear() === y && sd.getMonth() === m;
        })
        .reduce((s, dr) => s + dr.amount, 0);
      const net = inflow - overheadTotal;
      cumulative += net;
      months.push({
        label: MONTH_LABELS[m],
        fullLabel: `${MONTH_LABELS[m]} '${String(y).slice(2)}`,
        inflow,
        outflow: -overheadTotal,
        cumulative,
      });
    }
    setForecast(months);
  }, [range, allDraws, overheadTotal, loading]);

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <Card className="cursor-pointer rounded-xl animate-pulse">
        <CardHeader className="p-4 md:p-6">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
          <div className="h-3 bg-gray-100 rounded w-1/2" />
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0">
          <div className="h-40 bg-gray-100 rounded" />
        </CardContent>
      </Card>
    );
  }

  const nextDrawFmt = nextDraw
    ? `${fmt(nextDraw.amount)} · ${new Date(nextDraw.scheduledDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : 'None scheduled';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow touch-target rounded-xl"
      onClick={() => setLocation('/finance')}
    >
      <CardHeader className="p-4 md:p-6 pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-fluid-lg min-w-0">
            <DollarSign className="h-5 w-5 flex-shrink-0" />
            <span className="min-w-0 text-wrap">Cash Flow</span>
          </CardTitle>
          <div className="flex items-center gap-2 shrink-0">
            {/* Range toggle — stop propagation so card click still navigates */}
            <div
              className="flex items-center gap-0.5 bg-gray-100 rounded-md p-0.5"
              onClick={e => e.stopPropagation()}
            >
              {([6, 12] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-2 py-0.5 rounded text-xs font-medium transition-all ${
                    range === r ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {r}m
                </button>
              ))}
            </div>
            <span className="text-xs text-[#C9A96E] font-medium">Finance →</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-2">
        {/* Mini chart */}
        <ResponsiveContainer width="100%" height={160}>
          <ComposedChart data={forecast} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="inflow" name="Income" fill="#22c55e" radius={[3, 3, 0, 0]} maxBarSize={32} />
            <Bar dataKey="outflow" name="Overhead" fill="#ef444466" radius={[3, 3, 0, 0]} maxBarSize={32} />
            <Line
              dataKey="cumulative"
              name="Net"
              type="monotone"
              stroke="#C9A96E"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#C9A96E' }}
            />
          </ComposedChart>
        </ResponsiveContainer>

        {/* Footer stats */}
        <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-gray-100">
          <div className="min-w-0">
            <p className="text-xs text-gray-500 truncate">Next Draw</p>
            <p className="text-sm font-semibold text-gray-800 truncate">{nextDrawFmt}</p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-500">Monthly Overhead</p>
            <p className="text-sm font-semibold text-red-600">{fmt(monthlyOverhead)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

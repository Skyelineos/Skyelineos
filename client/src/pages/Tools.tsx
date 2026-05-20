import { Link } from 'wouter';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Hammer,
  Grid3X3,
  Box,
  Calculator,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

interface ToolDef {
  id: string;
  title: string;
  blurb: string;
  description: string;
  icon: typeof Hammer;
  href?: string;
  status: 'available' | 'coming-soon';
}

const TOOLS: ToolDef[] = [
  {
    id: 'lumber',
    title: 'Lumber Takeoff Calculator',
    blurb: 'Plan PDF → framing materials list',
    description:
      'Upload your plan, walk through a guided wizard, and get a categorized lumber list — studs, plates, sheathing, headers, and AdvanTech subfloor — with quantities and waste built in.',
    icon: Hammer,
    href: '/tools/lumber',
    status: 'available',
  },
  {
    id: 'tile',
    title: 'Tile Designer',
    blurb: 'Design showers + spaces, get accurate tile counts',
    description:
      'Lay out shower walls, floors, and tile patterns. Calculates tile, bullnose, grout, and waste — ready to hand to your supplier.',
    icon: Grid3X3,
    status: 'coming-soon',
  },
  {
    id: 'millwork',
    title: 'Millwork Studio',
    blurb: '3D rooms, client material picker, takeoffs',
    description:
      'Build 3D rooms from your plans, apply Interior Works materials, let clients doodle their own ideas, and pull a millwork order out the other side.',
    icon: Box,
    status: 'coming-soon',
  },
  {
    id: 'concrete',
    title: 'Concrete Calculator',
    blurb: 'Footings, foundation walls, slabs',
    description:
      'Geometry-driven concrete yardage for footings, foundation walls, and flatwork. Includes rebar takeoff and pour-day planning notes.',
    icon: Calculator,
    status: 'coming-soon',
  },
];

export default function Tools() {
  return (
    <AppLayout>
      <div className="min-h-screen" style={{ backgroundColor: '#F8F7F4' }}>
        {/* Header */}
        <div className="border-b bg-white">
          <div className="max-w-7xl mx-auto px-6 py-8">
            <div className="flex items-center gap-3 mb-1">
              <Sparkles className="w-4 h-4" style={{ color: '#C9A96E' }} />
              <span
                className="text-xs font-sans font-medium uppercase tracking-widest"
                style={{ color: '#C9A96E', letterSpacing: '0.15em' }}
              >
                Skyeline Tools
              </span>
            </div>
            <h1
              className="text-3xl font-heading font-semibold"
              style={{ color: '#141414', letterSpacing: '0.02em' }}
            >
              Tools
            </h1>
            <p className="text-sm text-gray-600 mt-1 max-w-2xl">
              Standalone calculators and utilities that read your plans and produce accurate
              material lists. Built around how Skyeline actually builds in Utah.
            </p>
          </div>
        </div>

        {/* Tools grid */}
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {TOOLS.map(t => (
              <ToolCard key={t.id} tool={t} />
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function ToolCard({ tool }: { tool: ToolDef }) {
  const Icon = tool.icon;
  const isAvailable = tool.status === 'available';

  const inner = (
    <Card
      className={
        'overflow-hidden transition-all duration-200 ' +
        (isAvailable
          ? 'cursor-pointer hover:shadow-lg hover:-translate-y-0.5 border-2'
          : 'opacity-70 cursor-not-allowed border')
      }
      style={
        isAvailable
          ? { borderColor: 'rgba(201,169,110,0.3)' }
          : { borderColor: 'rgba(0,0,0,0.08)' }
      }
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div
            className="w-12 h-12 rounded-lg flex items-center justify-center"
            style={{
              backgroundColor: isAvailable ? 'rgba(201,169,110,0.12)' : 'rgba(0,0,0,0.04)',
            }}
          >
            <Icon
              className="w-6 h-6"
              style={{ color: isAvailable ? '#C9A96E' : '#9CA3AF' }}
            />
          </div>
          {tool.status === 'coming-soon' && (
            <Badge variant="outline" className="text-xs font-medium" style={{ color: '#6B7280' }}>
              Coming Soon
            </Badge>
          )}
          {tool.status === 'available' && (
            <Badge
              className="text-xs font-medium"
              style={{
                backgroundColor: 'rgba(201,169,110,0.15)',
                color: '#8B6F3F',
                border: '1px solid rgba(201,169,110,0.3)',
              }}
            >
              Available
            </Badge>
          )}
        </div>

        <h3
          className="text-lg font-heading font-semibold mb-1"
          style={{ color: '#141414' }}
        >
          {tool.title}
        </h3>
        <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: '#C9A96E', letterSpacing: '0.08em' }}>
          {tool.blurb}
        </p>
        <p className="text-sm text-gray-600 leading-relaxed mb-4">
          {tool.description}
        </p>

        {isAvailable && (
          <div className="flex items-center gap-2 text-sm font-medium" style={{ color: '#141414' }}>
            <span>Open tool</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (isAvailable && tool.href) {
    return <Link href={tool.href}>{inner}</Link>;
  }
  return inner;
}

// Read-only table of items the brain auto-filed (high confidence,
// informational categories). Filterable by source / category / project.

import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Eye } from 'lucide-react';
import type { ProcessedItem } from './types';

interface Props {
  items: ProcessedItem[];
}

export function AutoFiledTab({ items }: Props) {
  const [source, setSource] = useState<string>('all');
  const [category, setCategory] = useState<string>('all');
  const [project, setProject] = useState<string>('all');
  const [view, setView] = useState<ProcessedItem | null>(null);

  const sources = useMemo(() => unique(items.map((i) => i.source)), [items]);
  const categories = useMemo(() => unique(items.map((i) => i.category)), [items]);
  const projects = useMemo(() => unique(items.map((i) => i.projectId).filter((x): x is string => !!x)), [items]);

  const filtered = items
    .filter((i) => source === 'all' || i.source === source)
    .filter((i) => category === 'all' || i.category === category)
    .filter((i) => project === 'all' || i.projectId === project)
    .sort((a, b) => timestampMillis(b.processedAt) - timestampMillis(a.processedAt));

  if (items.length === 0) {
    return <EmptyState message="No items have been auto-filed yet." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <FilterSelect label="Source" value={source} setValue={setSource} options={sources} />
        <FilterSelect label="Category" value={category} setValue={setCategory} options={categories} />
        <FilterSelect label="Project" value={project} setValue={setProject} options={projects} />
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50">
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="p-3">When</th>
                <th className="p-3">Source</th>
                <th className="p-3">Category</th>
                <th className="p-3">Project</th>
                <th className="p-3">Confidence</th>
                <th className="p-3 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="border-b last:border-b-0 hover:bg-gray-50">
                  <td className="p-3 text-gray-600">{formatTimestamp(item.processedAt)}</td>
                  <td className="p-3"><Badge variant="outline">{item.source}</Badge></td>
                  <td className="p-3 text-gray-800">{item.category}</td>
                  <td className="p-3 text-gray-600">{item.projectId || '—'}</td>
                  <td className="p-3 text-gray-600">{(item.confidence * 100).toFixed(0)}%</td>
                  <td className="p-3">
                    <Button variant="ghost" size="sm" onClick={() => setView(item)}>
                      <Eye className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-gray-400 text-sm">
                    No items match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{view?.category}{view?.projectId ? ` · ${view.projectId}` : ''}</DialogTitle>
          </DialogHeader>
          {view && (
            <div className="space-y-3 text-sm">
              <KeyValue label="Source" value={view.source} />
              <KeyValue label="Confidence" value={`${(view.confidence * 100).toFixed(0)}% — ${view.confidenceReason || ''}`} />
              <KeyValue label="Model" value={`${view.modelUsed || ''} · ${view.inputTokens ?? 0}+${view.outputTokens ?? 0} tokens · $${(view.costUsd ?? 0).toFixed(4)}`} />
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Structured payload</p>
                <pre className="bg-gray-50 border rounded p-3 text-xs overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(view.structuredPayload || {}, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterSelect({
  label, value, setValue, options,
}: { label: string; value: string; setValue: (v: string) => void; options: string[] }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500">{label}</span>
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger className="w-40 h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>{o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="p-12 text-center">
        <p className="text-gray-500">{message}</p>
      </CardContent>
    </Card>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-gray-800">{value}</p>
    </div>
  );
}

function unique(arr: string[]): string[] {
  return Array.from(new Set(arr)).sort();
}

function formatTimestamp(ts: any): string {
  if (!ts) return '';
  if (typeof ts.toDate === 'function') return ts.toDate().toLocaleString();
  try { return new Date(ts).toLocaleString(); } catch { return ''; }
}

function timestampMillis(ts: any): number {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts === 'number') return ts;
  try { return new Date(ts).getTime(); } catch { return 0; }
}

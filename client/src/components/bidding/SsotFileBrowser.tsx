// Read-only "Project Files" browser for subs — the curated Single Source of
// Truth (promoted plans, approved design, selections). Subs see only what the
// GC promoted (inSsot); the rules enforce it. See docs/single-source-of-truth-design.md.

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, ExternalLink, FolderOpen } from 'lucide-react';
import { listSsotItems } from '@/lib/ssot/ssotItems';
import { SSOT_CATEGORIES, type SsotItem, type SsotCategory } from '@/lib/ssot/types';

export function SsotFileBrowser({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<SsotItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const found = await listSsotItems(projectId);
        if (!cancelled) setItems(found);
      } catch (e) {
        console.warn('[ssot] file browser load failed', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  if (!loading && items.length === 0) return null;

  const byCategory = (cat: SsotCategory) => items.filter(i => i.category === cat);

  return (
    <Card className="border-[#C9A96E]/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-[#C9A96E]" />
          Project Files
        </CardTitle>
        <CardDescription>
          The current plans, approved design, and selections for this job — bid to these.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          SSOT_CATEGORIES.map(cat => {
            const rows = byCategory(cat);
            if (rows.length === 0) return null;
            return (
              <div key={cat}>
                <div className="text-xs font-medium text-gray-500 mb-1.5">{cat}</div>
                <div className="space-y-1.5">
                  {rows.map(item => (
                    <div key={`${item.source}-${item.id}`} className="flex items-center gap-2 border rounded-lg px-3 py-2">
                      <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="text-sm text-gray-900 flex-1 truncate">{item.title}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">{item.source}</Badge>
                      {item.fileUrl && (
                        <a
                          href={item.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#C9A96E] hover:underline text-xs flex items-center gap-1 shrink-0"
                        >
                          Open <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

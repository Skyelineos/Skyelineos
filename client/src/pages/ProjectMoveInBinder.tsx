import { useEffect, useMemo, useState } from 'react';
import { useRoute } from 'wouter';
import { ProjectLayout } from '@/components/layout/ProjectLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp,
  updateDoc, orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  ClipboardCheck, Plus, Trash2, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle2, ExternalLink, Calendar,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  type BinderItem, type BinderCategory,
  CATEGORY_LABEL, CATEGORY_ORDER,
} from '@/lib/moveInBinder/types';

function newId() { return `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }
function todayIso() { return new Date().toISOString().slice(0, 10); }
function addYearsIso(base: string, years: number): string {
  const d = new Date(base);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

export default function ProjectMoveInBinder() {
  const [, params] = useRoute('/projects/:id/move-in-binder');
  const projectId = params?.id;
  const { user } = useAuth();
  const { toast } = useToast();

  const [items, setItems] = useState<BinderItem[]>([]);
  const [expandedCat, setExpandedCat] = useState<Record<BinderCategory, boolean>>({} as any);
  const [showForm, setShowForm] = useState<BinderCategory | null>(null);
  const [form, setForm] = useState<Partial<BinderItem>>({});

  useEffect(() => {
    if (!projectId) return;
    const colRef = collection(db, 'projects', projectId, 'moveInBinder');
    const unsub = onSnapshot(query(colRef, orderBy('category')), snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    });
    return () => unsub();
  }, [projectId]);

  const grouped = useMemo(() => {
    const out: Record<BinderCategory, BinderItem[]> = {} as any;
    for (const cat of CATEGORY_ORDER) out[cat] = [];
    for (const it of items) {
      if (out[it.category]) out[it.category].push(it);
      else out.other.push(it);
    }
    return out;
  }, [items]);

  const totalCount = items.length;
  const upcomingExpiries = items.filter(it => {
    if (!it.warrantyExpires) return false;
    const exp = new Date(it.warrantyExpires).getTime();
    const now = Date.now();
    const days = (exp - now) / 86400000;
    return days >= 0 && days <= 60;
  });

  const startAdd = (cat: BinderCategory) => {
    setShowForm(cat);
    setForm({ category: cat, installDate: todayIso() });
  };

  const cancelForm = () => { setShowForm(null); setForm({}); };

  const saveForm = async () => {
    if (!projectId) return;
    if (!form.name || !form.category) {
      toast({ title: 'Name + category required', variant: 'destructive' });
      return;
    }
    const id = form.id || '';
    const data: any = {
      projectId,
      category: form.category,
      name: form.name,
      brand: form.brand || '',
      model: form.model || '',
      serial: form.serial || '',
      retailer: form.retailer || '',
      installerName: form.installerName || '',
      installerContactId: form.installerContactId || null,
      installDate: form.installDate || todayIso(),
      warrantyTermYears: form.warrantyTermYears ?? null,
      warrantyExpires: form.warrantyExpires
        || (form.installDate && form.warrantyTermYears ? addYearsIso(form.installDate, form.warrantyTermYears) : null),
      manualUrl: form.manualUrl || '',
      notes: form.notes || '',
      registered: form.registered ?? false,
      updatedAt: serverTimestamp(),
    };
    try {
      if (id) {
        await updateDoc(doc(db, 'projects', projectId, 'moveInBinder', id), data);
        toast({ title: 'Item updated' });
      } else {
        data.createdAt = serverTimestamp();
        data.createdBy = user?.email || 'unknown';
        await addDoc(collection(db, 'projects', projectId, 'moveInBinder'), data);
        toast({ title: 'Item added' });
      }
      cancelForm();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message || 'Unknown', variant: 'destructive' });
    }
  };

  const remove = async (it: BinderItem) => {
    if (!projectId) return;
    if (!confirm(`Remove "${it.name}"?`)) return;
    await deleteDoc(doc(db, 'projects', projectId, 'moveInBinder', it.id));
  };

  if (!projectId) return null;

  return (
    <ProjectLayout projectId={projectId} projectName="Move-in Binder">
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <ClipboardCheck className="w-7 h-7 text-[#C9A96E]" />
            <div>
              <h1 className="text-2xl font-bold">Move-in Binder</h1>
              <p className="text-sm text-gray-500">
                Every appliance, system, and finish in this home — with manuals, warranties, and who installed it.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{totalCount} item{totalCount === 1 ? '' : 's'}</Badge>
            {upcomingExpiries.length > 0 && (
              <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">
                <AlertTriangle className="w-3 h-3 mr-1" />
                {upcomingExpiries.length} warranty expiring soon
              </Badge>
            )}
          </div>
        </div>

        {CATEGORY_ORDER.map(cat => {
          const rows = grouped[cat] || [];
          const isOpen = expandedCat[cat] ?? rows.length > 0;
          const isEditingHere = showForm === cat;
          return (
            <Card key={cat}>
              <CardContent className="p-0">
                <button
                  type="button"
                  onClick={() => setExpandedCat(s => ({ ...s, [cat]: !isOpen }))}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{CATEGORY_LABEL[cat]}</span>
                    <Badge variant="outline" className="text-xs">{rows.length}</Badge>
                  </div>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100">
                    {rows.length === 0 && !isEditingHere && (
                      <div className="p-4 text-sm text-gray-400 text-center">No items yet.</div>
                    )}
                    {rows.map(it => (
                      <div key={it.id} className="px-4 py-3 border-b border-gray-100 last:border-b-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-gray-900">{it.name}</p>
                            <p className="text-xs text-gray-500">
                              {[it.brand, it.model].filter(Boolean).join(' · ')}
                              {it.serial ? ` · S/N ${it.serial}` : ''}
                            </p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {it.installerName && (
                                <Badge variant="outline" className="text-[10px]">Installed by {it.installerName}</Badge>
                              )}
                              {it.retailer && <Badge variant="outline" className="text-[10px]">Bought at {it.retailer}</Badge>}
                              {it.warrantyExpires && (
                                <Badge variant="outline" className={`text-[10px] gap-1 ${
                                  new Date(it.warrantyExpires).getTime() < Date.now() ? 'bg-red-50 text-red-700 border-red-200'
                                    : 'bg-green-50 text-green-700 border-green-200'
                                }`}>
                                  <Calendar className="w-2.5 h-2.5" />
                                  Warranty expires {it.warrantyExpires}
                                </Badge>
                              )}
                              {it.manualUrl && (
                                <a href={it.manualUrl} target="_blank" rel="noreferrer" className="text-[10px] inline-flex items-center gap-0.5 text-blue-600 hover:underline">
                                  <ExternalLink className="w-2.5 h-2.5" /> Manual
                                </a>
                              )}
                              {it.registered ? (
                                <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200 gap-1">
                                  <CheckCircle2 className="w-2.5 h-2.5" /> Warranty registered
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                                  Not registered
                                </Badge>
                              )}
                            </div>
                            {it.notes && <p className="text-xs text-gray-500 mt-1">{it.notes}</p>}
                          </div>
                          <div className="flex flex-col gap-1">
                            <Button size="sm" variant="ghost" onClick={() => { setShowForm(cat); setForm(it); }}>Edit</Button>
                            <Button size="sm" variant="ghost" className="text-red-500" onClick={() => remove(it)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}

                    {isEditingHere ? (
                      <div className="p-4 bg-gray-50 border-t border-gray-100 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <Field label="Name *">
                            <Input value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Wolf 36-inch Range" />
                          </Field>
                          <Field label="Brand">
                            <Input value={form.brand || ''} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} />
                          </Field>
                          <Field label="Model">
                            <Input value={form.model || ''} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
                          </Field>
                          <Field label="Serial number">
                            <Input value={form.serial || ''} onChange={e => setForm(f => ({ ...f, serial: e.target.value }))} />
                          </Field>
                          <Field label="Retailer">
                            <Input value={form.retailer || ''} onChange={e => setForm(f => ({ ...f, retailer: e.target.value }))} />
                          </Field>
                          <Field label="Installed by (sub)">
                            <Input value={form.installerName || ''} onChange={e => setForm(f => ({ ...f, installerName: e.target.value }))} placeholder="Sub/vendor name" />
                          </Field>
                          <Field label="Install date">
                            <Input type="date" value={form.installDate || ''} onChange={e => setForm(f => ({ ...f, installDate: e.target.value }))} />
                          </Field>
                          <Field label="Warranty term">
                            <Select value={String(form.warrantyTermYears ?? '')} onValueChange={v => setForm(f => ({ ...f, warrantyTermYears: parseInt(v, 10) || undefined }))}>
                              <SelectTrigger><SelectValue placeholder="Select term" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="1">1 year</SelectItem>
                                <SelectItem value="2">2 years</SelectItem>
                                <SelectItem value="5">5 years</SelectItem>
                                <SelectItem value="10">10 years</SelectItem>
                                <SelectItem value="25">25 years</SelectItem>
                                <SelectItem value="50">Lifetime (50y)</SelectItem>
                              </SelectContent>
                            </Select>
                          </Field>
                          <Field label="Warranty expires">
                            <Input type="date" value={form.warrantyExpires || ''} onChange={e => setForm(f => ({ ...f, warrantyExpires: e.target.value }))} />
                          </Field>
                          <Field label="Manual URL">
                            <Input value={form.manualUrl || ''} onChange={e => setForm(f => ({ ...f, manualUrl: e.target.value }))} placeholder="https://…" />
                          </Field>
                          <div className="sm:col-span-2">
                            <Field label="Notes">
                              <Textarea rows={2} value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                            </Field>
                          </div>
                          <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={!!form.registered} onChange={e => setForm(f => ({ ...f, registered: e.target.checked }))} />
                            Warranty registered with manufacturer
                          </label>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={cancelForm}>Cancel</Button>
                          <Button size="sm" onClick={saveForm}>Save</Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startAdd(cat)}
                        className="w-full px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 inline-flex items-center justify-center gap-1.5 border-t border-gray-100"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add {CATEGORY_LABEL[cat].toLowerCase()}
                      </button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </ProjectLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-gray-600">{label}</Label>
      {children}
    </div>
  );
}

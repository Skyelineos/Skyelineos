import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Check, ChevronLeft, ChevronRight, Plus, Trash2, Info, Save, AlertTriangle,
  Building2, BookOpen, Layers, Anchor, Square, ClipboardList, Download, Lightbulb,
  FileText, Upload, Ruler, Loader2, X,
} from 'lucide-react';
// @ts-ignore — legacy build path; types resolved from main entry
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import type {
  LumberTakeoff, FloorDef, WallRun, HeaderRun, SubfloorArea,
  BeamSpec, PostSpec, WizardStep, Sheathing, StudSize, SubfloorProduct,
  WallKind, LengthSource, AreaSource, PageCalibration,
} from '@/lib/lumber/types';
import { WIZARD_STEPS } from '@/lib/lumber/types';
import { calculate, resolveLengthFt, resolveAreaSqft } from '@/lib/lumber/calculate';
import { LumberPdfStage, type StageShape, type StageTool } from './LumberPdfStage';
import { PdfPageGallery } from './PdfPageGallery';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const GOLD = '#C9A96E';
const DARK = '#141414';

const WALL_KIND_COLORS: Record<WallKind, string> = {
  'exterior-bearing':     '#2563eb', // blue
  'interior-bearing':     '#7c3aed', // violet
  'interior-non-bearing': '#10b981', // emerald
};
const WALL_KIND_LABELS: Record<WallKind, string> = {
  'exterior-bearing':     'Exterior bearing',
  'interior-bearing':     'Interior bearing',
  'interior-non-bearing': 'Interior non-bearing',
};

interface Props {
  takeoff: LumberTakeoff;
  onChange: (next: LumberTakeoff) => Promise<void>;
  projectName: string;
}

export default function LumberWizard({ takeoff: initial, onChange }: Props) {
  const [doc, setDoc] = useState<LumberTakeoff>(initial);
  const [step, setStep] = useState<WizardStep>('setup');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const { toast } = useToast();

  // Debounced auto-save: any change to `doc` triggers a save 800ms later.
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setSaving(true);
      try {
        await onChange(doc);
        setSavedAt(Date.now());
      } catch (e: any) {
        toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
      } finally {
        setSaving(false);
      }
    }, 800);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  const update = useCallback((patch: Partial<LumberTakeoff>) => {
    setDoc(prev => ({ ...prev, ...patch }));
  }, []);

  const stepIndex = WIZARD_STEPS.findIndex(s => s.id === step);
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === WIZARD_STEPS.length - 1;
  const next = () => !isLast && setStep(WIZARD_STEPS[stepIndex + 1].id);
  const prev = () => !isFirst && setStep(WIZARD_STEPS[stepIndex - 1].id);

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 105px)', backgroundColor: '#F8F7F4' }}>
      {/* Stepper */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-1 overflow-x-auto">
            {WIZARD_STEPS.map((s, i) => {
              const isActive = s.id === step;
              const isDone = i < stepIndex;
              return (
                <button
                  key={s.id}
                  onClick={() => setStep(s.id)}
                  className="flex items-center gap-2 flex-shrink-0 px-3 py-1.5 rounded-md text-sm transition-colors"
                  style={
                    isActive
                      ? { backgroundColor: 'rgba(201,169,110,0.15)', color: DARK }
                      : isDone
                        ? { color: '#6B7280' }
                        : { color: '#9CA3AF' }
                  }
                >
                  <span
                    className="flex items-center justify-center w-5 h-5 rounded-full text-xs font-medium"
                    style={
                      isDone
                        ? { backgroundColor: GOLD, color: DARK }
                        : isActive
                          ? { backgroundColor: DARK, color: 'white' }
                          : { backgroundColor: '#E5E7EB', color: '#6B7280' }
                    }
                  >
                    {isDone ? <Check className="w-3 h-3" /> : i + 1}
                  </span>
                  <span className="font-medium whitespace-nowrap">{s.label}</span>
                  {i < WIZARD_STEPS.length - 1 && (
                    <ChevronRight className="w-3 h-3 text-gray-300 ml-1" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
          <div>
            {step === 'setup'    && <SetupStep    doc={doc} update={update} />}
            {step === 'scale'    && <ScaleStep    doc={doc} update={update} />}
            {step === 'legend'   && <LegendStep   doc={doc} update={update} />}
            {step === 'walls'    && <WallsStep    doc={doc} update={update} />}
            {step === 'headers'  && <HeadersStep  doc={doc} update={update} />}
            {step === 'subfloor' && <SubfloorStep doc={doc} update={update} />}
            {step === 'results'  && <ResultsStep  doc={doc} update={update} />}
          </div>
          <TipsPanel step={step} />
        </div>
      </div>

      {/* Footer */}
      <div className="border-t bg-white sticky bottom-0">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="text-xs text-gray-500 flex items-center gap-2">
            {saving ? (
              <><Save className="w-3 h-3 animate-pulse" /> Saving…</>
            ) : savedAt ? (
              <><Check className="w-3 h-3 text-green-600" /> Saved {timeAgo(savedAt)}</>
            ) : (
              <><Save className="w-3 h-3 text-gray-400" /> Auto-save on</>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={prev} disabled={isFirst} size="sm">
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button
              onClick={next}
              disabled={isLast}
              size="sm"
              style={{ backgroundColor: GOLD, color: DARK }}
              className="hover:opacity-90"
            >
              {isLast ? 'Done' : 'Continue'} <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 1: Setup ────────────────────────────────────────────────────────────

function SetupStep({ doc, update }: { doc: LumberTakeoff; update: (p: Partial<LumberTakeoff>) => void }) {
  const setFloors = (floors: FloorDef[]) => update({ floors });

  const addFloor = () => {
    const used = new Set(doc.floors.map(f => f.id));
    const suggestions: { id: string; label: string }[] = [
      { id: 'basement', label: 'Basement' },
      { id: 'main',     label: 'Main Floor' },
      { id: 'upper',    label: 'Upper Floor' },
      { id: 'upper2',   label: 'Third Floor' },
    ];
    const next = suggestions.find(s => !used.has(s.id))
      ?? { id: `floor-${doc.floors.length + 1}`, label: `Floor ${doc.floors.length + 1}` };
    setFloors([...doc.floors, next]);
  };

  const removeFloor = (id: string) => {
    if (doc.floors.length <= 1) return;
    setFloors(doc.floors.filter(f => f.id !== id));
  };

  const pageOptions = doc.pdf
    ? Array.from({ length: doc.pdf.pageCount }, (_, i) => i + 1)
    : [];

  return (
    <StepCard
      icon={Building2}
      title="Setup"
      subtitle="Upload your plan, name the takeoff, and add the floors of the home."
    >
      <div className="space-y-6">
        <div>
          <Label htmlFor="name">Takeoff name</Label>
          <Input
            id="name"
            value={doc.name}
            onChange={e => update({ name: e.target.value })}
            placeholder="Lumber Takeoff — 703 W. 930 N."
            className="mt-1.5"
          />
        </div>

        <PdfUploadCard doc={doc} update={update} />

        {doc.pdf && (
          <PdfPageGallery
            fileUrl={doc.pdf.url}
            pageCount={doc.pdf.pageCount}
            assignments={buildPageAssignments(doc.floors)}
          />
        )}

        <div>
          <Label>Default wall height</Label>
          <p className="text-xs text-gray-500 mb-2">
            Starting height when you add a new wall. Override per row anytime.
          </p>
          <div className="flex flex-wrap gap-2">
            {[8, 9, 10, 12].map(h => (
              <button
                key={h}
                onClick={() => update({ defaults: { ...doc.defaults, wallHeightFt: h } })}
                className="px-4 py-2 rounded-md text-sm font-medium transition-colors border"
                style={
                  doc.defaults.wallHeightFt === h
                    ? { backgroundColor: GOLD, color: DARK, borderColor: GOLD }
                    : { backgroundColor: 'white', color: '#6B7280', borderColor: '#E5E7EB' }
                }
              >
                {h}′
              </button>
            ))}
            <Input
              type="number"
              min={6}
              max={20}
              step={0.5}
              value={[8, 9, 10, 12].includes(doc.defaults.wallHeightFt) ? '' : doc.defaults.wallHeightFt}
              onChange={e => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v)) update({ defaults: { ...doc.defaults, wallHeightFt: v } });
              }}
              placeholder="Custom"
              className="w-28"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Floors</Label>
            <Button size="sm" variant="outline" onClick={addFloor}>
              <Plus className="w-3 h-3 mr-1" /> Add floor
            </Button>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Add each level of the home. If you uploaded a plan above, also pick which page is the floor plan + framing plan for each level.
          </p>
          <div className="space-y-2">
            {doc.floors.map((f, i) => (
              <div key={f.id} className="bg-white border rounded-md p-3" style={{ borderColor: '#E5E7EB' }}>
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-8 h-8 rounded-md flex items-center justify-center text-sm font-medium flex-shrink-0"
                    style={{ backgroundColor: 'rgba(201,169,110,0.12)', color: GOLD }}
                  >
                    {i + 1}
                  </div>
                  <Input
                    value={f.label}
                    onChange={e => {
                      const next = [...doc.floors];
                      next[i] = { ...f, label: e.target.value };
                      setFloors(next);
                    }}
                    className="flex-1 border-0 shadow-none focus-visible:ring-0 px-2"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={doc.floors.length <= 1}
                    onClick={() => removeFloor(f.id)}
                    className="text-gray-400 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                {doc.pdf && (
                  <div className="grid grid-cols-2 gap-2 ml-10">
                    <div>
                      <Label className="text-[10px] text-gray-500 uppercase tracking-wider">Floor plan page</Label>
                      <Select
                        value={f.archPageNumber ? String(f.archPageNumber) : '_none'}
                        onValueChange={v => {
                          const next = [...doc.floors];
                          next[i] = { ...f, archPageNumber: v === '_none' ? undefined : parseInt(v) };
                          setFloors(next);
                        }}
                      >
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">— none —</SelectItem>
                          {pageOptions.map(n => (
                            <SelectItem key={n} value={String(n)}>Page {n}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[10px] text-gray-500 uppercase tracking-wider">Framing plan page</Label>
                      <Select
                        value={f.framingPageNumber ? String(f.framingPageNumber) : '_none'}
                        onValueChange={v => {
                          const next = [...doc.floors];
                          next[i] = { ...f, framingPageNumber: v === '_none' ? undefined : parseInt(v) };
                          setFloors(next);
                        }}
                      >
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">— none —</SelectItem>
                          {pageOptions.map(n => (
                            <SelectItem key={n} value={String(n)}>Page {n}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </StepCard>
  );
}

function buildPageAssignments(floors: FloorDef[]): Record<number, { floorLabel: string; role: 'plan' | 'framing' }[]> {
  const out: Record<number, { floorLabel: string; role: 'plan' | 'framing' }[]> = {};
  for (const f of floors) {
    if (f.archPageNumber) {
      out[f.archPageNumber] = [...(out[f.archPageNumber] ?? []), { floorLabel: f.label, role: 'plan' }];
    }
    if (f.framingPageNumber) {
      out[f.framingPageNumber] = [...(out[f.framingPageNumber] ?? []), { floorLabel: f.label, role: 'framing' }];
    }
  }
  return out;
}

function PdfUploadCard({ doc, update }: { doc: LumberTakeoff; update: (p: Partial<LumberTakeoff>) => void }) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = async (file: File) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast({ title: 'Not a PDF', description: 'Please upload a PDF file.', variant: 'destructive' });
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const storagePath = `projects/${doc.projectId}/lumberTakeoffs/${doc.id}.pdf`;
      const ref = storageRef(storage, storagePath);
      const task = uploadBytesResumable(ref, file);

      await new Promise<void>((resolve, reject) => {
        task.on('state_changed',
          snap => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
          reject,
          () => resolve(),
        );
      });

      const url = await getDownloadURL(ref);

      // Detect page count via pdf.js
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const pageCount = pdf.numPages;
      pdf.destroy();

      update({
        pdf: {
          url,
          storagePath,
          name: file.name,
          pageCount,
          uploadedAt: new Date().toISOString(),
        },
        // Reset any stale calibrations/page assignments — different PDF
        calibrations: {},
        floors: doc.floors.map(f => ({ ...f, archPageNumber: undefined, framingPageNumber: undefined })),
      });
      toast({ title: 'Plan uploaded', description: `${file.name} (${pageCount} page${pageCount === 1 ? '' : 's'})` });
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const removePdf = async () => {
    if (!doc.pdf) return;
    try {
      await deleteObject(storageRef(storage, doc.pdf.storagePath));
    } catch { /* file may not exist; ignore */ }
    update({
      pdf: undefined,
      calibrations: {},
      floors: doc.floors.map(f => ({ ...f, archPageNumber: undefined, framingPageNumber: undefined })),
    });
  };

  if (doc.pdf) {
    return (
      <div className="bg-white border rounded-lg p-4" style={{ borderColor: '#E5E7EB' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'rgba(201,169,110,0.12)' }}
            >
              <FileText className="w-5 h-5" style={{ color: GOLD }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: DARK }}>{doc.pdf.name}</p>
              <p className="text-xs text-gray-500">{doc.pdf.pageCount} page{doc.pdf.pageCount === 1 ? '' : 's'} · uploaded {timeAgoIso(doc.pdf.uploadedAt)}</p>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              Replace
            </Button>
            <Button variant="ghost" size="sm" onClick={removePdf} className="text-gray-400 hover:text-red-600">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
      </div>
    );
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) handleFile(f);
      }}
      onClick={() => !uploading && fileInputRef.current?.click()}
      className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors"
      style={{
        borderColor: dragging ? GOLD : '#D1D5DB',
        backgroundColor: dragging ? 'rgba(201,169,110,0.06)' : '#FAFAF8',
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      {uploading ? (
        <>
          <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" style={{ color: GOLD }} />
          <p className="text-sm font-medium" style={{ color: DARK }}>Uploading… {progress}%</p>
        </>
      ) : (
        <>
          <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
          <p className="text-sm font-medium mb-0.5" style={{ color: DARK }}>Upload plan PDF</p>
          <p className="text-xs text-gray-500">Drag and drop, or click to choose. Optional — you can also do this takeoff with numeric entry only.</p>
        </>
      )}
    </div>
  );
}

// ─── Step 2: Scale ────────────────────────────────────────────────────────────

function ScaleStep({ doc, update }: { doc: LumberTakeoff; update: (p: Partial<LumberTakeoff>) => void }) {
  // Pages referenced by any floor as arch or framing
  const usedPages = useMemo(() => {
    const set = new Set<number>();
    for (const f of doc.floors) {
      if (f.archPageNumber)    set.add(f.archPageNumber);
      if (f.framingPageNumber) set.add(f.framingPageNumber);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [doc.floors]);

  const [activePage, setActivePage] = useState<number | null>(usedPages[0] ?? null);

  useEffect(() => {
    if (activePage === null && usedPages.length > 0) setActivePage(usedPages[0]);
  }, [usedPages, activePage]);

  if (!doc.pdf) {
    return (
      <StepCard
        icon={Ruler}
        title="Scale"
        subtitle="No plan PDF uploaded — scale calibration is skipped. Go back to Setup to upload a plan, or continue if you're entering takeoffs numerically."
      >
        <EmptyHint text="Numeric-only mode. Skip ahead to Legend or Walls." />
      </StepCard>
    );
  }

  if (usedPages.length === 0) {
    return (
      <StepCard
        icon={Ruler}
        title="Scale"
        subtitle="No pages assigned to floors yet — go back to Setup and pick which PDF page is the floor plan + framing plan for each floor."
      >
        <EmptyHint text="Assign at least one page to a floor in Setup, then come back here." />
      </StepCard>
    );
  }

  const onCalibrate = (pageNumber: number, cal: PageCalibration) => {
    update({ calibrations: { ...doc.calibrations, [String(pageNumber)]: cal } });
  };

  const clearCal = (pageNumber: number) => {
    const next = { ...doc.calibrations };
    delete next[String(pageNumber)];
    update({ calibrations: next });
  };

  return (
    <StepCard
      icon={Ruler}
      title="Scale"
      subtitle="For each plan page, tap two points on a dimension line and type what it says. Pick the longest dimension on the page for best accuracy."
    >
      <div className="space-y-3">
        {/* Page picker chips */}
        <div className="flex flex-wrap gap-2">
          {usedPages.map(p => {
            const cal = doc.calibrations[String(p)];
            const usedBy = doc.floors
              .filter(f => f.archPageNumber === p || f.framingPageNumber === p)
              .map(f => {
                const role = f.archPageNumber === p ? 'plan' : 'framing';
                return `${f.label} (${role})`;
              })
              .join(', ');
            const isActive = activePage === p;
            return (
              <button
                key={p}
                onClick={() => setActivePage(p)}
                className="px-3 py-1.5 rounded-md text-sm font-medium border transition-colors"
                style={
                  isActive
                    ? { backgroundColor: GOLD, color: DARK, borderColor: GOLD }
                    : { backgroundColor: 'white', borderColor: '#E5E7EB', color: cal ? '#0F6F40' : '#6B7280' }
                }
                title={usedBy}
              >
                Page {p} {cal ? '✓' : '○'}
              </button>
            );
          })}
        </div>

        {activePage !== null && (
          <>
            <div className="flex items-center justify-between text-sm">
              <div>
                {doc.calibrations[String(activePage)] ? (
                  <span className="text-green-700">
                    <Check className="w-4 h-4 inline -mt-0.5 mr-1" />
                    Page {activePage} calibrated — {doc.calibrations[String(activePage)].realDistance} {doc.calibrations[String(activePage)].unit} per drawn line.
                  </span>
                ) : (
                  <span className="text-amber-700">Click two points on a known dimension line, then enter the real distance.</span>
                )}
              </div>
              {doc.calibrations[String(activePage)] && (
                <Button variant="outline" size="sm" onClick={() => clearCal(activePage)}>Re-calibrate</Button>
              )}
            </div>
            <LumberPdfStage
              pdfUrl={doc.pdf.url}
              pageNumber={activePage}
              pageCount={doc.pdf.pageCount}
              onPageChange={n => setActivePage(n)}
              calibration={doc.calibrations[String(activePage)] ?? null}
              onCalibrate={cal => onCalibrate(activePage, cal)}
              tool={doc.calibrations[String(activePage)] ? 'select' : 'calibrate'}
              toolColor="#ef4444"
              shapes={[]}
              height={600}
            />
          </>
        )}
      </div>
    </StepCard>
  );
}

// ─── Step 3: Legend ───────────────────────────────────────────────────────────

function LegendStep({ doc, update }: { doc: LumberTakeoff; update: (p: Partial<LumberTakeoff>) => void }) {
  const beams = Object.values(doc.legend.beams);
  const posts = Object.values(doc.legend.posts);

  const upsertBeam = (b: BeamSpec) => {
    update({ legend: { ...doc.legend, beams: { ...doc.legend.beams, [b.designation]: b } } });
  };
  const removeBeam = (designation: string) => {
    const { [designation]: _, ...rest } = doc.legend.beams;
    void _;
    update({ legend: { ...doc.legend, beams: rest } });
  };
  const upsertPost = (p: PostSpec) => {
    update({ legend: { ...doc.legend, posts: { ...doc.legend.posts, [p.designation]: p } } });
  };
  const removePost = (designation: string) => {
    const { [designation]: _, ...rest } = doc.legend.posts;
    void _;
    update({ legend: { ...doc.legend, posts: rest } });
  };

  const addBeam = () => {
    const nextNum = beams.length + 1;
    upsertBeam({ designation: `MB${nextNum}`, qty: 1, size: '', material: 'DF-L', rawSpec: '' });
  };
  const addPost = () => {
    const nextNum = posts.length + 1;
    upsertPost({ designation: `P${nextNum}`, kind: 'trimmer-count', trimmerCount: 1, rawSpec: '', material: 'DF-L #2' });
  };

  return (
    <StepCard
      icon={BookOpen}
      title="Legend"
      subtitle="Type the Beam Schedule and Post Schedule from your plan so we know what each MB# and P# means."
    >
      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: DARK }}>Beam Schedule</h3>
              <p className="text-xs text-gray-500">Look for "BEAM SCHEDULE" on the side of your framing plan (S1.x).</p>
            </div>
            <Button size="sm" variant="outline" onClick={addBeam}>
              <Plus className="w-3 h-3 mr-1" /> Add beam
            </Button>
          </div>
          {beams.length === 0 ? (
            <EmptyHint text="No beams yet. Click Add beam, then enter each row from your plan's Beam Schedule." />
          ) : (
            <div className="space-y-2">
              {beams.sort((a, b) => a.designation.localeCompare(b.designation, undefined, { numeric: true })).map(b => (
                <div key={b.designation} className="bg-white border rounded-md p-3" style={{ borderColor: '#E5E7EB' }}>
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <Input value={b.designation} onChange={e => upsertBeam({ ...b, designation: e.target.value })} className="col-span-2 font-mono text-sm" placeholder="MB1" />
                    <Input type="number" min={1} value={b.qty} onChange={e => upsertBeam({ ...b, qty: parseInt(e.target.value || '1') })} className="col-span-1 text-sm" />
                    <Input value={b.size} onChange={e => upsertBeam({ ...b, size: e.target.value, rawSpec: `(${b.qty}) ${e.target.value} ${b.material}` })} className="col-span-4 text-sm" placeholder='2x10 or 11-7/8" LVL' />
                    <Select value={b.material} onValueChange={(v: any) => upsertBeam({ ...b, material: v, rawSpec: `(${b.qty}) ${b.size} ${v}` })}>
                      <SelectTrigger className="col-span-4 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DF-L">DF-L #2 (dimensional)</SelectItem>
                        <SelectItem value="LVL">LVL</SelectItem>
                        <SelectItem value="Parallam">Parallam</SelectItem>
                        <SelectItem value="Glulam">Glulam</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="sm" onClick={() => removeBeam(b.designation)} className="col-span-1 text-gray-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: DARK }}>Post Schedule</h3>
              <p className="text-xs text-gray-500">P1–P4 are usually trimmer counts. P5+ are real posts (4×4, 6×6).</p>
            </div>
            <Button size="sm" variant="outline" onClick={addPost}>
              <Plus className="w-3 h-3 mr-1" /> Add post
            </Button>
          </div>
          {posts.length === 0 ? (
            <EmptyHint text="Optional for v1. Skip for now if you want." />
          ) : (
            <div className="space-y-2">
              {posts.sort((a, b) => a.designation.localeCompare(b.designation, undefined, { numeric: true })).map(p => (
                <div key={p.designation} className="bg-white border rounded-md p-3" style={{ borderColor: '#E5E7EB' }}>
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <Input value={p.designation} onChange={e => upsertPost({ ...p, designation: e.target.value })} className="col-span-2 font-mono text-sm" placeholder="P1" />
                    <Select value={p.kind} onValueChange={(v: any) => upsertPost({ ...p, kind: v })}>
                      <SelectTrigger className="col-span-3 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="trimmer-count">Trimmer count</SelectItem>
                        <SelectItem value="post">Discrete post</SelectItem>
                      </SelectContent>
                    </Select>
                    {p.kind === 'trimmer-count' ? (
                      <Input type="number" min={1} value={p.trimmerCount ?? 1} onChange={e => upsertPost({ ...p, trimmerCount: parseInt(e.target.value || '1') })} className="col-span-2 text-sm" />
                    ) : (
                      <Input value={p.postSize ?? ''} onChange={e => upsertPost({ ...p, postSize: e.target.value })} className="col-span-2 text-sm" placeholder="4x4" />
                    )}
                    <Input value={p.material ?? ''} onChange={e => upsertPost({ ...p, material: e.target.value })} className="col-span-4 text-sm" placeholder="DF-L #2" />
                    <Button variant="ghost" size="sm" onClick={() => removePost(p.designation)} className="col-span-1 text-gray-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </StepCard>
  );
}

// ─── Step 4: Walls ────────────────────────────────────────────────────────────

function WallsStep({ doc, update }: { doc: LumberTakeoff; update: (p: Partial<LumberTakeoff>) => void }) {
  const [activeFloorId, setActiveFloorId] = useState(doc.floors[0]?.id ?? '');
  useEffect(() => {
    if (!doc.floors.find(f => f.id === activeFloorId)) {
      setActiveFloorId(doc.floors[0]?.id ?? '');
    }
  }, [doc.floors, activeFloorId]);

  const activeFloor = doc.floors.find(f => f.id === activeFloorId);
  const pageNumber = activeFloor?.archPageNumber;
  const calibration = pageNumber ? doc.calibrations[String(pageNumber)] : undefined;
  const canDraw = !!(doc.pdf && pageNumber && calibration);

  // Per-floor draw mode controls
  const [kind, setKind] = useState<WallKind>('exterior-bearing');
  const [studSize, setStudSize] = useState<StudSize>(doc.defaults.extStudSize);
  const [heightFt, setHeightFt] = useState<number>(doc.defaults.wallHeightFt);
  const [sheathing, setSheathing] = useState<Sheathing>(doc.defaults.extSheathing);
  const [spacing, setSpacing] = useState<16 | 24>(doc.defaults.studSpacing);

  // Whenever kind changes, reset defaults sensibly
  useEffect(() => {
    if (kind === 'exterior-bearing') {
      setStudSize(doc.defaults.extStudSize);
      setSheathing(doc.defaults.extSheathing);
    } else if (kind === 'interior-bearing') {
      setStudSize(doc.defaults.intBearingStudSize);
      setSheathing('none');
    } else {
      setStudSize(doc.defaults.intNonBearingStudSize);
      setSheathing('none');
    }
  }, [kind, doc.defaults]);

  const wallsOnFloor = doc.walls.filter(w => w.floorId === activeFloorId);

  const addWallFromShape = (points: { x: number; y: number }[]) => {
    if (!pageNumber) return;
    const id = `wr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const source: LengthSource = { type: 'pdf-linear', pageNumber, points };
    const run: WallRun = {
      id,
      floorId: activeFloorId,
      kind,
      studSize,
      heightFt,
      sheathing,
      spacingInches: spacing,
      source,
      lengthFtCached: calibration ? resolveLengthFt(source, doc.calibrations) : 0,
    };
    update({ walls: [...doc.walls, run] });
  };

  const removeWall = (id: string) => update({ walls: doc.walls.filter(w => w.id !== id) });

  // For LumberPdfStage: convert walls on this page → StageShape[]
  const stageShapes: StageShape[] = wallsOnFloor
    .filter(w => w.source.type === 'pdf-linear' && w.source.pageNumber === pageNumber)
    .map(w => {
      const source = w.source as Extract<LengthSource, { type: 'pdf-linear' }>;
      const len = resolveLengthFt(w.source, doc.calibrations);
      return {
        id: w.id,
        type: 'linear' as const,
        points: source.points,
        label: `${WALL_KIND_LABELS[w.kind]} ${len.toFixed(1)} ft`,
        color: WALL_KIND_COLORS[w.kind],
      };
    });

  return (
    <StepCard
      icon={Layers}
      title="Walls"
      subtitle={canDraw ? 'Draw each wall on the plan, tagged by the active wall type. Use the toolbar to switch types.' : 'Enter linear feet per floor.'}
    >
      <FloorTabs doc={doc} activeId={activeFloorId} onChange={setActiveFloorId} />

      {canDraw ? (
        <div className="mt-4 space-y-3">
          {/* Draw toolbar */}
          <div className="bg-white border rounded-lg p-3" style={{ borderColor: '#E5E7EB' }}>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label className="text-[10px] text-gray-500 uppercase tracking-wider">Wall type</Label>
                <div className="flex gap-1 mt-1">
                  {(Object.keys(WALL_KIND_LABELS) as WallKind[]).map(k => (
                    <button
                      key={k}
                      onClick={() => setKind(k)}
                      className="px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors"
                      style={
                        kind === k
                          ? { backgroundColor: WALL_KIND_COLORS[k], color: 'white', borderColor: WALL_KIND_COLORS[k] }
                          : { backgroundColor: 'white', color: '#6B7280', borderColor: '#E5E7EB' }
                      }
                    >
                      {WALL_KIND_LABELS[k]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-[10px] text-gray-500 uppercase tracking-wider">Stud</Label>
                <Select value={studSize} onValueChange={(v: any) => setStudSize(v)}>
                  <SelectTrigger className="h-8 w-24 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2x4">2×4</SelectItem>
                    <SelectItem value="2x6">2×6</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] text-gray-500 uppercase tracking-wider">Height (ft)</Label>
                <Input type="number" min={6} max={20} step={0.5} value={heightFt} onChange={e => setHeightFt(parseFloat(e.target.value || '0'))} className="h-8 w-24 text-sm" />
              </div>
              <div>
                <Label className="text-[10px] text-gray-500 uppercase tracking-wider">Spacing</Label>
                <Select value={String(spacing)} onValueChange={(v: any) => setSpacing(parseInt(v) as 16 | 24)}>
                  <SelectTrigger className="h-8 w-24 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="16">16″</SelectItem>
                    <SelectItem value="24">24″</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] text-gray-500 uppercase tracking-wider">Sheathing</Label>
                <Select value={sheathing} onValueChange={(v: any) => setSheathing(v)}>
                  <SelectTrigger className="h-8 w-32 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="OSB-7/16">OSB 7/16″</SelectItem>
                    <SelectItem value="OSB-1/2">OSB 1/2″</SelectItem>
                    <SelectItem value="OSB-5/8">OSB 5/8″</SelectItem>
                    <SelectItem value="Zip-7/16">Zip 7/16″</SelectItem>
                    <SelectItem value="Zip-1/2">Zip 1/2″</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
            <LumberPdfStage
              pdfUrl={doc.pdf!.url}
              pageNumber={pageNumber!}
              pageCount={doc.pdf!.pageCount}
              calibration={calibration ?? null}
              tool="linear"
              toolColor={WALL_KIND_COLORS[kind]}
              shapes={stageShapes}
              onShapeComplete={s => { if (s.type === 'linear') addWallFromShape(s.points); }}
              height={620}
            />
            <WallSidebar
              wallsOnFloor={wallsOnFloor}
              doc={doc}
              onRemove={removeWall}
            />
          </div>
        </div>
      ) : (
        <NumericWallsFallback
          floor={activeFloor!}
          doc={doc}
          update={update}
        />
      )}

      {!doc.pdf && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-900">
          No plan PDF uploaded — using numeric entry. Go back to <strong>Setup</strong> to upload a plan for drawing mode.
        </div>
      )}
      {doc.pdf && !pageNumber && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-900">
          No floor plan page assigned to this floor — using numeric entry. Go to <strong>Setup</strong> and pick a page.
        </div>
      )}
      {doc.pdf && pageNumber && !calibration && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-900">
          Page {pageNumber} isn't calibrated yet — using numeric entry. Go to <strong>Scale</strong> to calibrate.
        </div>
      )}
    </StepCard>
  );
}

function WallSidebar({
  wallsOnFloor, doc, onRemove,
}: {
  wallsOnFloor: WallRun[];
  doc: LumberTakeoff;
  onRemove: (id: string) => void;
}) {
  const grouped = useMemo(() => {
    const buckets: Record<WallKind, WallRun[]> = {
      'exterior-bearing': [],
      'interior-bearing': [],
      'interior-non-bearing': [],
    };
    for (const w of wallsOnFloor) buckets[w.kind].push(w);
    return buckets;
  }, [wallsOnFloor]);

  const totals = useMemo(() => {
    const t: Record<WallKind, number> = {
      'exterior-bearing': 0,
      'interior-bearing': 0,
      'interior-non-bearing': 0,
    };
    for (const w of wallsOnFloor) t[w.kind] += resolveLengthFt(w.source, doc.calibrations);
    return t;
  }, [wallsOnFloor, doc.calibrations]);

  return (
    <div className="bg-white border rounded-lg p-3 space-y-3 overflow-y-auto max-h-[620px]" style={{ borderColor: '#E5E7EB' }}>
      <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: DARK }}>Walls on this floor</h3>
      {(Object.keys(WALL_KIND_LABELS) as WallKind[]).map(k => (
        <div key={k}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: WALL_KIND_COLORS[k] }} />
              <span className="text-xs font-medium" style={{ color: DARK }}>{WALL_KIND_LABELS[k]}</span>
            </div>
            <span className="text-xs font-mono text-gray-600">{totals[k].toFixed(1)} ft</span>
          </div>
          {grouped[k].length === 0 ? (
            <p className="text-[10px] text-gray-400 italic ml-4">none</p>
          ) : (
            <ul className="space-y-0.5 ml-4">
              {grouped[k].map(w => (
                <li key={w.id} className="flex items-center justify-between text-xs text-gray-600 group">
                  <span>{resolveLengthFt(w.source, doc.calibrations).toFixed(1)} ft × {w.heightFt}′</span>
                  <button onClick={() => onRemove(w.id)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600">
                    <X className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function NumericWallsFallback({
  floor, doc, update,
}: {
  floor: FloorDef;
  doc: LumberTakeoff;
  update: (p: Partial<LumberTakeoff>) => void;
}) {
  const addWallRun = (kind: WallKind) => {
    const studSize: StudSize = kind === 'interior-non-bearing'
      ? doc.defaults.intNonBearingStudSize
      : kind === 'exterior-bearing' ? doc.defaults.extStudSize : doc.defaults.intBearingStudSize;
    const sheathing: Sheathing = kind === 'exterior-bearing' ? doc.defaults.extSheathing : 'none';
    const id = `wr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const run: WallRun = {
      id, floorId: floor.id, kind, studSize,
      heightFt: doc.defaults.wallHeightFt,
      sheathing, spacingInches: doc.defaults.studSpacing,
      source: { type: 'numeric', lengthFt: 0 },
      lengthFtCached: 0,
    };
    update({ walls: [...doc.walls, run] });
  };
  const updateWall = (id: string, patch: Partial<WallRun>) => {
    update({
      walls: doc.walls.map(w => {
        if (w.id !== id) return w;
        const next = { ...w, ...patch };
        if (patch.source && patch.source.type === 'numeric') next.lengthFtCached = patch.source.lengthFt;
        return next;
      }),
    });
  };
  const removeWall = (id: string) => update({ walls: doc.walls.filter(w => w.id !== id) });

  const runs = doc.walls.filter(w => w.floorId === floor.id);
  const groups: { kind: WallKind; title: string; blurb: string }[] = [
    { kind: 'exterior-bearing',     title: 'Exterior bearing', blurb: '2×6 16″ o.c. with OSB 1/2″ sheathing by default.' },
    { kind: 'interior-bearing',     title: 'Interior bearing', blurb: 'Plan default is 2×6 16″ o.c. (no sheathing).' },
    { kind: 'interior-non-bearing', title: 'Interior non-bearing', blurb: 'Typically 2×4 16″ o.c. — partition walls.' },
  ];

  return (
    <div className="mt-4 space-y-4">
      {groups.map(g => {
        const list = runs.filter(w => w.kind === g.kind);
        return (
          <div key={g.kind}>
            <div className="flex items-center justify-between mb-1.5">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#6B7280' }}>{g.title}</h4>
                <p className="text-xs text-gray-500">{g.blurb}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => addWallRun(g.kind)}>
                <Plus className="w-3 h-3 mr-1" /> Add run
              </Button>
            </div>
            {list.length > 0 && (
              <div className="space-y-1.5">
                {list.map(w => (
                  <div key={w.id} className="bg-gray-50 border rounded p-2.5" style={{ borderColor: '#E5E7EB' }}>
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-3">
                        <Label className="text-[10px] text-gray-500 uppercase tracking-wider">Linear feet</Label>
                        <Input
                          type="number" min={0} step={0.5}
                          value={w.source.type === 'numeric' ? w.source.lengthFt : 0}
                          onChange={e => updateWall(w.id, { source: { type: 'numeric', lengthFt: parseFloat(e.target.value || '0') } })}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-[10px] text-gray-500 uppercase tracking-wider">Stud</Label>
                        <Select value={w.studSize} onValueChange={(v: any) => updateWall(w.id, { studSize: v })}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="2x4">2×4</SelectItem>
                            <SelectItem value="2x6">2×6</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2">
                        <Label className="text-[10px] text-gray-500 uppercase tracking-wider">Height (ft)</Label>
                        <Input type="number" min={6} max={20} step={0.5} value={w.heightFt} onChange={e => updateWall(w.id, { heightFt: parseFloat(e.target.value || '0') })} className="h-8 text-sm" />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-[10px] text-gray-500 uppercase tracking-wider">Spacing</Label>
                        <Select value={String(w.spacingInches)} onValueChange={(v: any) => updateWall(w.id, { spacingInches: parseInt(v) as 16 | 24 })}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="16">16″ o.c.</SelectItem>
                            <SelectItem value="24">24″ o.c.</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2">
                        <Label className="text-[10px] text-gray-500 uppercase tracking-wider">Sheathing</Label>
                        <Select value={w.sheathing} onValueChange={(v: any) => updateWall(w.id, { sheathing: v })}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="OSB-7/16">OSB 7/16″</SelectItem>
                            <SelectItem value="OSB-1/2">OSB 1/2″</SelectItem>
                            <SelectItem value="OSB-5/8">OSB 5/8″</SelectItem>
                            <SelectItem value="Zip-7/16">Zip 7/16″</SelectItem>
                            <SelectItem value="Zip-1/2">Zip 1/2″</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-1 flex justify-end pt-4">
                        <Button variant="ghost" size="sm" onClick={() => removeWall(w.id)} className="text-gray-400 hover:text-red-600 h-8">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 5: Headers ──────────────────────────────────────────────────────────

function HeadersStep({ doc, update }: { doc: LumberTakeoff; update: (p: Partial<LumberTakeoff>) => void }) {
  const [activeFloorId, setActiveFloorId] = useState(doc.floors[0]?.id ?? '');
  useEffect(() => {
    if (!doc.floors.find(f => f.id === activeFloorId)) {
      setActiveFloorId(doc.floors[0]?.id ?? '');
    }
  }, [doc.floors, activeFloorId]);

  const activeFloor = doc.floors.find(f => f.id === activeFloorId);
  const pageNumber = activeFloor?.framingPageNumber;
  const calibration = pageNumber ? doc.calibrations[String(pageNumber)] : undefined;
  const canDraw = !!(doc.pdf && pageNumber && calibration);

  const beamOptions = Object.values(doc.legend.beams).sort((a, b) =>
    a.designation.localeCompare(b.designation, undefined, { numeric: true })
  );

  const [activeBeam, setActiveBeam] = useState<string>(beamOptions[0]?.designation ?? '');
  useEffect(() => {
    if (!activeBeam && beamOptions.length > 0) setActiveBeam(beamOptions[0].designation);
  }, [beamOptions, activeBeam]);

  const addHeaderFromShape = (points: { x: number; y: number }[]) => {
    if (!pageNumber || !activeBeam) return;
    const id = `hd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const source: LengthSource = { type: 'pdf-linear', pageNumber, points };
    const h: HeaderRun = {
      id,
      floorId: activeFloorId,
      beamDesignation: activeBeam,
      source,
      lengthFtCached: resolveLengthFt(source, doc.calibrations),
    };
    update({ headers: [...doc.headers, h] });
  };

  const updateHeader = (id: string, patch: Partial<HeaderRun>) => {
    update({
      headers: doc.headers.map(h => {
        if (h.id !== id) return h;
        const next = { ...h, ...patch };
        if (patch.source && patch.source.type === 'numeric') next.lengthFtCached = patch.source.lengthFt;
        return next;
      }),
    });
  };

  const removeHeader = (id: string) => update({ headers: doc.headers.filter(h => h.id !== id) });

  const headersOnFloor = doc.headers.filter(h => h.floorId === activeFloorId);

  if (beamOptions.length === 0) {
    return (
      <StepCard
        icon={Anchor}
        title="Headers"
        subtitle="Add beam types in the Legend step first."
      >
        <EmptyHint text="No Beam Schedule defined yet. Go back to Legend and add at least one beam." />
      </StepCard>
    );
  }

  const stageShapes: StageShape[] = headersOnFloor
    .filter(h => h.source.type === 'pdf-linear' && (h.source as any).pageNumber === pageNumber)
    .map(h => {
      const source = h.source as Extract<LengthSource, { type: 'pdf-linear' }>;
      const len = resolveLengthFt(h.source, doc.calibrations);
      return {
        id: h.id,
        type: 'linear' as const,
        points: source.points,
        label: `${h.beamDesignation} ${len.toFixed(1)} ft`,
        color: '#dc2626',
      };
    });

  return (
    <StepCard
      icon={Anchor}
      title="Headers"
      subtitle={canDraw ? 'Pick an MB# from the toolbar, then draw each header on the framing plan.' : 'For each header, pick the MB# and enter its length.'}
    >
      <FloorTabs doc={doc} activeId={activeFloorId} onChange={setActiveFloorId} />

      {canDraw ? (
        <div className="mt-4 space-y-3">
          {/* Beam picker toolbar */}
          <div className="bg-white border rounded-lg p-3" style={{ borderColor: '#E5E7EB' }}>
            <Label className="text-[10px] text-gray-500 uppercase tracking-wider">Active beam</Label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {beamOptions.map(b => (
                <button
                  key={b.designation}
                  onClick={() => setActiveBeam(b.designation)}
                  className="px-2.5 py-1 rounded-md text-xs font-medium border transition-colors"
                  style={
                    activeBeam === b.designation
                      ? { backgroundColor: '#dc2626', color: 'white', borderColor: '#dc2626' }
                      : { backgroundColor: 'white', color: '#6B7280', borderColor: '#E5E7EB' }
                  }
                  title={b.rawSpec}
                >
                  {b.designation}
                </button>
              ))}
            </div>
            {activeBeam && (() => {
              const b = doc.legend.beams[activeBeam];
              return b ? <p className="text-xs text-gray-500 mt-2">{b.rawSpec || `(${b.qty}) ${b.size} ${b.material}`}</p> : null;
            })()}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
            <LumberPdfStage
              pdfUrl={doc.pdf!.url}
              pageNumber={pageNumber!}
              pageCount={doc.pdf!.pageCount}
              calibration={calibration ?? null}
              tool="linear"
              toolColor="#dc2626"
              shapes={stageShapes}
              onShapeComplete={s => { if (s.type === 'linear') addHeaderFromShape(s.points); }}
              height={620}
            />
            <HeaderSidebar
              headersOnFloor={headersOnFloor}
              doc={doc}
              onRemove={removeHeader}
            />
          </div>
        </div>
      ) : (
        <NumericHeadersFallback
          floor={activeFloor!}
          doc={doc}
          beamOptions={beamOptions}
          updateHeader={updateHeader}
          removeHeader={removeHeader}
          update={update}
        />
      )}

      {doc.pdf && !pageNumber && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-900">
          No framing plan page assigned to this floor — using numeric entry. Pick one in <strong>Setup</strong>.
        </div>
      )}
      {doc.pdf && pageNumber && !calibration && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-900">
          Page {pageNumber} isn't calibrated — using numeric entry. Calibrate in <strong>Scale</strong> step.
        </div>
      )}
    </StepCard>
  );
}

function HeaderSidebar({
  headersOnFloor, doc, onRemove,
}: {
  headersOnFloor: HeaderRun[];
  doc: LumberTakeoff;
  onRemove: (id: string) => void;
}) {
  const byBeam = useMemo(() => {
    const m = new Map<string, HeaderRun[]>();
    for (const h of headersOnFloor) {
      const arr = m.get(h.beamDesignation) ?? [];
      arr.push(h);
      m.set(h.beamDesignation, arr);
    }
    return m;
  }, [headersOnFloor]);

  return (
    <div className="bg-white border rounded-lg p-3 space-y-3 overflow-y-auto max-h-[620px]" style={{ borderColor: '#E5E7EB' }}>
      <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: DARK }}>Headers on this floor</h3>
      {byBeam.size === 0 && (
        <p className="text-xs text-gray-400 italic">No headers drawn yet.</p>
      )}
      {Array.from(byBeam.entries()).sort(([a], [b]) =>
        a.localeCompare(b, undefined, { numeric: true })
      ).map(([designation, list]) => {
        const beam = doc.legend.beams[designation];
        return (
          <div key={designation}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium" style={{ color: DARK }}>{designation}</span>
              <span className="text-xs text-gray-500">{list.length} × · {list.reduce((s, h) => s + resolveLengthFt(h.source, doc.calibrations), 0).toFixed(1)} ft</span>
            </div>
            {beam && <p className="text-[10px] text-gray-500 mb-1 truncate">{beam.rawSpec}</p>}
            <ul className="ml-3 space-y-0.5">
              {list.map(h => (
                <li key={h.id} className="flex items-center justify-between text-xs text-gray-600 group">
                  <span>{resolveLengthFt(h.source, doc.calibrations).toFixed(1)} ft</span>
                  <button onClick={() => onRemove(h.id)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600">
                    <X className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function NumericHeadersFallback({
  floor, doc, beamOptions, updateHeader, removeHeader, update,
}: {
  floor: FloorDef;
  doc: LumberTakeoff;
  beamOptions: BeamSpec[];
  updateHeader: (id: string, p: Partial<HeaderRun>) => void;
  removeHeader: (id: string) => void;
  update: (p: Partial<LumberTakeoff>) => void;
}) {
  const headers = doc.headers.filter(h => h.floorId === floor.id);

  const addHeader = () => {
    const first = beamOptions[0]?.designation ?? '';
    const id = `hd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const h: HeaderRun = {
      id, floorId: floor.id,
      beamDesignation: first,
      source: { type: 'numeric', lengthFt: 6 },
      lengthFtCached: 6,
    };
    update({ headers: [...doc.headers, h] });
  };

  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#6B7280' }}>Headers</h4>
        <Button size="sm" variant="outline" onClick={addHeader}>
          <Plus className="w-3 h-3 mr-1" /> Add header
        </Button>
      </div>
      {headers.length === 0 ? (
        <p className="text-xs text-gray-500 text-center py-3">No headers on this floor yet.</p>
      ) : (
        headers.map(h => {
          const beam = doc.legend.beams[h.beamDesignation];
          return (
            <div key={h.id} className="bg-gray-50 border rounded p-2.5" style={{ borderColor: '#E5E7EB' }}>
              <div className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-3">
                  <Label className="text-[10px] text-gray-500 uppercase tracking-wider">Beam</Label>
                  <Select value={h.beamDesignation} onValueChange={(v) => updateHeader(h.id, { beamDesignation: v })}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {beamOptions.map(b => (
                        <SelectItem key={b.designation} value={b.designation}>{b.designation}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-5 text-xs text-gray-600 pt-4 truncate">
                  {beam ? (beam.rawSpec || `(${beam.qty}) ${beam.size} ${beam.material}`) : '—'}
                </div>
                <div className="col-span-3">
                  <Label className="text-[10px] text-gray-500 uppercase tracking-wider">Length (ft)</Label>
                  <Input
                    type="number" min={0} step={0.25}
                    value={h.source.type === 'numeric' ? h.source.lengthFt : resolveLengthFt(h.source, doc.calibrations)}
                    onChange={e => updateHeader(h.id, { source: { type: 'numeric', lengthFt: parseFloat(e.target.value || '0') } })}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="col-span-1 flex justify-end pt-4">
                  <Button variant="ghost" size="sm" onClick={() => removeHeader(h.id)} className="text-gray-400 hover:text-red-600 h-8">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ─── Step 6: Subfloor ─────────────────────────────────────────────────────────

function SubfloorStep({ doc, update }: { doc: LumberTakeoff; update: (p: Partial<LumberTakeoff>) => void }) {
  const [activeFloorId, setActiveFloorId] = useState(doc.floors[0]?.id ?? '');
  useEffect(() => {
    if (!doc.floors.find(f => f.id === activeFloorId)) {
      setActiveFloorId(doc.floors[0]?.id ?? '');
    }
  }, [doc.floors, activeFloorId]);

  const activeFloor = doc.floors.find(f => f.id === activeFloorId);
  const pageNumber = activeFloor?.archPageNumber;
  const calibration = pageNumber ? doc.calibrations[String(pageNumber)] : undefined;
  const canDraw = !!(doc.pdf && pageNumber && calibration);

  const subOnFloor = doc.subfloors.filter(s => s.floorId === activeFloorId);

  const addSubfloorPolygon = (points: { x: number; y: number }[]) => {
    if (!pageNumber) return;
    const source: AreaSource = { type: 'pdf-polygon', pageNumber, points };
    const id = `sf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const area = resolveAreaSqft(source, doc.calibrations);
    update({
      subfloors: [
        ...doc.subfloors,
        {
          id,
          floorId: activeFloorId,
          product: 'AdvanTech 3/4 T&G',
          source,
          areaSqftCached: area,
        },
      ],
    });
  };

  const removeSubfloor = (id: string) => update({ subfloors: doc.subfloors.filter(s => s.id !== id) });

  const updateProduct = (id: string, product: SubfloorProduct) => {
    update({ subfloors: doc.subfloors.map(s => s.id === id ? { ...s, product } : s) });
  };

  const stageShapes: StageShape[] = subOnFloor
    .filter(s => s.source.type === 'pdf-polygon' && (s.source as any).pageNumber === pageNumber)
    .map(s => {
      const source = s.source as Extract<AreaSource, { type: 'pdf-polygon' }>;
      const area = resolveAreaSqft(s.source, doc.calibrations);
      return {
        id: s.id,
        type: 'polygon' as const,
        points: source.points,
        label: `${area.toFixed(0)} sf`,
        color: '#10b981',
      };
    });

  return (
    <StepCard
      icon={Square}
      title="Subfloor"
      subtitle={canDraw ? 'Outline the floor area for each floor — click each corner, double-click or press Enter to close.' : 'Enter the floor area for each floor.'}
    >
      <FloorTabs doc={doc} activeId={activeFloorId} onChange={setActiveFloorId} />

      {canDraw ? (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
            <LumberPdfStage
              pdfUrl={doc.pdf!.url}
              pageNumber={pageNumber!}
              pageCount={doc.pdf!.pageCount}
              calibration={calibration ?? null}
              tool="polygon"
              toolColor="#10b981"
              shapes={stageShapes}
              onShapeComplete={s => { if (s.type === 'polygon') addSubfloorPolygon(s.points); }}
              height={620}
            />
            <div className="bg-white border rounded-lg p-3 space-y-3" style={{ borderColor: '#E5E7EB' }}>
              <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: DARK }}>Areas on this floor</h3>
              {subOnFloor.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No areas drawn yet.</p>
              ) : (
                subOnFloor.map(s => {
                  const area = resolveAreaSqft(s.source, doc.calibrations);
                  const sheets = Math.ceil((area * 1.10) / 32);
                  return (
                    <div key={s.id} className="border rounded p-2" style={{ borderColor: '#E5E7EB' }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{area.toFixed(0)} sf</span>
                        <button onClick={() => removeSubfloor(s.id)} className="text-gray-400 hover:text-red-600">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <Select value={s.product} onValueChange={(v: any) => updateProduct(s.id, v)}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AdvanTech 3/4 T&G">AdvanTech 3/4″ T&G</SelectItem>
                          <SelectItem value="OSB 3/4 T&G">OSB 3/4″ T&G</SelectItem>
                          <SelectItem value="Plywood 3/4 T&G">Plywood 3/4″ T&G</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-gray-500 mt-1">~{sheets} sheets (incl. 10% waste)</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : (
        <NumericSubfloorFallback floor={activeFloor!} doc={doc} update={update} />
      )}
    </StepCard>
  );
}

function NumericSubfloorFallback({
  floor, doc, update,
}: {
  floor: FloorDef;
  doc: LumberTakeoff;
  update: (p: Partial<LumberTakeoff>) => void;
}) {
  const sub = doc.subfloors.find(s => s.floorId === floor.id);
  const product = sub?.product ?? 'AdvanTech 3/4 T&G';
  const area = sub ? resolveAreaSqft(sub.source, doc.calibrations) : 0;
  const sheets = Math.ceil((area * 1.10) / 32);

  const upsertSubfloor = (areaSqft: number) => {
    if (sub) {
      update({
        subfloors: doc.subfloors.map(s =>
          s.floorId === floor.id
            ? { ...s, source: { type: 'numeric', areaSqft }, areaSqftCached: areaSqft }
            : s
        ),
      });
    } else {
      const id = `sf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      update({
        subfloors: [...doc.subfloors, {
          id, floorId: floor.id, product: 'AdvanTech 3/4 T&G',
          source: { type: 'numeric', areaSqft }, areaSqftCached: areaSqft,
        }],
      });
    }
  };

  const updateProduct = (product: SubfloorProduct) => {
    if (!sub) {
      const id = `sf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      update({ subfloors: [...doc.subfloors, { id, floorId: floor.id, product, source: { type: 'numeric', areaSqft: 0 }, areaSqftCached: 0 }] });
    } else {
      update({ subfloors: doc.subfloors.map(s => s.id === sub.id ? { ...s, product } : s) });
    }
  };

  return (
    <div className="mt-4 bg-white border rounded-lg p-4" style={{ borderColor: '#E5E7EB' }}>
      {area > 0 && (
        <Badge variant="outline" className="text-xs mb-2 float-right">
          {sheets} sheet{sheets === 1 ? '' : 's'} (incl. 10% waste)
        </Badge>
      )}
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-5">
          <Label className="text-xs">Product</Label>
          <Select value={product} onValueChange={(v: any) => updateProduct(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="AdvanTech 3/4 T&G">AdvanTech 3/4″ T&G</SelectItem>
              <SelectItem value="OSB 3/4 T&G">OSB 3/4″ T&G</SelectItem>
              <SelectItem value="Plywood 3/4 T&G">Plywood 3/4″ T&G</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-7">
          <Label className="text-xs">Floor area (sf)</Label>
          <Input type="number" min={0} step={10} value={area || ''} onChange={e => upsertSubfloor(parseFloat(e.target.value || '0'))} placeholder="e.g., 1850" />
        </div>
      </div>
    </div>
  );
}

// ─── Step 7: Results ──────────────────────────────────────────────────────────

function ResultsStep({ doc, update }: { doc: LumberTakeoff; update: (p: Partial<LumberTakeoff>) => void }) {
  const result = useMemo(() => calculate(doc), [doc]);
  const { toast } = useToast();
  const [showFloors, setShowFloors] = useState(false);

  const exportCsv = () => {
    const header = ['Category', 'Description', 'Qty', 'UoM', 'Notes'];
    const rows = result.lines.map(l => [l.category, l.description, String(l.qty), l.uom, l.notes ?? '']);
    const csv = [header, ...rows].map(r => r.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.name.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'CSV downloaded' });
  };

  const markFinal = () => {
    update({ status: 'final', result });
    toast({ title: 'Takeoff marked final' });
  };

  const grouped = useMemo(() => {
    const order: Array<typeof result.lines[number]['category']> = ['studs', 'plates', 'sheathing', 'headers', 'subfloor', 'posts', 'other'];
    const map = new Map<string, typeof result.lines>();
    for (const l of result.lines) {
      const arr = map.get(l.category) ?? [];
      arr.push(l);
      map.set(l.category, arr);
    }
    return order.filter(c => map.has(c)).map(c => ({ category: c, lines: map.get(c)! }));
  }, [result]);

  return (
    <StepCard
      icon={ClipboardList}
      title="Lumber list"
      subtitle="Generated from your inputs. Adjust earlier steps if a count looks off — list recalculates instantly."
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Line items"  value={result.summary.totalLines} />
          <Stat label="Studs"       value={result.summary.totalStuds} />
          <Stat label="Sheets"      value={result.summary.totalSheets} />
          <Stat label="LF (plates)" value={Math.round(result.summary.totalLinearFeet)} />
        </div>

        {result.warnings.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-amber-700" />
              <span className="text-sm font-medium text-amber-900">Heads up</span>
            </div>
            <ul className="text-xs text-amber-900 space-y-0.5 ml-6 list-disc">
              {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}

        <div className="flex items-center justify-between flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowFloors(s => !s)}>
            {showFloors ? 'Hide per-floor' : 'Show per-floor'}
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="w-3 h-3 mr-1" /> Export CSV
            </Button>
            <Button
              size="sm"
              onClick={markFinal}
              style={{ backgroundColor: GOLD, color: DARK }}
              className="hover:opacity-90"
              disabled={doc.status === 'final'}
            >
              {doc.status === 'final' ? 'Marked final' : 'Mark as final'}
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {grouped.map(g => (
            <div key={g.category} className="bg-white border rounded-lg overflow-hidden" style={{ borderColor: '#E5E7EB' }}>
              <div className="px-4 py-2 border-b flex items-center justify-between" style={{ backgroundColor: 'rgba(201,169,110,0.05)', borderColor: '#E5E7EB' }}>
                <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: DARK }}>{categoryLabel(g.category)}</h3>
                <Badge variant="outline" className="text-xs">{g.lines.length} line{g.lines.length === 1 ? '' : 's'}</Badge>
              </div>
              <div>
                {g.lines.map((l, i) => (
                  <div key={i} className="px-4 py-3 border-b last:border-0 hover:bg-gray-50" style={{ borderColor: '#F3F4F6' }}>
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium" style={{ color: DARK }}>{l.description}</p>
                        {l.notes && <p className="text-xs text-gray-500 mt-0.5">{l.notes}</p>}
                        {showFloors && l.byFloor && Object.keys(l.byFloor).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {Object.entries(l.byFloor).map(([fid, v]) => {
                              const fl = doc.floors.find(f => f.id === fid);
                              return (
                                <span key={fid} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
                                  {fl?.label ?? fid}: {v}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-base font-semibold" style={{ color: DARK }}>{l.qty}</span>
                        <span className="text-xs text-gray-500 ml-1">{l.uom}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {grouped.length === 0 && (
            <EmptyHint text="No materials yet. Go back to earlier steps and add wall runs, headers, or subfloor areas." />
          )}
        </div>
      </div>
    </StepCard>
  );
}

// ─── Shared bits ──────────────────────────────────────────────────────────────

function FloorTabs({
  doc, activeId, onChange,
}: {
  doc: LumberTakeoff;
  activeId: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {doc.floors.map(f => (
        <button
          key={f.id}
          onClick={() => onChange(f.id)}
          className="px-3 py-1.5 rounded-md text-sm font-medium border transition-colors"
          style={
            activeId === f.id
              ? { backgroundColor: GOLD, color: DARK, borderColor: GOLD }
              : { backgroundColor: 'white', color: '#6B7280', borderColor: '#E5E7EB' }
          }
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

function StepCard({ icon: Icon, title, subtitle, children }: { icon: any; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(201,169,110,0.12)' }}>
            <Icon className="w-5 h-5" style={{ color: GOLD }} />
          </div>
          <div>
            <h2 className="text-xl font-heading font-semibold" style={{ color: DARK }}>{title}</h2>
            {subtitle && <p className="text-sm text-gray-600 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function TipsPanel({ step }: { step: WizardStep }) {
  const tips: Record<WizardStep, { title: string; body: string; bullets?: string[] }> = {
    setup: {
      title: 'Quick tip',
      body: 'Upload your plan PDF for draw-on-plan mode. If you skip the PDF, you can still type LF/sf manually in later steps.',
    },
    scale: {
      title: 'Pick the longest dimension',
      body: 'Tap two ends of a known dimension line (longer = more accurate). Avoid short labels — they amplify pixel error.',
      bullets: [
        'Each page that\'s used by any floor needs its own calibration',
        'Re-calibrate anytime; all measurements on the page re-resolve live',
      ],
    },
    legend: {
      title: 'Where to look on your plan',
      body: 'On Redwood Engineering plans, the schedules sit on the right edge of S1.1. Beam Schedule lists MB1, MB2… each with size and material.',
      bullets: ['MB# — designation', 'Size — e.g., (3) 11-7/8" LVL', 'Material — DF-L, LVL, Parallam, Glulam'],
    },
    walls: {
      title: 'Per-floor + per-type',
      body: 'Switch floor tabs at top. Use the toolbar to pick the wall type, then draw each wall line. Click start, click end. Esc to cancel.',
      bullets: ['Color-coded per type', 'Sidebar shows totals + per-wall list', 'Numeric entry kicks in if the floor has no plan page'],
    },
    headers: {
      title: 'Each header = one line',
      body: 'Pick the MB# in the toolbar, draw the header span. Each draw stacks under that MB# in the sidebar.',
    },
    subfloor: {
      title: 'AdvanTech math',
      body: 'Polygon tool: click each corner of the floor, double-click or Enter to close. AdvanTech 3/4″ T&G = 32 sf/sheet + 10% waste by default.',
    },
    results: {
      title: 'Sanity check before ordering',
      body: 'Hand the CSV to your lumber rep. Numbers off? Edit any step — the list recalculates instantly.',
    },
  };
  const t = tips[step];
  return (
    <div className="lg:sticky lg:top-4 lg:self-start">
      <Card className="border-0" style={{ backgroundColor: 'rgba(201,169,110,0.06)' }}>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1.5">
            <Lightbulb className="w-4 h-4" style={{ color: GOLD }} />
            <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: DARK, letterSpacing: '0.1em' }}>{t.title}</h3>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">{t.body}</p>
          {t.bullets && (
            <ul className="mt-2 space-y-1 text-xs text-gray-600">
              {t.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span style={{ color: GOLD }}>•</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="bg-gray-50 border border-dashed rounded-md p-4 text-center" style={{ borderColor: '#D1D5DB' }}>
      <Info className="w-4 h-4 mx-auto mb-1 text-gray-400" />
      <p className="text-xs text-gray-500">{text}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border rounded-md p-3" style={{ borderColor: '#E5E7EB' }}>
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className="text-xl font-semibold mt-0.5" style={{ color: DARK }}>{value}</p>
    </div>
  );
}

function categoryLabel(c: string): string {
  switch (c) {
    case 'studs': return 'Studs';
    case 'plates': return 'Plates';
    case 'sheathing': return 'Wall sheathing';
    case 'headers': return 'Headers / beams';
    case 'subfloor': return 'Subfloor';
    case 'posts': return 'Posts';
    default: return c;
  }
}

function escapeCsv(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function timeAgo(ts: number): string {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 5) return 'just now';
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}
function timeAgoIso(iso: string): string {
  try { return timeAgo(new Date(iso).getTime()); } catch { return ''; }
}


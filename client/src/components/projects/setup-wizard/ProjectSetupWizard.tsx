import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { collection, doc, setDoc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/hooks/use-confirm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ChevronLeft, ChevronRight, Save, X, CheckCircle2 } from 'lucide-react';
import { WIZARD_STEPS, WIZARD_STEP_LABELS, type ProjectSetupDraft, type WizardStepId } from '@/types/projectSetup';
import { computeProjectCompleteness } from '@/lib/projectSetup';
import { Step1Identity } from './Step1Identity';
import { Step2Clients } from './Step2Clients';
import { Step3Team } from './Step3Team';

/**
 * Project Setup Wizard — guides the GC through creating a project so
 * every downstream portal (client / designer / sub) has the data it
 * needs to be useful from day one.
 *
 * Draft state lives in a regular `projects` doc with `status: 'draft'`.
 * The wizard upserts on each step transition so leaving mid-flow doesn't
 * lose work; the wizard's own URL accepts `?draft={projectId}` to
 * resume.
 *
 * Steps 4-8 (Budget, Plans, Timeline, Scope, Review) are scheduled for
 * Push 2 + Push 3 — until then the wizard ends after Step 3 with a
 * "Save draft" exit. The completeness scorecard is computed at every
 * step so the bottom-bar can show "12 of 19 fields filled in" today.
 */

interface ProjectSetupWizardProps {
  /** Existing draft id to resume from. Omit to start fresh. */
  draftId?: string;
  /** Called on successful publish (status flips to 'active') with the
   *  new project id. Caller typically navigates to /projects/:id. */
  onPublished?: (projectId: string) => void;
  /** Called when the user cancels out. Caller typically navigates back. */
  onCancel?: () => void;
}

const ACTIVE_STEPS: WizardStepId[] = ['identity', 'clients', 'team'];
// Steps in WIZARD_STEPS that haven't shipped yet — shown disabled in the
// progress tracker so users can see the road ahead.
const PLANNED_STEPS: WizardStepId[] = ['budget', 'plans', 'timeline', 'scope', 'review'];

export function ProjectSetupWizard({ draftId, onPublished, onCancel }: ProjectSetupWizardProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [, navigate] = useLocation();

  const [draft, setDraft] = useState<ProjectSetupDraft>(emptyDraft());
  const [stepIdx, setStepIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [loaded, setLoaded] = useState(!draftId);

  // Resume from existing draft if one is provided.
  useEffect(() => {
    if (!draftId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'projects', draftId));
        if (snap.exists()) {
          const data = snap.data() as ProjectSetupDraft;
          setDraft({ ...emptyDraft(), ...data, id: snap.id });
          setStepIdx(Math.min(data.setupStep || 0, ACTIVE_STEPS.length - 1));
        }
      } catch (e) {
        console.warn('[setup-wizard] failed to load draft', e);
        toast({ title: 'Could not load draft', variant: 'destructive' });
      } finally {
        setLoaded(true);
      }
    })();
  }, [draftId, toast]);

  // ── Persistence ─────────────────────────────────────────────────────
  // Upsert the draft. Returns the id (assigns a new one if first save).
  const saveDraft = useCallback(async (next: ProjectSetupDraft, opts?: { silent?: boolean }) => {
    setSaving(true);
    try {
      let id = next.id;
      const payload: any = {
        ...next,
        status: next.status || 'draft',
        setupStep: stepIdx,
        updatedAt: serverTimestamp(),
        createdBy: next.createdBy || user?.id?.toString() || '',
      };
      delete payload.id;
      if (id) {
        await updateDoc(doc(db, 'projects', id), payload);
      } else {
        const ref = doc(collection(db, 'projects'));
        id = ref.id;
        payload.createdAt = serverTimestamp();
        await setDoc(ref, payload);
        // Stamp the id back so subsequent saves are updates.
        setDraft(prev => ({ ...prev, id }));
      }
      if (!opts?.silent) toast({ title: 'Draft saved' });
      return id;
    } catch (e: any) {
      console.warn('[setup-wizard] save failed', e);
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
      return undefined;
    } finally {
      setSaving(false);
    }
  }, [stepIdx, user?.id, toast]);

  // ── Step nav ────────────────────────────────────────────────────────
  const handleNext = async () => {
    // Silent save on every step transition so we don't toast 8x.
    await saveDraft(draft, { silent: true });
    if (stepIdx < ACTIVE_STEPS.length - 1) {
      setStepIdx(stepIdx + 1);
    } else {
      // Final active step — for now this is also the publish moment
      // (until Steps 4-8 land). Confirm intent first.
      await publish();
    }
  };

  const handleBack = () => {
    if (stepIdx > 0) setStepIdx(stepIdx - 1);
  };

  const handleSaveAndExit = async () => {
    const id = await saveDraft(draft);
    if (id) {
      toast({ title: 'Draft saved', description: 'You can finish setup later from Projects.' });
      onCancel?.();
    }
  };

  const handleCancel = async () => {
    const ok = await confirm({
      title: 'Discard this draft?',
      description: 'Any unsaved progress on this step will be lost. The draft itself is kept — find it under Projects → Drafts.',
      confirmText: 'Discard step',
      variant: 'destructive',
    });
    if (ok) onCancel?.();
  };

  // ── Publish ─────────────────────────────────────────────────────────
  const publish = async () => {
    const report = computeProjectCompleteness(draft);
    if (report.hasBlockers) {
      const blockers = report.all.filter(i => i.severity === 'block')
        .map(i => `• ${i.label}`)
        .join('\n');
      toast({
        title: 'Project needs more info before publishing',
        description: `Missing:\n${blockers}`,
        variant: 'destructive',
      });
      return;
    }
    setPublishing(true);
    try {
      const id = await saveDraft({ ...draft, status: 'planning' }, { silent: true });
      if (!id) return;
      toast({ title: 'Project created', description: 'Now visible to client + designer + team.' });
      onPublished?.(id);
    } finally {
      setPublishing(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────
  if (!loaded) {
    return <div className="p-12 text-center text-gray-400">Loading draft…</div>;
  }

  const currentStep = ACTIVE_STEPS[stepIdx];
  const totalActive = ACTIVE_STEPS.length;
  const stepNumber = stepIdx + 1;
  const completeness = computeProjectCompleteness(draft);

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-4">
      {/* Header + progress tracker */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <CardTitle className="text-lg">New project setup</CardTitle>
              <CardDescription>
                Step {stepNumber} of {totalActive}: {WIZARD_STEP_LABELS[currentStep]}
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={handleCancel} className="gap-1.5">
              <X className="w-4 h-4" /> Exit
            </Button>
          </div>

          {/* Progress bar — tracks the active step, not setup completeness.
              Completeness is shown separately below. */}
          <Progress value={(stepNumber / totalActive) * 100} className="mt-3 h-2" />

          {/* Step tracker — active steps are clickable, planned steps are
              greyed out so the user sees the full roadmap. */}
          <div className="flex flex-wrap gap-1.5 mt-3 text-[11px]">
            {ACTIVE_STEPS.map((id, i) => (
              <button
                key={id}
                type="button"
                onClick={() => setStepIdx(i)}
                className={`px-2 py-0.5 rounded-full border transition-colors ${
                  i === stepIdx
                    ? 'bg-[#141414] text-white border-[#141414]'
                    : i < stepIdx
                      ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}
              >
                {i < stepIdx && <CheckCircle2 className="inline w-3 h-3 mr-0.5" />}
                {WIZARD_STEP_LABELS[id]}
              </button>
            ))}
            {PLANNED_STEPS.map(id => (
              <span
                key={id}
                className="px-2 py-0.5 rounded-full bg-gray-50 text-gray-400 border border-gray-100"
                title="Coming in a follow-up update"
              >
                {WIZARD_STEP_LABELS[id]}
              </span>
            ))}
          </div>
        </CardHeader>
      </Card>

      {/* Step body */}
      <Card>
        <CardContent className="pt-6">
          {currentStep === 'identity' && <Step1Identity draft={draft} onChange={setDraft} />}
          {currentStep === 'clients' && <Step2Clients draft={draft} onChange={setDraft} />}
          {currentStep === 'team' && <Step3Team draft={draft} onChange={setDraft} />}
        </CardContent>
      </Card>

      {/* Footer nav */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={handleBack} disabled={stepIdx === 0} className="gap-1.5">
          <ChevronLeft className="w-4 h-4" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSaveAndExit}
            disabled={saving}
            className="gap-1.5 text-gray-600"
          >
            <Save className="w-4 h-4" /> Save & exit
          </Button>
          <Button
            onClick={handleNext}
            disabled={saving || publishing}
            className="gap-1.5 text-white"
            style={{ backgroundColor: '#C9A96E' }}
          >
            {stepIdx === totalActive - 1
              ? (publishing ? 'Publishing…' : 'Publish project')
              : <>Next <ChevronRight className="w-4 h-4" /></>
            }
          </Button>
        </div>
      </div>

      {/* Live completeness footer — runs the same scorer that will drive
          Step 8's scorecard, so users get a feel for how complete the
          project will be before they get there. */}
      <Card className="bg-gray-50/50">
        <CardContent className="py-3 px-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-gray-600">
            Setup completeness: <strong className="text-gray-900">{completeness.percent}%</strong>
            {completeness.hasBlockers && (
              <span className="text-red-600 ml-2">
                · {completeness.all.filter(i => i.severity === 'block').length} blocker(s) before publish
              </span>
            )}
          </div>
          <Progress value={completeness.percent} className="w-32 h-1.5" />
        </CardContent>
      </Card>
    </div>
  );
}

function emptyDraft(): ProjectSetupDraft {
  return {
    name: '',
    address: '',
    squareFootage: 0,
    targetCompletion: '',
    clients: [],
    team: [],
    status: 'draft',
  };
}

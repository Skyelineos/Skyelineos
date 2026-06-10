// RFIPanel — the single reusable surface for the RFI module, rendered in three
// places with the same code, role-gated at runtime + by firestore.rules:
//   • GC project page          (client/src/pages/ProjectRFIs.tsx)
//   • Designer Portal tab       (client/src/pages/DesignerPortal.tsx)
//   • Subcontractor Portal tab  (client/src/pages/SubcontractorPortal.tsx)
//
// Everyone on a project can RAISE an RFI; GC + Designer can ANSWER and CLOSE.
// The panel adapts its actions to the signed-in user's role.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import {
  subscribeProjectRFIs,
  createRFI,
  answerRFI,
  closeRFI,
  reopenRFI,
  nextRFINumber,
  type RFIAuthor,
} from '@/lib/rfi/firestore';
import { uploadRFIAttachment } from '@/lib/rfi/upload';
import type { RFI, RFIStatus, RFIPriority, RFIAttachment } from '@/types/rfi';
import { RFI_STATUS_LABELS } from '@/types/rfi';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  HelpCircle, Plus, Clock, CheckCircle2, AlertTriangle, MessageSquareReply, Lock, Undo2,
  Paperclip, X, Loader2, FileText, Camera,
} from 'lucide-react';

interface Props {
  projectId: string;
  projectName?: string;
}

const STATUS_STYLES: Record<RFIStatus, string> = {
  open: 'bg-amber-100 text-amber-800 border-amber-200',
  answered: 'bg-blue-100 text-blue-800 border-blue-200',
  closed: 'bg-gray-100 text-gray-600 border-gray-200',
};

const PRIORITY_STYLES: Record<RFIPriority, string> = {
  high: 'bg-red-100 text-red-700',
  normal: 'bg-gray-100 text-gray-600',
  low: 'bg-slate-100 text-slate-500',
};

const ANSWERER_ROLES = ['admin', 'gc', 'projectManager', 'designer'];

const rfiNo = (n: number) => `RFI-${String(n).padStart(3, '0')}`;
const fmtDate = (ts: any) => ts?.toDate?.()?.toLocaleDateString?.() || '—';

export function RFIPanel({ projectId, projectName }: Props) {
  const { user, firebaseUser } = useAuth();
  const { toast } = useToast();
  const [rfis, setRfis] = useState<RFI[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<RFIStatus | 'all'>('all');
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<RFI | null>(null);

  const author: RFIAuthor = {
    uid: firebaseUser?.uid || '',
    name: user?.name || firebaseUser?.email?.split('@')[0] || 'Unknown',
    role: user?.role || 'sub',
  };
  const canAnswer = ANSWERER_ROLES.includes(user?.role || '');

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    const unsub = subscribeProjectRFIs(projectId, list => {
      setRfis(list);
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [projectId]);

  const counts = useMemo(() => ({
    all: rfis.length,
    open: rfis.filter(r => r.status === 'open').length,
    answered: rfis.filter(r => r.status === 'answered').length,
    closed: rfis.filter(r => r.status === 'closed').length,
  }), [rfis]);

  const visible = filter === 'all' ? rfis : rfis.filter(r => r.status === filter);

  // Keep the detail modal in sync with live updates (e.g. it gets answered).
  const viewingLive = viewing ? rfis.find(r => r.id === viewing.id) || viewing : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-[#C9A96E]" />
              RFIs — Requests for Information
            </CardTitle>
            <CardDescription>
              Field questions and clarifications for {projectName || 'this project'}. Anyone can raise one; the team answers and closes them out.
            </CardDescription>
          </div>
          <Button
            onClick={() => setCreating(true)}
            disabled={!author.uid}
            className="gap-1.5 text-white flex-shrink-0 px-2.5 sm:px-4"
            style={{ backgroundColor: '#C9A96E' }}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Raise RFI</span>
          </Button>
        </CardHeader>
        <CardContent>
          {/* Status filter strip */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {(['all', 'open', 'answered', 'closed'] as const).map(s => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  filter === s
                    ? 'bg-[#141414] text-white border-[#141414]'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {s === 'all' ? 'All' : RFI_STATUS_LABELS[s]} ({counts[s]})
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-8 text-sm text-gray-400">Loading RFIs…</div>
          ) : visible.length === 0 ? (
            <div className="text-center py-10 text-sm text-gray-400">
              {filter === 'all'
                ? <>No RFIs yet. Click <strong>Raise RFI</strong> to ask a question.</>
                : `No ${filter} RFIs.`}
            </div>
          ) : (
            <div className="space-y-2">
              {visible.map(r => {
                const overdue = r.status === 'open' && r.dueDate && r.dueDate < new Date().toISOString().slice(0, 10);
                return (
                  <button
                    key={r.id}
                    onClick={() => setViewing(r)}
                    className="w-full text-left border rounded-lg p-3 hover:border-[#C9A96E] hover:bg-amber-50/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-gray-500">{rfiNo(r.number)}</span>
                          <span className="font-medium text-sm text-gray-900 truncate">{r.subject}</span>
                          {r.priority !== 'normal' && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold ${PRIORITY_STYLES[r.priority]}`}>
                              {r.priority}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
                          {r.discipline && <span>{r.discipline}</span>}
                          {r.location && <span>· {r.location}</span>}
                          <span>· by {r.createdByName}</span>
                          {r.dueDate && (
                            <span className={overdue ? 'text-red-600 font-medium flex items-center gap-0.5' : 'flex items-center gap-0.5'}>
                              {overdue && <AlertTriangle className="w-3 h-3" />}· due {r.dueDate}
                            </span>
                          )}
                          {r.attachments && r.attachments.length > 0 && (
                            <span className="flex items-center gap-0.5">
                              · <Paperclip className="w-3 h-3" /> {r.attachments.length}
                            </span>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline" className={`flex-shrink-0 text-[10px] ${STATUS_STYLES[r.status]}`}>
                        {RFI_STATUS_LABELS[r.status]}
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {creating && (
        <CreateRFIModal
          projectId={projectId}
          author={author}
          nextNumber={nextRFINumber(rfis)}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            toast({ title: 'RFI submitted', description: 'The team has been notified.' });
          }}
        />
      )}

      {viewingLive && (
        <RFIDetailModal
          rfi={viewingLive}
          projectId={projectId}
          author={author}
          canAnswer={canAnswer}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

// ─── Attachment helpers (photos + videos from phone or desktop) ──────────────

const isImage = (a: RFIAttachment) =>
  a.contentType?.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic|heif)$/i.test(a.name);
const isVideo = (a: RFIAttachment) =>
  a.contentType?.startsWith('video/') || /\.(mp4|mov|webm|m4v|avi)$/i.test(a.name);

/** Thumbnail grid for RFI attachments — image previews, inline video players,
 *  and a file-link fallback. Pass `onRemove` for the editable (create) view. */
function AttachmentGrid({
  attachments, onRemove,
}: {
  attachments: RFIAttachment[];
  onRemove?: (index: number) => void;
}) {
  if (!attachments?.length) return null;
  return (
    <div className="grid grid-cols-3 gap-2">
      {attachments.map((a, i) => (
        <div key={i} className="relative border rounded-lg overflow-hidden bg-gray-50 aspect-square">
          {isImage(a) ? (
            <a href={a.url} target="_blank" rel="noopener noreferrer" title={a.name}>
              <img src={a.url} alt={a.name} className="w-full h-full object-cover" />
            </a>
          ) : isVideo(a) ? (
            <video src={a.url} controls preload="metadata" className="w-full h-full object-cover bg-black" />
          ) : (
            <a
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center justify-center w-full h-full p-1 text-center"
              title={a.name}
            >
              <FileText className="w-6 h-6 text-gray-400 mb-1" />
              <span className="text-[10px] text-gray-500 truncate w-full px-1">{a.name}</span>
            </a>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 hover:bg-black/80"
              aria-label="Remove attachment"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Create RFI modal ────────────────────────────────────────────────────────

function CreateRFIModal({
  projectId, author, nextNumber, onClose, onCreated,
}: {
  projectId: string;
  author: RFIAuthor;
  nextNumber: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [subject, setSubject] = useState('');
  const [question, setQuestion] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [location, setLocation] = useState('');
  const [priority, setPriority] = useState<RFIPriority>('normal');
  const [dueDate, setDueDate] = useState('');
  const [attachments, setAttachments] = useState<RFIAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  const canSubmit = subject.trim().length > 1 && question.trim().length > 1 && !saving && !uploading;

  // Upload each chosen photo/video to Storage, appending as it completes so the
  // user sees thumbnails fill in. Sequential keeps the progress bar meaningful.
  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        setUploadPct(0);
        const att = await uploadRFIAttachment(projectId, file, setUploadPct);
        setAttachments(prev => [...prev, att]);
      }
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e?.message || 'Could not upload file', variant: 'destructive' });
    } finally {
      setUploading(false);
      setUploadPct(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await createRFI(
        projectId,
        { subject, question, discipline, location, priority, dueDate, attachments },
        author,
        nextNumber,
      );
      onCreated();
    } catch (e: any) {
      toast({ title: 'Could not submit RFI', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Raise an RFI · {rfiNo(nextNumber)}</DialogTitle>
          <DialogDescription>Ask a question that needs an authoritative answer from the team.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="rfi-subject">Subject *</Label>
            <Input id="rfi-subject" value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Beam pocket dimension at grid C-4" />
          </div>
          <div>
            <Label htmlFor="rfi-question">Question *</Label>
            <Textarea id="rfi-question" value={question} onChange={e => setQuestion(e.target.value)} rows={4} placeholder="Describe what you need clarified, including any conflicting info on the plans." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="rfi-discipline">Discipline / Trade</Label>
              <Input id="rfi-discipline" value={discipline} onChange={e => setDiscipline(e.target.value)} placeholder="Framing" />
            </div>
            <div>
              <Label htmlFor="rfi-location">Location</Label>
              <Input id="rfi-location" value={location} onChange={e => setLocation(e.target.value)} placeholder="Master Bath" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="rfi-priority">Priority</Label>
              <select
                id="rfi-priority"
                value={priority}
                onChange={e => setPriority(e.target.value as RFIPriority)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <Label htmlFor="rfi-due">Needed by</Label>
              <Input id="rfi-due" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          </div>

          {/* Photo / video attachments. On phones, accept="image/*,video/*"
              (no capture attribute) lets the OS offer "Take Photo or Video"
              AND the gallery, so a field crew can shoot or pick existing media. */}
          <div>
            <Label>Photos / Videos</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={e => handleFiles(e.target.files)}
            />
            <div className="mt-1.5">
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="gap-1.5 w-full sm:w-auto"
              >
                {uploading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading… {Math.round(uploadPct)}%</>
                  : <><Camera className="w-4 h-4" /> Add photo / video</>}
              </Button>
              <p className="text-[11px] text-gray-400 mt-1">Take a photo or video, or pick from your library.</p>
            </div>
            {attachments.length > 0 && (
              <div className="mt-2">
                <AttachmentGrid
                  attachments={attachments}
                  onRemove={i => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                />
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving || uploading}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} className="text-white" style={{ backgroundColor: '#C9A96E' }}>
            {saving ? 'Submitting…' : 'Submit RFI'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── RFI detail / answer modal ───────────────────────────────────────────────

function RFIDetailModal({
  rfi, projectId, author, canAnswer, onClose,
}: {
  rfi: RFI;
  projectId: string;
  author: RFIAuthor;
  canAnswer: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [answer, setAnswer] = useState(rfi.answer || '');
  const [saving, setSaving] = useState(false);

  async function submitAnswer() {
    if (answer.trim().length < 2) return;
    setSaving(true);
    try {
      await answerRFI(projectId, rfi, answer, author);
      toast({ title: 'Answer posted', description: `${rfiNo(rfi.number)} marked answered.` });
    } catch (e: any) {
      toast({ title: 'Could not post answer', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function doClose() {
    setSaving(true);
    try {
      await closeRFI(projectId, rfi.id, author);
      toast({ title: 'RFI closed' });
    } catch (e: any) {
      toast({ title: 'Could not close', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function doReopen() {
    setSaving(true);
    try {
      await reopenRFI(projectId, rfi.id);
      toast({ title: 'RFI re-opened' });
    } catch (e: any) {
      toast({ title: 'Could not re-open', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono text-sm text-gray-500">{rfiNo(rfi.number)}</span>
            {rfi.subject}
          </DialogTitle>
          <DialogDescription>
            Raised by {rfi.createdByName} · {fmtDate(rfi.createdAt)}
            {rfi.discipline ? ` · ${rfi.discipline}` : ''}{rfi.location ? ` · ${rfi.location}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Question</p>
            <p className="text-sm whitespace-pre-wrap">{rfi.question}</p>
            {rfi.dueDate && <p className="text-xs text-gray-500 mt-2 flex items-center gap-1"><Clock className="w-3 h-3" /> Needed by {rfi.dueDate}</p>}
          </div>

          {rfi.attachments && rfi.attachments.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500 mb-1.5 flex items-center gap-1">
                <Paperclip className="w-3 h-3" /> Attachments ({rfi.attachments.length})
              </p>
              <AttachmentGrid attachments={rfi.attachments} />
            </div>
          )}

          {/* Answer block: shows existing answer, or an entry box for answerers. */}
          {rfi.status === 'open' && !canAnswer && (
            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-900 flex items-center gap-2">
              <Clock className="w-4 h-4" /> Waiting for an answer from the team.
            </div>
          )}

          {rfi.answer && (
            <div className="bg-blue-50 border border-blue-200 rounded p-3">
              <p className="text-xs uppercase tracking-wide text-blue-700 mb-1 flex items-center gap-1">
                <MessageSquareReply className="w-3 h-3" /> Answer
              </p>
              <p className="text-sm whitespace-pre-wrap text-blue-950">{rfi.answer}</p>
              <p className="text-xs text-blue-700 mt-2">— {rfi.answeredByName}, {fmtDate(rfi.answeredAt)}</p>
            </div>
          )}

          {canAnswer && rfi.status === 'open' && (
            <div>
              <Label htmlFor="rfi-answer">Your answer</Label>
              <Textarea id="rfi-answer" value={answer} onChange={e => setAnswer(e.target.value)} rows={4} placeholder="Provide the clarification…" />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Close window</Button>
          {canAnswer && rfi.status === 'open' && (
            <Button onClick={submitAnswer} disabled={saving || answer.trim().length < 2} className="text-white" style={{ backgroundColor: '#C9A96E' }}>
              <MessageSquareReply className="w-4 h-4 mr-1" /> {saving ? 'Posting…' : 'Post answer'}
            </Button>
          )}
          {canAnswer && rfi.status === 'answered' && (
            <Button onClick={doClose} disabled={saving} className="gap-1 bg-[#141414] text-white hover:bg-[#141414]/90">
              <Lock className="w-4 h-4" /> Close RFI
            </Button>
          )}
          {canAnswer && rfi.status === 'closed' && (
            <Button variant="outline" onClick={doReopen} disabled={saving} className="gap-1">
              <Undo2 className="w-4 h-4" /> Re-open
            </Button>
          )}
          {rfi.status !== 'open' && !canAnswer && (
            <span className="text-xs text-gray-400 flex items-center gap-1 self-center">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> {RFI_STATUS_LABELS[rfi.status]}
            </span>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

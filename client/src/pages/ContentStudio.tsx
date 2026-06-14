import { useState, useEffect, useRef } from 'react';
import {
  collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, query, orderBy,
  serverTimestamp, getDocs, where, limit,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { getAuth } from 'firebase/auth';
import { db, storage } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Sparkles, Camera, Upload, Send, CheckCircle2, X, Eye, Trash2,
  Hash, Calendar, BarChart3, Image as ImageIcon, Video, Loader2, Edit, Copy,
} from 'lucide-react';
import type { ContentDraft, ContentMedia, ContentPhase } from '@/components/content-studio/types';

const PHASES: { value: ContentPhase; label: string }[] = [
  { value: 'foundation', label: 'Foundation' },
  { value: 'framing', label: 'Framing' },
  { value: 'mep', label: 'MEP' },
  { value: 'drywall', label: 'Drywall' },
  { value: 'finishes', label: 'Finishes' },
  { value: 'exterior', label: 'Exterior' },
  { value: 'completed', label: 'Completed' },
  { value: 'design', label: 'Design' },
  { value: 'other', label: 'Other' },
];

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || 'https://api-mtph34upva-uc.a.run.app';

async function authedFetch(path: string, init: RequestInit = {}) {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  const idToken = await user.getIdToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function analyzeMediaWithAI(storagePath: string, mimeType: string, projectName?: string) {
  const data = await authedFetch('/api/content/analyze-media', {
    method: 'POST',
    body: JSON.stringify({ storagePath, mimeType, projectName }),
  });
  return data.analysis;
}

// Calls the right Instagram endpoint based on draft type.
async function postDraftToInstagram(d: ContentDraft): Promise<{ mediaId: string }> {
  const fullCaption = [d.caption, (d.hashtags || []).join(' ')].filter(Boolean).join('\n\n');
  if (d.type === 'reel' || d.media[0]?.type === 'video') {
    return authedFetch('/api/instagram/publish-reel', {
      method: 'POST',
      body: JSON.stringify({ storagePath: d.media[0].storagePath, caption: fullCaption }),
    });
  }
  if ((d.media?.length || 0) > 1) {
    return authedFetch('/api/instagram/publish-carousel', {
      method: 'POST',
      body: JSON.stringify({ storagePaths: d.media.map(m => m.storagePath), caption: fullCaption }),
    });
  }
  return authedFetch('/api/instagram/publish-photo', {
    method: 'POST',
    body: JSON.stringify({ storagePath: d.media[0].storagePath, caption: fullCaption }),
  });
}

async function fetchInstagramAccount() {
  return authedFetch('/api/instagram/account');
}

export default function ContentStudio() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<ContentDraft[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [activeTab, setActiveTab] = useState('drafts');
  const [creatingDraft, setCreatingDraft] = useState<Partial<ContentDraft> | null>(null);

  // Subscribe to all drafts
  useEffect(() => {
    const q = query(collection(db, 'contentDrafts'), orderBy('createdAt', 'desc'), limit(100));
    return onSnapshot(q, snap => {
      setDrafts(snap.docs.map(d => ({ id: d.id, ...d.data() } as ContentDraft)));
    }, () => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'projects'), orderBy('name')));
        setProjects(snap.docs.map(d => ({ id: d.id, name: (d.data() as any).name || 'Untitled' })));
      } catch {}
    })();
  }, []);

  // Group by status
  const byStatus = {
    draft:           drafts.filter(d => d.status === 'draft'),
    pending:         drafts.filter(d => d.status === 'pending_approval'),
    approved:        drafts.filter(d => d.status === 'approved' || d.status === 'scheduled'),
    published:       drafts.filter(d => d.status === 'published'),
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Sparkles className="w-7 h-7 text-[#C9A96E]" />
              <h1 className="text-2xl font-bold text-gray-900">Content Studio</h1>
              <Badge className="bg-purple-100 text-purple-700 border-purple-200 gap-1">
                <Sparkles className="w-3 h-3" /> AI-powered
              </Badge>
            </div>
            <p className="text-gray-500 text-sm">
              Upload site photos → Claude reads them, suggests captions + hashtags, you approve, post to Instagram.
            </p>
          </div>
          <Button
            onClick={() => setCreatingDraft({ type: 'photo', media: [], caption: '', hashtags: [], status: 'draft' })}
            className="gap-2 text-white"
            style={{ backgroundColor: '#C9A96E' }}
          >
            <Camera className="w-4 h-4" /> New Post
          </Button>
        </div>

        <InstagramStatusBanner />

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile label="Drafts" value={byStatus.draft.length} accent="text-gray-700" />
          <StatTile label="Pending Approval" value={byStatus.pending.length} accent={byStatus.pending.length > 0 ? 'text-orange-600' : 'text-gray-700'} />
          <StatTile label="Approved" value={byStatus.approved.length} accent="text-green-600" />
          <StatTile label="Published" value={byStatus.published.length} accent="text-blue-600" />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="drafts">Drafts ({byStatus.draft.length})</TabsTrigger>
            <TabsTrigger value="pending">Approval ({byStatus.pending.length})</TabsTrigger>
            <TabsTrigger value="approved">Approved ({byStatus.approved.length})</TabsTrigger>
            <TabsTrigger value="published">Published ({byStatus.published.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="drafts"><DraftsGrid drafts={byStatus.draft} onEdit={setCreatingDraft} /></TabsContent>
          <TabsContent value="pending"><DraftsGrid drafts={byStatus.pending} onEdit={setCreatingDraft} /></TabsContent>
          <TabsContent value="approved"><DraftsGrid drafts={byStatus.approved} onEdit={setCreatingDraft} /></TabsContent>
          <TabsContent value="published"><DraftsGrid drafts={byStatus.published} onEdit={setCreatingDraft} /></TabsContent>
        </Tabs>

        {creatingDraft && (
          <DraftEditor
            draft={creatingDraft}
            projects={projects}
            onClose={() => setCreatingDraft(null)}
          />
        )}
      </div>
    </AppLayout>
  );
}

function InstagramStatusBanner() {
  const [acct, setAcct] = useState<{ username?: string; followers_count?: number; media_count?: number; profile_picture_url?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchInstagramAccount().then(setAcct).catch((e: any) => setError(e.message || 'unavailable'));
  }, []);

  if (error) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-3 text-xs text-amber-900">
          Instagram not connected: {error}
        </CardContent>
      </Card>
    );
  }
  if (!acct) {
    return (
      <Card className="bg-gray-50">
        <CardContent className="p-3 text-xs text-gray-500 flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin" /> Checking Instagram connection...
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="border-green-200 bg-gradient-to-r from-pink-50 to-purple-50">
      <CardContent className="p-3 flex items-center gap-3">
        {acct.profile_picture_url && (
          <img src={acct.profile_picture_url} alt="" className="w-9 h-9 rounded-full border-2 border-white shadow" referrerPolicy="no-referrer" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
            Connected to <span className="text-purple-700">@{acct.username}</span>
          </p>
          <p className="text-[11px] text-gray-500">
            {acct.followers_count?.toLocaleString()} followers · {acct.media_count} posts
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatTile({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${accent}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

// ─── Grid of drafts ──────────────────────────────────────────────────────────

function DraftsGrid({ drafts, onEdit }: { drafts: ContentDraft[]; onEdit: (d: ContentDraft) => void }) {
  const { toast } = useToast();
  const [posting, setPosting] = useState<string | null>(null);

  const handlePostToIg = async (d: ContentDraft) => {
    if (!d.media?.length) return toast({ title: 'No media to post', variant: 'destructive' });
    const isReel = d.type === 'reel' || d.media[0]?.type === 'video';
    const label = isReel ? 'Reel' : (d.media.length > 1 ? `Carousel (${d.media.length})` : 'photo');
    if (!confirm(`Post this ${label} to @skyelinehomes now?${isReel ? '\n\nReels take 30-90s to process — please wait.' : ''}`)) return;
    setPosting(d.id);
    try {
      const result = await postDraftToInstagram(d);
      await updateDoc(doc(db, 'contentDrafts', d.id), {
        status: 'published',
        publishedAt: serverTimestamp(),
        publishedToPlatforms: {
          ...(d.publishedToPlatforms || {}),
          instagram: { postId: result.mediaId, url: '', publishedAt: serverTimestamp() },
        },
        updatedAt: serverTimestamp(),
      });
      toast({ title: 'Posted to Instagram', description: `Media ID ${result.mediaId}` });
    } catch (e: any) {
      toast({ title: 'Post failed', description: e.message, variant: 'destructive' });
    } finally {
      setPosting(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this draft?')) return;
    try { await deleteDoc(doc(db, 'contentDrafts', id)); }
    catch (e: any) { toast({ title: 'Delete failed', description: e.message, variant: 'destructive' }); }
  };

  const handleSubmitForApproval = async (id: string) => {
    try {
      await updateDoc(doc(db, 'contentDrafts', id), { status: 'pending_approval', updatedAt: serverTimestamp() });
      toast({ title: 'Submitted for approval' });
    } catch (e: any) { toast({ title: 'Submit failed', description: e.message, variant: 'destructive' }); }
  };

  const handleApprove = async (id: string) => {
    try {
      await updateDoc(doc(db, 'contentDrafts', id), {
        status: 'approved',
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast({ title: 'Approved' });
    } catch (e: any) { toast({ title: 'Approve failed', description: e.message, variant: 'destructive' }); }
  };

  const handleReject = async (id: string) => {
    const reason = prompt('Reason (optional):');
    try {
      await updateDoc(doc(db, 'contentDrafts', id), {
        status: 'rejected',
        rejectedReason: reason || '',
        updatedAt: serverTimestamp(),
      });
      toast({ title: 'Rejected' });
    } catch (e: any) { toast({ title: 'Reject failed', description: e.message, variant: 'destructive' }); }
  };

  const copyForInstagram = (d: ContentDraft) => {
    const text = `${d.caption}\n\n${d.hashtags.join(' ')}`;
    navigator.clipboard.writeText(text);
    toast({ title: 'Caption + hashtags copied', description: 'Paste into Instagram when posting.' });
  };

  if (drafts.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <Sparkles className="w-10 h-10 mx-auto opacity-30 mb-2" />
        <p className="text-sm font-medium">Nothing here yet</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
      {drafts.map(d => (
        <Card key={d.id} className="overflow-hidden">
          {/* Media preview */}
          {d.media[0] && (
            <div className="aspect-square bg-black relative">
              {d.media[0].type === 'photo' ? (
                <img src={d.media[0].url} alt="" className="w-full h-full object-cover" />
              ) : (
                <video src={d.media[0].url} className="w-full h-full object-cover" />
              )}
              {d.media.length > 1 && (
                <Badge className="absolute top-2 right-2 bg-white/90 text-gray-800">
                  +{d.media.length - 1}
                </Badge>
              )}
              {d.category && (
                <Badge className="absolute top-2 left-2 bg-[#C9A96E] text-black text-[10px]">
                  {d.category}
                </Badge>
              )}
            </div>
          )}
          <CardContent className="p-3 space-y-2">
            <p className="text-sm text-gray-800 line-clamp-3">{d.caption || <span className="italic text-gray-400">No caption</span>}</p>
            {d.projectName && <Badge variant="outline" className="text-[10px]">{d.projectName}</Badge>}
            <div className="flex flex-wrap gap-1">
              {d.hashtags.slice(0, 4).map(h => (
                <span key={h} className="text-[10px] text-blue-600">{h}</span>
              ))}
              {d.hashtags.length > 4 && <span className="text-[10px] text-gray-400">+{d.hashtags.length - 4}</span>}
            </div>

            <div className="flex flex-wrap gap-1 pt-2 border-t">
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => onEdit(d)}>
                <Edit className="w-3 h-3" /> Edit
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => copyForInstagram(d)}>
                <Copy className="w-3 h-3" /> Copy
              </Button>
              {d.status === 'draft' && (
                <Button size="sm" className="h-7 text-xs text-white" style={{ backgroundColor: '#C9A96E' }} onClick={() => handleSubmitForApproval(d.id)}>
                  Submit →
                </Button>
              )}
              {d.status === 'pending_approval' && (
                <>
                  <Button size="sm" className="h-7 text-xs bg-green-500 text-white" onClick={() => handleApprove(d.id)}>
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs text-red-500" onClick={() => handleReject(d.id)}>
                    <X className="w-3 h-3 mr-1" /> Reject
                  </Button>
                </>
              )}
              {(d.status === 'approved' || d.status === 'scheduled') && !d.publishedToPlatforms?.instagram && (
                <Button
                  size="sm"
                  className="h-7 text-xs text-white bg-gradient-to-r from-pink-500 to-purple-600 hover:opacity-90"
                  disabled={posting === d.id}
                  onClick={() => handlePostToIg(d)}
                >
                  {posting === d.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Send className="w-3 h-3 mr-1" />}
                  Post to IG
                </Button>
              )}
              {d.publishedToPlatforms?.instagram && (
                <Badge className="h-7 text-[10px] bg-purple-100 text-purple-700 border-purple-200">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> On IG
                </Badge>
              )}
              <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500 ml-auto" onClick={() => handleDelete(d.id)}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Draft editor (create + edit) ────────────────────────────────────────────

function DraftEditor({
  draft, projects, onClose,
}: {
  draft: Partial<ContentDraft>;
  projects: { id: string; name: string }[];
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [d, setD] = useState<Partial<ContentDraft>>(draft);
  const [hashtagInput, setHashtagInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<{ captions: string[]; tags: string[]; hashtags: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateField = (patch: Partial<ContentDraft>) => setD(curr => ({ ...curr, ...patch }));

  const handleMediaUpload = async (file: File) => {
    if (!user) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const path = `content/${new Date().toISOString().slice(0, 7)}/${filename}`;
      const sref = storageRef(storage, path);
      const task = uploadBytesResumable(sref, file);
      await new Promise<void>((resolve, reject) => {
        task.on('state_changed',
          snap => setUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100),
          reject, () => resolve());
      });
      const url = await getDownloadURL(sref);
      const isVideo = file.type.startsWith('video/');
      const newMedia: ContentMedia = {
        url,
        storagePath: path,
        type: isVideo ? 'video' : 'photo',
      };
      updateField({ media: [...(d.media || []), newMedia] });

      // Auto-trigger AI analysis on first photo upload
      if (!isVideo && (!d.media || d.media.length === 0)) {
        await analyzeMedia(path, file.type);
      }
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const analyzeMedia = async (storagePath: string, mimeType: string) => {
    setAnalyzing(true);
    try {
      const project = projects.find(p => p.id === d.projectId);
      const analysis = await analyzeMediaWithAI(storagePath, mimeType, project?.name);
      setAiSuggestions({
        captions: analysis.captions || [],
        tags: analysis.tags || [],
        hashtags: analysis.hashtags || [],
      });
      // Auto-fill if no caption yet
      if (!d.caption && analysis.captions?.[0]) {
        updateField({
          caption: analysis.captions[0],
          hashtags: analysis.hashtags || [],
          category: analysis.phase || d.category,
          aiSuggestedCaption: analysis.captions[0],
          aiSuggestedHashtags: analysis.hashtags,
        });
      }
      toast({ title: 'AI analysis complete', description: `${analysis.captions?.length || 0} caption options + ${analysis.hashtags?.length || 0} hashtags suggested.` });
    } catch (e: any) {
      toast({ title: 'AI analysis failed', description: e.message, variant: 'destructive' });
    } finally {
      setAnalyzing(false);
    }
  };

  const removeMedia = (index: number) => {
    updateField({ media: (d.media || []).filter((_, i) => i !== index) });
  };

  const addHashtag = () => {
    let tag = hashtagInput.trim().replace(/^#+/, '');
    if (!tag) return;
    tag = '#' + tag;
    if (!(d.hashtags || []).includes(tag)) {
      updateField({ hashtags: [...(d.hashtags || []), tag] });
    }
    setHashtagInput('');
  };

  const useCaption = (text: string) => updateField({ caption: text });

  const handleSave = async () => {
    if (!user) return;
    if (!(d.media || []).length) {
      toast({ title: 'Add at least one photo or video', variant: 'destructive' });
      return;
    }
    if (!d.caption?.trim()) {
      toast({ title: 'Caption required', variant: 'destructive' });
      return;
    }
    try {
      const project = projects.find(p => p.id === d.projectId);
      const payload = {
        ...d,
        type: (d.media?.length || 0) > 1 ? 'carousel' : (d.media?.[0]?.type === 'video' ? 'reel' : 'photo'),
        projectName: project?.name || d.projectName,
        status: d.status || 'draft',
        createdBy: user.id?.toString() || user.email || 'unknown',
        createdByName: user.name,
        updatedAt: serverTimestamp(),
      } as any;

      if (d.id) {
        await updateDoc(doc(db, 'contentDrafts', d.id), payload);
        toast({ title: 'Draft updated' });
      } else {
        payload.createdAt = serverTimestamp();
        await addDoc(collection(db, 'contentDrafts'), payload);
        toast({ title: 'Draft saved' });
      }
      onClose();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
      <Card className="max-w-3xl w-full max-h-[95vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{d.id ? 'Edit Draft' : 'New Post'}</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Media uploader */}
          <div>
            <Label>Photos / Videos</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {(d.media || []).map((m, i) => (
                <div key={i} className="relative aspect-square bg-black rounded overflow-hidden">
                  {m.type === 'photo' ? (
                    <img src={m.url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <video src={m.url} className="w-full h-full object-cover" />
                  )}
                  <button onClick={() => removeMedia(i)} className="absolute top-1 right-1 bg-black/70 text-white rounded-full p-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleMediaUpload(f); e.target.value = ''; }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="aspect-square border-2 border-dashed border-gray-200 rounded hover:border-[#C9A96E] hover:bg-[#FFF8E7] flex flex-col items-center justify-center transition-colors"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-[#C9A96E]" />
                    <span className="text-[10px] mt-1 text-gray-500">{Math.round(uploadProgress)}%</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5 text-gray-400" />
                    <span className="text-[10px] mt-1 text-gray-500">Add</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Project + phase */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Project</Label>
              <Select value={d.projectId} onValueChange={v => updateField({ projectId: v })}>
                <SelectTrigger><SelectValue placeholder="— Pick project —" /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Phase / Category</Label>
              <Select value={d.category} onValueChange={v => updateField({ category: v as any })}>
                <SelectTrigger><SelectValue placeholder="— Pick phase —" /></SelectTrigger>
                <SelectContent>
                  {PHASES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* AI suggestions */}
          {analyzing && (
            <div className="bg-purple-50 border border-purple-200 rounded p-3 flex items-center gap-2 text-sm text-purple-900">
              <Loader2 className="w-4 h-4 animate-spin" /> Claude is analyzing your photo + drafting captions...
            </div>
          )}
          {aiSuggestions && aiSuggestions.captions.length > 0 && (
            <div className="bg-purple-50 border border-purple-200 rounded p-3 space-y-2">
              <p className="text-xs font-semibold text-purple-900 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> AI suggested captions — click to use
              </p>
              {aiSuggestions.captions.map((c, i) => (
                <button
                  key={i}
                  onClick={() => useCaption(c)}
                  className={`text-xs text-left w-full p-2 rounded border transition-colors ${
                    d.caption === c ? 'bg-purple-100 border-purple-400' : 'bg-white border-purple-200 hover:bg-purple-50'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          {/* Caption */}
          <div>
            <Label htmlFor="caption">Caption</Label>
            <Textarea
              id="caption"
              rows={4}
              value={d.caption || ''}
              onChange={e => updateField({ caption: e.target.value })}
              placeholder="Write your caption..."
            />
            <p className="text-[10px] text-gray-400 mt-1">{(d.caption || '').length} chars</p>
          </div>

          {/* Hashtags */}
          <div>
            <Label className="flex items-center gap-1.5"><Hash className="w-3.5 h-3.5" /> Hashtags</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={hashtagInput}
                onChange={e => setHashtagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addHashtag(); } }}
                placeholder="utahcustomhomes"
                className="h-8"
              />
              <Button type="button" variant="outline" size="sm" onClick={addHashtag}>Add</Button>
            </div>
            {(d.hashtags?.length || 0) > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {d.hashtags!.map((h, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px] gap-1">
                    {h}
                    <button onClick={() => updateField({ hashtags: d.hashtags!.filter((_, j) => j !== i) })}>
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
        <div className="border-t p-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} className="text-white" style={{ backgroundColor: '#C9A96E' }}>
            <Send className="w-4 h-4 mr-2" />
            {d.id ? 'Save' : 'Create Draft'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Plus, Instagram, Facebook, Linkedin, Home, Calendar, Tag, Image } from 'lucide-react';

type Platform = 'instagram' | 'facebook' | 'linkedin' | 'houzz';
type PostStatus = 'draft' | 'scheduled' | 'published';

interface SocialPost {
  id: string;
  platform: Platform;
  content: string;
  imageUrl?: string;
  status: PostStatus;
  scheduledAt?: string;
  projectId?: string;
  projectName?: string;
  tags?: string[];
  createdAt?: { toDate: () => Date } | null;
}

interface ProjectDoc { id: string; name: string; }

const PLATFORM_META: Record<Platform, { label: string; color: string; bg: string; icon: React.ElementType; maxChars: number }> = {
  instagram: { label: 'Instagram', color: '#e1306c', bg: 'linear-gradient(135deg,#f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%)', icon: Instagram, maxChars: 2200 },
  facebook: { label: 'Facebook', color: '#1877f2', bg: '#1877f2', icon: Facebook, maxChars: 63206 },
  linkedin: { label: 'LinkedIn', color: '#0a66c2', bg: '#0a66c2', icon: Linkedin, maxChars: 3000 },
  houzz: { label: 'Houzz', color: '#4dba87', bg: '#4dba87', icon: Home, maxChars: 10000 },
};

const STATUS_BADGE: Record<PostStatus, string> = {
  draft: 'bg-gray-100 text-gray-700 border-gray-200',
  scheduled: 'bg-blue-100 text-blue-700 border-blue-200',
  published: 'bg-green-100 text-green-700 border-green-200',
};

function fmtDate(post: SocialPost) {
  if (post.scheduledAt) {
    try { return new Date(post.scheduledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
    catch { return post.scheduledAt; }
  }
  if (!post.createdAt) return '—';
  try { return post.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  catch { return '—'; }
}

function PlatformAccent({ platform }: { platform: Platform }) {
  const meta = PLATFORM_META[platform];
  return (
    <div
      className="h-1.5 w-full rounded-t-xl"
      style={{ background: meta.bg }}
    />
  );
}

export default function SocialMedia() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [projects, setProjects] = useState<ProjectDoc[]>([]);
  const [filterPlatform, setFilterPlatform] = useState<Platform | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<PostStatus | 'all'>('all');

  const [showDialog, setShowDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    platform: 'instagram' as Platform,
    content: '',
    imageUrl: '',
    status: 'draft' as PostStatus,
    scheduledAt: '',
    projectId: '',
    projectName: '',
  });

  const charMax = PLATFORM_META[form.platform].maxChars;

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'socialPosts'), orderBy('createdAt', 'desc')),
      snap => setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() } as SocialPost)))
    );
    getDocs(collection(db, 'projects')).then(snap =>
      setProjects(snap.docs.map(d => ({ id: d.id, name: (d.data() as { name?: string }).name || 'Unnamed' })))
    );
    return () => unsub();
  }, []);

  const filtered = posts.filter(p => {
    if (filterPlatform !== 'all' && p.platform !== filterPlatform) return false;
    if (filterStatus !== 'all' && p.status !== filterStatus) return false;
    return true;
  });

  async function handleCreate() {
    if (!form.content) {
      toast({ title: 'Content is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const project = projects.find(p => p.id === form.projectId);
      await addDoc(collection(db, 'socialPosts'), {
        platform: form.platform,
        content: form.content,
        imageUrl: form.imageUrl || null,
        status: form.scheduledAt ? 'scheduled' : 'draft',
        scheduledAt: form.scheduledAt || null,
        projectId: form.projectId || null,
        projectName: project?.name || null,
        tags: [],
        createdBy: user?.id,
        createdByName: user?.name,
        createdAt: serverTimestamp(),
      });
      toast({ title: 'Post created' });
      setShowDialog(false);
      setForm({ platform: 'instagram', content: '', imageUrl: '', status: 'draft', scheduledAt: '', projectId: '', projectName: '' });
    } catch {
      toast({ title: 'Error', description: 'Could not create post.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Social Media</h1>
            <p className="text-sm text-gray-500 mt-0.5">Content planner and post management</p>
          </div>
          <Button onClick={() => setShowDialog(true)} style={{ backgroundColor: '#C9A96E' }} className="text-white hover:opacity-90 gap-2">
            <Plus className="w-4 h-4" /> Create Post
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          {/* Platform filter buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setFilterPlatform('all')}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${filterPlatform === 'all' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
            >
              All
            </button>
            {(Object.keys(PLATFORM_META) as Platform[]).map(p => {
              const meta = PLATFORM_META[p];
              const Icon = meta.icon;
              const active = filterPlatform === p;
              return (
                <button
                  key={p}
                  onClick={() => setFilterPlatform(p)}
                  className="px-3 py-1.5 rounded-full text-sm font-medium border flex items-center gap-1.5 transition-colors"
                  style={active ? { background: meta.color, color: '#fff', borderColor: meta.color } : { background: '#fff', color: '#374151', borderColor: '#e5e7eb' }}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {meta.label}
                </button>
              );
            })}
          </div>
          {/* Status filter */}
          <Select value={filterStatus} onValueChange={v => setFilterStatus(v as PostStatus | 'all')}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="published">Published</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Cards */}
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">No posts yet — create one above</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(post => {
              const meta = PLATFORM_META[post.platform] || PLATFORM_META.instagram;
              const Icon = meta.icon;
              return (
                <Card key={post.id} className="border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                  <PlatformAccent platform={post.platform} />
                  <CardContent className="p-4 space-y-3">
                    {/* Platform + status */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Icon className="w-4 h-4" style={{ color: meta.color }} />
                        <span className="text-sm font-medium" style={{ color: meta.color }}>{meta.label}</span>
                      </div>
                      <Badge className={`text-xs border capitalize ${STATUS_BADGE[post.status]}`}>{post.status}</Badge>
                    </div>

                    {/* Image thumbnail */}
                    {post.imageUrl && (
                      <img src={post.imageUrl} alt="Post" className="w-full h-32 object-cover rounded-lg" />
                    )}

                    {/* Content preview */}
                    <p className="text-sm text-gray-700 line-clamp-3">{post.content}</p>

                    {/* Meta row */}
                    <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                      {post.scheduledAt || post.createdAt ? (
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{fmtDate(post)}</span>
                      ) : null}
                      {post.projectName && (
                        <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{post.projectName}</span>
                      )}
                      {post.imageUrl && (
                        <span className="flex items-center gap-1"><Image className="w-3 h-3" />Image</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Post Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Post</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label>Platform</Label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(PLATFORM_META) as Platform[]).map(p => {
                  const meta = PLATFORM_META[p];
                  const Icon = meta.icon;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, platform: p }))}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors"
                      style={form.platform === p
                        ? { background: meta.color, color: '#fff', borderColor: meta.color }
                        : { background: '#fff', color: '#374151', borderColor: '#e5e7eb' }}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Content</Label>
              <Textarea
                placeholder="Write your post…"
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                rows={5}
                maxLength={charMax}
              />
              <p className={`text-xs text-right ${form.content.length > charMax * 0.9 ? 'text-red-500' : 'text-gray-400'}`}>
                {form.content.length} / {charMax.toLocaleString()}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select onValueChange={v => setForm(f => ({ ...f, projectId: v }))}>
                <SelectTrigger><SelectValue placeholder="Link to project (optional)" /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Schedule Date/Time (optional)</Label>
              <Input type="datetime-local" value={form.scheduledAt} onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Image URL (optional)</Label>
              <Input placeholder="https://…" value={form.imageUrl} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving} style={{ backgroundColor: '#C9A96E' }} className="text-white hover:opacity-90">
              {saving ? 'Creating…' : 'Create Post'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  collection, query, onSnapshot, addDoc, Timestamp, orderBy,
  getDocs,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import {
  Plus, Search, Grid3X3, List, FileText, Image, File, Download,
  Upload, FolderOpen,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// ── Types ────────────────────────────────────────────────────────────────────

type DocCategory = 'contract' | 'permit' | 'drawing' | 'photo' | 'report' | 'other';

interface DocumentDoc {
  id: string;
  projectId: string;
  projectName: string;
  name: string;
  fileUrl: string;
  fileType: string;
  category: DocCategory;
  uploadedBy: string;
  uploadedByName: string;
  visibleToClient: boolean;
  createdAt: Timestamp | null;
}

interface Project {
  id: string;
  name: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<DocCategory, string> = {
  contract: 'Contract',
  permit: 'Permit',
  drawing: 'Drawing',
  photo: 'Photo',
  report: 'Report',
  other: 'Other',
};

const CATEGORY_COLORS: Record<DocCategory, string> = {
  contract: 'bg-blue-100 text-blue-700 border-blue-200',
  permit: 'bg-amber-100 text-amber-700 border-amber-200',
  drawing: 'bg-purple-100 text-purple-700 border-purple-200',
  photo: 'bg-teal-100 text-teal-700 border-teal-200',
  report: 'bg-orange-100 text-orange-700 border-orange-200',
  other: 'bg-gray-100 text-gray-600 border-gray-200',
};

function fileTypeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return ext;
}

function FileIcon({ fileType, className = 'w-8 h-8' }: { fileType: string; className?: string }) {
  const images = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'svg'];
  const docs = ['doc', 'docx'];
  const pdfs = ['pdf'];

  if (pdfs.includes(fileType)) {
    return <FileText className={`${className} text-red-400`} />;
  }
  if (images.includes(fileType)) {
    return <Image className={`${className} text-blue-400`} />;
  }
  if (docs.includes(fileType)) {
    return <FileText className={`${className} text-purple-400`} />;
  }
  return <File className={`${className} text-gray-400`} />;
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Upload Dialog ────────────────────────────────────────────────────────────

interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  userId: string;
  userName: string;
}

function UploadDialog({ open, onClose, projects, userId, userName }: UploadDialogProps) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [projectId, setProjectId] = useState('');
  const [category, setCategory] = useState<DocCategory>('other');
  const [visibleToClient, setVisibleToClient] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setProjectId('');
      setCategory('other');
      setVisibleToClient(false);
      setFile(null);
      setProgress(0);
    }
  }, [open]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f && !name) setName(f.name.replace(/\.[^.]+$/, ''));
  }

  async function handleUpload() {
    if (!file || !projectId || !name) {
      toast({ title: 'Please fill all required fields and select a file.', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() ?? '';
      const storagePath = `documents/${projectId}/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, storagePath);
      const uploadTask = uploadBytesResumable(storageRef, file);

      await new Promise<void>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          snapshot => setProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)),
          reject,
          resolve,
        );
      });

      const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
      const proj = projects.find(p => p.id === projectId);

      await addDoc(collection(db, 'documents'), {
        projectId,
        projectName: proj?.name ?? '',
        name,
        fileUrl: downloadURL,
        fileType: ext,
        category,
        uploadedBy: userId,
        uploadedByName: userName,
        visibleToClient,
        createdAt: Timestamp.now(),
      });

      toast({ title: 'Document uploaded', description: name });
      onClose();
    } catch (e) {
      console.error(e);
      toast({ title: 'Upload failed', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Document Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Enter document name" />
          </div>
          <div className="space-y-1.5">
            <Label>Project *</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Category *</Label>
            <Select value={category} onValueChange={v => setCategory(v as DocCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CATEGORY_LABELS) as DocCategory[]).map(c => (
                  <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>File *</Label>
            <div
              className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center cursor-pointer hover:border-[#C9A96E]/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <FileIcon fileType={fileTypeFromName(file.name)} className="w-5 h-5" />
                  <span className="text-sm text-gray-700">{file.name}</span>
                  <span className="text-xs text-gray-400">{formatFileSize(file.size)}</span>
                </div>
              ) : (
                <div className="space-y-1">
                  <Upload className="w-6 h-6 text-gray-300 mx-auto" />
                  <p className="text-sm text-gray-400">Click to select file</p>
                </div>
              )}
              <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-gray-700">Visible to Client</p>
              <p className="text-xs text-gray-400">Client portal access</p>
            </div>
            <Switch checked={visibleToClient} onCheckedChange={setVisibleToClient} />
          </div>
          {uploading && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Uploading…</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-[#C9A96E] transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={uploading}>Cancel</Button>
          <Button
            onClick={handleUpload}
            disabled={uploading || !file}
            className="bg-[#C9A96E] hover:bg-[#b8934d] text-white"
          >
            {uploading ? 'Uploading…' : 'Upload'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Document Card ─────────────────────────────────────────────────────────────

function DocCard({ doc: d }: { doc: DocumentDoc }) {
  const ft = d.fileType || fileTypeFromName(d.name);

  return (
    <Card className="border-gray-200 hover:shadow-md transition-shadow group">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <FileIcon fileType={ft} className="w-8 h-8 shrink-0 mt-0.5" />
          <a
            href={d.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
            title="Download"
          >
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <Download className="w-3.5 h-3.5 text-gray-500" />
            </Button>
          </a>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-gray-800 leading-tight line-clamp-2">{d.name}</p>
          <p className="text-xs text-gray-500 truncate">{d.projectName}</p>
        </div>
        <div className="flex items-center justify-between">
          <Badge className={`${CATEGORY_COLORS[d.category]} text-xs`}>
            {CATEGORY_LABELS[d.category]}
          </Badge>
          <span className="text-xs text-gray-400">
            {d.createdAt
              ? d.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : '—'}
          </span>
        </div>
        {d.visibleToClient && (
          <Badge className="bg-teal-50 text-teal-700 border-teal-200 text-xs">Client visible</Badge>
        )}
      </CardContent>
    </Card>
  );
}

// ── Document Row ──────────────────────────────────────────────────────────────

function DocRow({ doc: d }: { doc: DocumentDoc }) {
  const ft = d.fileType || fileTypeFromName(d.name);
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors">
      <FileIcon fileType={ft} className="w-5 h-5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{d.name}</p>
        <p className="text-xs text-gray-400 truncate">{d.projectName}</p>
      </div>
      <Badge className={`${CATEGORY_COLORS[d.category]} text-xs shrink-0`}>
        {CATEGORY_LABELS[d.category]}
      </Badge>
      <span className="text-xs text-gray-400 shrink-0 hidden sm:block">
        {d.uploadedByName}
      </span>
      <span className="text-xs text-gray-400 shrink-0 hidden md:block">
        {d.createdAt
          ? d.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : '—'}
      </span>
      <a href={d.fileUrl} target="_blank" rel="noopener noreferrer">
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
          <Download className="w-3.5 h-3.5 text-gray-500" />
        </Button>
      </a>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function GlobalDocuments() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<DocumentDoc[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState('all');
  const [filterCategory, setFilterCategory] = useState<DocCategory | 'all'>('all');

  useEffect(() => {
    getDocs(collection(db, 'projects')).then(snap => {
      setProjects(snap.docs.map(d => ({ id: d.id, name: (d.data() as { name?: string }).name ?? d.id })));
    }).catch(console.error);
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'documents'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setDocuments(snap.docs.map(d => ({ id: d.id, ...d.data() } as DocumentDoc)));
    }, console.error);
    return () => unsub();
  }, []);

  const filtered = documents.filter(d => {
    if (filterProject !== 'all' && d.projectId !== filterProject) return false;
    if (filterCategory !== 'all' && d.category !== filterCategory) return false;
    if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
            <Badge className="bg-gray-100 text-gray-600 border-gray-200 font-semibold">
              <FolderOpen className="w-3 h-3 mr-1" />
              {documents.length} files
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 rounded-none ${viewMode === 'grid' ? 'bg-gray-100' : ''}`}
                onClick={() => setViewMode('grid')}
              >
                <Grid3X3 className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 rounded-none ${viewMode === 'list' ? 'bg-gray-100' : ''}`}
                onClick={() => setViewMode('list')}
              >
                <List className="w-3.5 h-3.5" />
              </Button>
            </div>
            <Button
              onClick={() => setUploadOpen(true)}
              className="bg-[#C9A96E] hover:bg-[#b8934d] text-white"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Upload
            </Button>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search documents…"
              className="pl-8 h-8 text-sm"
            />
          </div>

          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="w-44 h-8 text-xs">
              <SelectValue placeholder="All Projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterCategory} onValueChange={v => setFilterCategory(v as DocCategory | 'all')}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {(Object.keys(CATEGORY_LABELS) as DocCategory[]).map(c => (
                <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(search || filterProject !== 'all' || filterCategory !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-gray-500"
              onClick={() => { setSearch(''); setFilterProject('all'); setFilterCategory('all'); }}
            >
              Clear
            </Button>
          )}
        </div>

        {/* Content */}
        {filtered.length === 0 ? (
          <Card className="bg-gray-50 border-dashed">
            <CardContent className="py-14 text-center">
              <FolderOpen className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">
                {documents.length === 0 ? 'No documents yet. Upload your first file.' : 'No documents match your filters.'}
              </p>
            </CardContent>
          </Card>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {filtered.map(d => <DocCard key={d.id} doc={d} />)}
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            {/* List header */}
            <div className="hidden sm:grid px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500"
              style={{ gridTemplateColumns: '1.5rem 1fr 120px 140px 110px 2.5rem' }}>
              <span />
              <span>Name</span>
              <span>Category</span>
              <span className="hidden sm:block">Uploaded By</span>
              <span className="hidden md:block">Date</span>
              <span />
            </div>
            {filtered.map(d => <DocRow key={d.id} doc={d} />)}
          </div>
        )}
      </div>

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        projects={projects}
        userId={user ? String(user.id) : ''}
        userName={user?.name ?? ''}
      />
    </AppLayout>
  );
}

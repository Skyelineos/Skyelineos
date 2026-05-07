import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, addDoc, updateDoc, doc, orderBy, query as fsQuery, serverTimestamp, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Plus, ChevronDown, ChevronRight, Upload, ExternalLink,
  Trash2, Edit, BookMarked, Package, FileText, X, CheckCircle2,
  Lock, LockOpen, ShieldCheck
} from 'lucide-react';
import type { Selection, SelectionItem, DesignerFile } from '@/types/selections';
import {
  FLOOR_LEVELS, ROOMS_BY_FLOOR, SELECTION_CATEGORIES,
  AREAS_BY_CATEGORY, TILE_LAYOUTS, CLIENT_APPROVAL_STATUSES, ORDER_STATUSES
} from '@/types/selections';
import { nanoid } from 'nanoid';

interface SelectionsManagerProps {
  projectId: string;
  projectName?: string;
  designerId: string;
  userRole?: string;
  onSaveToCatalog?: (item: SelectionItem, sel: Selection) => void;
}

// ── Add/Edit Selection Modal ──────────────────────────────────────────────────

function SelectionFormModal({
  open, onClose, projectId, designerId, existing, onSaved
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  designerId: string;
  existing?: Selection;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [floor, setFloor] = useState(existing?.floor || 'Main Floor');
  const [room, setRoom] = useState(existing?.room || '');
  const [category, setCategory] = useState<string>(existing?.category || 'Tile');
  const [area, setArea] = useState(existing?.area || '');
  const [allowanceAmount, setAllowanceAmount] = useState(existing?.allowanceAmount?.toString() || '');
  const [allowanceUnit, setAllowanceUnit] = useState(existing?.allowanceUnit || 'per sqft');
  const [sqftOrQty, setSqftOrQty] = useState(existing?.sqftOrQuantity?.toString() || '');
  const [approvalStatus, setApprovalStatus] = useState<string>(existing?.clientApprovalStatus || 'Pending Options');
  const [orderStatus, setOrderStatus] = useState<string>(existing?.orderStatus || 'Not Ordered');
  const [notes, setNotes] = useState(existing?.notes || '');

  const roomOptions = ROOMS_BY_FLOOR[floor as keyof typeof ROOMS_BY_FLOOR] || [];
  const areaOptions = AREAS_BY_CATEGORY[category] || ['Custom'];

  const handleSave = async () => {
    if (!room || !area) { toast({ title: 'Room and area are required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const data = {
        projectId, floor, room, category, area,
        allowanceAmount: allowanceAmount ? parseFloat(allowanceAmount) : 0,
        allowanceUnit,
        sqftOrQuantity: sqftOrQty ? parseFloat(sqftOrQty) : null,
        clientApprovalStatus: approvalStatus,
        orderStatus,
        notes: notes || null,
        items: existing?.items || [],
        designerFiles: existing?.designerFiles || [],
        updatedAt: serverTimestamp(),
      };
      if (existing) {
        await updateDoc(doc(db, 'projects', projectId, 'selections', existing.id), data);
      } else {
        await addDoc(collection(db, 'projects', projectId, 'selections'), { ...data, createdAt: serverTimestamp() });
      }
      toast({ title: existing ? 'Selection updated' : 'Selection category added' });
      onSaved();
      onClose();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit Selection Category' : 'Add Selection Category'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Floor Level</Label>
              <Select value={floor} onValueChange={v => { setFloor(v); setRoom(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FLOOR_LEVELS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Room *</Label>
              <Select value={room} onValueChange={setRoom}>
                <SelectTrigger><SelectValue placeholder="Select room..." /></SelectTrigger>
                <SelectContent>
                  {roomOptions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  <SelectItem value="__custom__">Custom...</SelectItem>
                </SelectContent>
              </Select>
              {room === '__custom__' && <Input placeholder="Room name" onChange={e => setRoom(e.target.value)} className="mt-1" />}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={v => { setCategory(v); setArea(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SELECTION_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Area / Sub-location *</Label>
              <Select value={area} onValueChange={setArea}>
                <SelectTrigger><SelectValue placeholder="Select area..." /></SelectTrigger>
                <SelectContent>
                  {areaOptions.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  <SelectItem value="__custom__">Custom...</SelectItem>
                </SelectContent>
              </Select>
              {area === '__custom__' && <Input placeholder="Area name" onChange={e => setArea(e.target.value)} className="mt-1" />}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Allowance $</Label>
              <Input type="number" value={allowanceAmount} onChange={e => setAllowanceAmount(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Select value={allowanceUnit} onValueChange={setAllowanceUnit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['per sqft', 'per lft', 'per unit', 'lump sum', 'per piece'].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Sqft / Qty</Label>
              <Input type="number" value={sqftOrQty} onChange={e => setSqftOrQty(e.target.value)} placeholder="—" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Client Approval</Label>
              <Select value={approvalStatus} onValueChange={setApprovalStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CLIENT_APPROVAL_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Order Status</Label>
              <Select value={orderStatus} onValueChange={setOrderStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ORDER_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Special instructions, client requests, etc." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !room || !area}
            style={{ backgroundColor: '#C9A96E', color: '#141414' }}>
            {saving ? 'Saving...' : (existing ? 'Update' : 'Add Category')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add Item Modal ────────────────────────────────────────────────────────────

function AddItemModal({
  open, onClose, selection, designerId, onSaved, onSaveToCatalog
}: {
  open: boolean;
  onClose: () => void;
  selection: Selection;
  designerId: string;
  onSaved: () => void;
  onSaveToCatalog?: (item: SelectionItem) => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [productName, setProductName] = useState('');
  const [vendor, setVendor] = useState('');
  const [size, setSize] = useState('');
  const [tileLayout, setTileLayout] = useState('');
  const [trim, setTrim] = useState('');
  const [grout, setGrout] = useState('');
  const [heightNote, setHeightNote] = useState('');
  const [costPerUnit, setCostPerUnit] = useState('');
  const [unit, setUnit] = useState('sqft');
  const [sqftOrQty, setSqftOrQty] = useState('');
  const [productUrl, setProductUrl] = useState('');
  const [specialNotes, setSpecialNotes] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);

  const totalCost = costPerUnit && sqftOrQty ? parseFloat(costPerUnit) * parseFloat(sqftOrQty) : 0;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const urls = await Promise.all(files.map(async file => {
        const path = `selections/${selection.projectId}/${selection.id}/${Date.now()}-${file.name}`;
        const snap = await uploadBytes(ref(storage, path), file);
        return getDownloadURL(snap.ref);
      }));
      setImageUrls(prev => [...prev, ...urls]);
      toast({ title: `${urls.length} image${urls.length > 1 ? 's' : ''} uploaded` });
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    } finally { setUploading(false); }
  };

  const handleSave = async () => {
    if (!productName.trim()) { toast({ title: 'Product name is required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const newItem: SelectionItem = {
        id: nanoid(),
        productName: productName.trim(),
        vendor: vendor.trim(),
        size: size.trim(),
        tileLayout: tileLayout || undefined,
        trim: trim.trim() || undefined,
        grout: grout.trim() || undefined,
        heightNote: heightNote.trim() || undefined,
        costPerUnit: costPerUnit ? parseFloat(costPerUnit) : 0,
        unit: unit || 'sqft',
        sqftOrQty: sqftOrQty ? parseFloat(sqftOrQty) : undefined,
        totalCost: totalCost || undefined,
        productUrl: productUrl.trim() || undefined,
        imageUrls,
        layoutImageUrls: [],
        specialNotes: specialNotes.trim() || undefined,
        status: 'proposed',
        proposedBy: designerId,
        proposedAt: new Date().toISOString(),
      };
      const updatedItems = [...(selection.items || []), newItem];
      await updateDoc(doc(db, 'projects', selection.projectId, 'selections', selection.id), {
        items: updatedItems,
        clientApprovalStatus: 'Checking w/ Client',
        updatedAt: serverTimestamp(),
      });
      toast({ title: 'Product added', description: 'Client will be notified to review.' });
      if (onSaveToCatalog) onSaveToCatalog(newItem);
      onSaved();
      onClose();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Product — {selection?.room} {selection?.area}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Product Name * <span className="text-gray-400 font-normal">(include vendor)</span></Label>
            <Input value={productName} onChange={e => setProductName(e.target.value)}
              placeholder="Edward Martin - Leona 24x24 Matte Porcelain Tile - Calacatta" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Vendor / Brand</Label>
              <Input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Edward Martin" />
            </div>
            <div className="space-y-1.5">
              <Label>Size / Dimensions</Label>
              <Input value={size} onChange={e => setSize(e.target.value)} placeholder='24x24, 3x8, 12"x24"' />
            </div>
          </div>

          {/* Tile-specific fields */}
          {selection?.category === 'Tile' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Tile Layout / Pattern</Label>
                  <Select value={tileLayout} onValueChange={setTileLayout}>
                    <SelectTrigger><SelectValue placeholder="Select pattern..." /></SelectTrigger>
                    <SelectContent>
                      {TILE_LAYOUTS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Schluter / Trim</Label>
                  <Input value={trim} onChange={e => setTrim(e.target.value)} placeholder="Rondec, Jolly, etc." />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Grout</Label>
                  <Input value={grout} onChange={e => setGrout(e.target.value)} placeholder="Mapei Alabaster" />
                </div>
                <div className="space-y-1.5">
                  <Label>Height / Extent</Label>
                  <Input value={heightNote} onChange={e => setHeightNote(e.target.value)} placeholder="To ceiling, 18&quot; return..." />
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Cost per unit</Label>
              <Input type="number" value={costPerUnit} onChange={e => setCostPerUnit(e.target.value)} placeholder="5.63" />
            </div>
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['sqft', 'lft', 'each', 'per piece', 'per tile', 'per box'].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Qty / Sqft</Label>
              <Input type="number" value={sqftOrQty} onChange={e => setSqftOrQty(e.target.value)} placeholder="285" />
            </div>
          </div>

          {totalCost > 0 && (
            <div className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
              Estimated total: <strong>${totalCost.toLocaleString()}</strong>
              {selection?.allowanceAmount > 0 && (
                <span className={totalCost > selection.allowanceAmount ? ' text-orange-600' : ' text-green-600'}>
                  {' '}({totalCost > selection.allowanceAmount
                    ? `$${(totalCost - selection.allowanceAmount).toLocaleString()} over allowance`
                    : `within $${selection.allowanceAmount.toLocaleString()} allowance`})
                </span>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Product URL</Label>
            <Input value={productUrl} onChange={e => setProductUrl(e.target.value)} placeholder="https://www.edwardmartin.com/..." />
          </div>

          {/* Image upload */}
          <div className="space-y-1.5">
            <Label>Product Images</Label>
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center">
              <input type="file" accept="image/*" multiple onChange={handleImageUpload}
                className="hidden" id="item-images" />
              <label htmlFor="item-images" className="cursor-pointer">
                <Upload className="h-6 w-6 text-gray-300 mx-auto mb-1" />
                <p className="text-xs text-gray-400">{uploading ? 'Uploading...' : 'Click to upload product images'}</p>
              </label>
            </div>
            {imageUrls.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {imageUrls.map((url, i) => (
                  <div key={i} className="relative">
                    <img src={url} alt="" className="w-16 h-16 rounded-lg object-cover" />
                    <button onClick={() => setImageUrls(prev => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-xs">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Special Notes</Label>
            <Textarea value={specialNotes} onChange={e => setSpecialNotes(e.target.value)} rows={2}
              placeholder="CLIENT WANTS HEATED FLOOR, etc." />
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {onSaveToCatalog && (
            <Button variant="outline" onClick={() => {}} className="text-purple-600 border-purple-200">
              <BookMarked className="h-4 w-4 mr-1" /> Save to Catalog too
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving || uploading || !productName.trim()}
            style={{ backgroundColor: '#C9A96E', color: '#141414' }}>
            {saving ? 'Adding...' : 'Add Product'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Designer File Upload ──────────────────────────────────────────────────────

function DesignerFileUpload({ selection, designerId, onUploaded }: {
  selection: Selection;
  designerId: string;
  onUploaded: () => void;
}) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const newFiles = await Promise.all(files.map(async file => {
        const path = `designer-files/${selection.projectId}/${selection.id}/${Date.now()}-${file.name}`;
        const snap = await uploadBytes(ref(storage, path), file);
        const url = await getDownloadURL(snap.ref);
        return {
          id: nanoid(),
          name: file.name,
          type: file.type === 'application/pdf' ? 'pdf' : 'image',
          url,
          uploadedBy: designerId,
          uploadedAt: new Date().toISOString(),
        } as DesignerFile;
      }));
      const updatedFiles = [...(selection.designerFiles || []), ...newFiles];
      await updateDoc(doc(db, 'projects', selection.projectId, 'selections', selection.id), {
        designerFiles: updatedFiles,
        updatedAt: serverTimestamp(),
      });
      toast({ title: `${newFiles.length} file${newFiles.length > 1 ? 's' : ''} uploaded` });
      onUploaded();
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    } finally { setUploading(false); }
  };

  return (
    <div className="flex items-center gap-2">
      <input type="file" accept=".pdf,image/*" multiple onChange={handleUpload}
        className="hidden" id={`file-upload-${selection.id}`} />
      <label htmlFor={`file-upload-${selection.id}`}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 cursor-pointer border border-gray-200 rounded-lg px-2 py-1 hover:border-gray-300 transition-colors">
        <Upload className="h-3 w-3" />
        {uploading ? 'Uploading...' : 'Upload PDF / Image'}
      </label>
    </div>
  );
}

// ── Finalize / Lock Modal ─────────────────────────────────────────────────────

function FinalizeModal({
  open, onClose, selection, gcUid, onDone
}: {
  open: boolean;
  onClose: () => void;
  selection: Selection | null;
  gcUid: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [initials, setInitials] = useState('');
  const [saving, setSaving] = useState(false);

  const handleFinalize = async () => {
    if (!selection) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'projects', selection.projectId, 'selections', selection.id), {
        locked: true,
        lockedAt: serverTimestamp(),
        lockedBy: gcUid,
        clientInitials: initials.trim() || null,
        updatedAt: serverTimestamp(),
      });
      toast({ title: 'Selection finalized', description: `${selection.room} — ${selection.area} is now locked.` });
      onDone();
      onClose();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
      setInitials('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-green-600" /> Finalize Selection
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 text-sm text-gray-600">
          <p>
            Locking <strong>{selection?.room} — {selection?.area}</strong> will prevent further edits by the designer.
            Order status can still be updated.
          </p>
          <div className="space-y-1.5">
            <Label>Client Initials <span className="text-gray-400 font-normal">(optional)</span></Label>
            <Input
              value={initials}
              onChange={e => setInitials(e.target.value.toUpperCase().slice(0, 4))}
              placeholder="e.g. AJ"
              maxLength={4}
              className="w-24 uppercase font-mono tracking-widest"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleFinalize} disabled={saving}
            style={{ backgroundColor: '#C9A96E', color: '#141414' }}>
            <Lock className="h-3.5 w-3.5 mr-1.5" />
            {saving ? 'Locking...' : 'Finalize & Lock'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function SelectionsManager({ projectId, projectName, designerId, userRole, onSaveToCatalog }: SelectionsManagerProps) {
  const queryClient = useQueryClient();
  const isGC = userRole === 'gc' || userRole === 'admin';
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [editingSelection, setEditingSelection] = useState<Selection | null>(null);
  const [addItemTo, setAddItemTo] = useState<Selection | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [floorFilter, setFloorFilter] = useState('All');
  const [finalizeTarget, setFinalizeTarget] = useState<Selection | null>(null);
  const [unlockTarget, setUnlockTarget] = useState<Selection | null>(null);
  const [lockingAll, setLockingAll] = useState(false);
  const { toast } = useToast();

  const { data: selections = [], isLoading } = useQuery({
    queryKey: ['selections', projectId],
    queryFn: async () => {
      const snap = await getDocs(fsQuery(
        collection(db, 'projects', projectId, 'selections'),
        orderBy('floor', 'asc'),
        orderBy('createdAt', 'asc')
      ));
      return snap.docs.map(d => ({ id: d.id, ...d.data() })) as Selection[];
    },
    enabled: !!projectId,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['selections', projectId] });

  const handleUnlock = async (sel: Selection) => {
    try {
      await updateDoc(doc(db, 'projects', projectId, 'selections', sel.id), {
        locked: false,
        lockedAt: null,
        lockedBy: null,
        updatedAt: serverTimestamp(),
      });
      toast({ title: 'Selection unlocked', description: `${sel.room} — ${sel.area} can now be edited.` });
      refresh();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setUnlockTarget(null);
    }
  };

  const handleLockAllApproved = async () => {
    const toLock = selections.filter(s => s.clientApprovalStatus === 'Approved' && !s.locked);
    if (!toLock.length) return;
    setLockingAll(true);
    try {
      const batch = writeBatch(db);
      toLock.forEach(sel => {
        batch.update(doc(db, 'projects', projectId, 'selections', sel.id), {
          locked: true,
          lockedAt: serverTimestamp(),
          lockedBy: designerId,
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
      toast({ title: `${tolock.length} selection${tolock.length > 1 ? 's' : ''} finalized` });
      refresh();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setLockingAll(false);
    }
  };

  const toggle = (id: string) => setExpandedIds(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const filtered = floorFilter === 'All' ? selections : selections.filter(s => s.floor === floorFilter);
  const grouped = FLOOR_LEVELS.reduce((acc, floor) => {
    const items = filtered.filter(s => s.floor === floor);
    if (items.length) acc[floor] = items;
    return acc;
  }, {} as Record<string, Selection[]>);

  if (!projectId) return (
    <div className="text-center py-10 text-gray-400 text-sm">Select a project to manage selections.</div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Selections Manager</h3>
          <p className="text-sm text-gray-500">{projectName || 'Project'} · {selections.length} categories</p>
        </div>
        <div className="flex items-center gap-2">
          {isGC && selections.some(s => s.clientApprovalStatus === 'Approved' && !s.locked) && (
            <Button variant="outline" size="sm" onClick={handleLockAllApproved} disabled={lockingAll}
              className="text-slate-600 border-slate-300 hover:bg-slate-50">
              <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
              {lockingAll ? 'Locking...' : 'Lock All Approved'}
            </Button>
          )}
          <Button onClick={() => setShowAddCategory(true)} style={{ backgroundColor: '#C9A96E', color: '#141414' }}>
            <Plus className="h-4 w-4 mr-1" /> Add Category
          </Button>
        </div>
      </div>

      {/* Floor filter */}
      <div className="flex gap-2 flex-wrap">
        {['All', ...FLOOR_LEVELS].map(f => (
          <button key={f} onClick={() => setFloorFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${floorFilter === f ? 'border-amber-400 bg-amber-50 text-amber-700 font-medium' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
            {f}
          </button>
        ))}
      </div>

      {isLoading && <div className="text-center py-8 text-gray-400 text-sm">Loading...</div>}

      {/* Floor groups */}
      {Object.entries(grouped).map(([floor, sels]) => (
        <div key={floor}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{floor}</p>
          <div className="space-y-2">
            {sels.map(sel => (
              <Card key={sel.id} className="overflow-hidden">
                {/* Selection header */}
                <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
                  onClick={() => toggle(sel.id)}>
                  <div className="flex items-center gap-3 min-w-0">
                    {expandedIds.has(sel.id) ? <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />}
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-gray-800">{sel.room}</span>
                      <span className="text-gray-400 mx-1.5">·</span>
                      <span className="text-sm text-gray-600">{sel.area}</span>
                      <span className="text-xs text-gray-400 ml-2">({sel.category})</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {sel.allowanceAmount > 0 && (
                      <span className="text-xs text-gray-400 hidden sm:inline">${sel.allowanceAmount.toLocaleString()} allowance</span>
                    )}
                    {sel.locked ? (
                      <Badge className="text-xs bg-slate-100 text-slate-600 flex items-center gap-1">
                        <Lock className="h-2.5 w-2.5" /> Finalized
                      </Badge>
                    ) : (
                      <Badge className={`text-xs ${sel.clientApprovalStatus === 'Approved' ? 'bg-green-100 text-green-700' : sel.clientApprovalStatus === 'Checking w/ Client' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                        {sel.clientApprovalStatus}
                      </Badge>
                    )}
                    <Badge className={`text-xs ${sel.orderStatus === 'Ordered' ? 'bg-blue-100 text-blue-700' : sel.orderStatus === 'Installed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {sel.orderStatus}
                    </Badge>
                    {isGC && sel.locked && (
                      <button onClick={e => { e.stopPropagation(); setUnlockTarget(sel); }}
                        title="Unlock selection"
                        className="p-1 text-slate-400 hover:text-slate-600 rounded">
                        <LockOpen className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {!sel.locked && (
                      <button onClick={e => { e.stopPropagation(); setEditingSelection(sel); }}
                        className="p-1 text-gray-400 hover:text-gray-600 rounded">
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded */}
                {expandedIds.has(sel.id) && (
                  <CardContent className="pt-0 border-t border-gray-100">
                    {sel.notes && (
                      <p className="text-xs text-gray-500 italic border-l-2 border-amber-300 pl-2 my-2">{sel.notes}</p>
                    )}

                    {/* Designer files */}
                    {sel.designerFiles?.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {sel.designerFiles.map(f => (
                          <a key={f.id} href={f.url} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 rounded-lg px-2 py-1.5 hover:underline">
                            <FileText className="h-3 w-3" /> {f.name}
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Items */}
                    <div className="space-y-2 mb-3">
                      {sel.items.filter(i => i.status !== 'removed').map(item => (
                        <div key={item.id} className={`rounded-lg border p-3 ${item.status === 'approved' ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
                          <div className="flex gap-3">
                            {item.imageUrls?.[0] && (
                              <img src={item.imageUrls[0]} alt={item.productName}
                                className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-medium text-gray-900 leading-snug">{item.productName}</p>
                                <div className="text-right flex-shrink-0">
                                  {item.costPerUnit > 0 && <p className="text-xs font-semibold">${item.costPerUnit}/{item.unit}</p>}
                                  {item.totalCost > 0 && <p className="text-xs text-gray-400">${item.totalCost.toLocaleString()} total</p>}
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-400 mt-1">
                                {item.size && <span>{item.size}</span>}
                                {item.tileLayout && <span>Layout: {item.tileLayout}</span>}
                                {item.grout && <span>Grout: {item.grout}</span>}
                                {item.sqftOrQty && <span>{item.sqftOrQty} {item.unit}</span>}
                              </div>
                              {item.specialNotes && <p className="text-xs text-orange-600 mt-1">{item.specialNotes}</p>}
                              <div className="flex items-center gap-3 mt-1.5">
                                {item.productUrl && (
                                  <a href={item.productUrl} target="_blank" rel="noreferrer"
                                    className="text-xs text-blue-500 hover:underline flex items-center gap-0.5">
                                    <ExternalLink className="h-3 w-3" /> Link
                                  </a>
                                )}
                                {item.status === 'approved' && (
                                  <span className="text-xs text-green-600 flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3" /> Client approved
                                  </span>
                                )}
                                {onSaveToCatalog && (
                                  <button onClick={() => onSaveToCatalog(item, sel)}
                                    className="text-xs text-purple-500 hover:underline flex items-center gap-0.5">
                                    <BookMarked className="h-3 w-3" /> Save to catalog
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-2 border-t border-gray-100 flex-wrap">
                      {!sel.locked && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setAddItemTo(sel)}>
                            <Plus className="h-3.5 w-3.5 mr-1" /> Add Product
                          </Button>
                          <DesignerFileUpload selection={sel} designerId={designerId} onUploaded={refresh} />
                        </>
                      )}
                      {sel.locked && (
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Lock className="h-3 w-3" /> Locked — design is finalized
                        </span>
                      )}
                      {isGC && !sel.locked && sel.clientApprovalStatus === 'Approved' && (
                        <Button size="sm" variant="outline" onClick={() => setFinalizeTarget(sel)}
                          className="ml-auto text-green-700 border-green-300 hover:bg-green-50">
                          <ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> Finalize & Lock
                        </Button>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        </div>
      ))}

      {selections.length === 0 && !isLoading && (
        <div className="text-center py-12 text-gray-400">
          <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="font-medium">No selection categories yet</p>
          <p className="text-sm mt-1">Click "Add Category" to start posting selections for this project.</p>
        </div>
      )}

      {/* Modals */}
      <SelectionFormModal
        open={showAddCategory} onClose={() => setShowAddCategory(false)}
        projectId={projectId} designerId={designerId} onSaved={refresh}
      />
      {editingSelection && (
        <SelectionFormModal
          open={!!editingSelection} onClose={() => setEditingSelection(null)}
          projectId={projectId} designerId={designerId}
          existing={editingSelection} onSaved={refresh}
        />
      )}
      {addItemTo && (
        <AddItemModal
          open={!!addItemTo} onClose={() => setAddItemTo(null)}
          selection={addItemTo} designerId={designerId}
          onSaved={refresh}
          onSaveToCatalog={onSaveToCatalog ? (item) => onSaveToCatalog(item, addItemTo) : undefined}
        />
      )}
      <FinalizeModal
        open={!!finalizeTarget} onClose={() => setFinalizeTarget(null)}
        selection={finalizeTarget} gcUid={designerId} onDone={refresh}
      />
      {/* Unlock confirm */}
      <Dialog open={!!unlockTarget} onOpenChange={() => setUnlockTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LockOpen className="h-5 w-5 text-amber-600" /> Unlock Selection
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 py-2">
            Unlock <strong>{unlockTarget?.room} — {unlockTarget?.area}</strong>? The designer will be able to make changes again.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnlockTarget(null)}>Cancel</Button>
            <Button onClick={() => unlockTarget && handleUnlock(unlockTarget)}
              className="bg-amber-500 hover:bg-amber-600 text-white">
              <LockOpen className="h-3.5 w-3.5 mr-1.5" /> Unlock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

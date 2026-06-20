// Designer Portal — Mood Board panel for one room.
import { useMemo, useState } from 'react';
import {
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Maximize2,
  Plus,
  Send,
  Trash2,
  X,
  Check,
  RotateCcw,
  Palette,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';
import { uploadRFIAttachment } from '@/lib/rfi/upload';
import {
  MOODBOARD_CATEGORIES,
  type MoodBoard,
  type MoodBoardItem,
  type MoodBoardStatus,
} from '@/lib/designer/portalTypes';
import {
  addMoodBoardItem,
  createMoodBoard,
  deleteMoodBoard,
  notifyClientDecided,
  notifyDesignReviewRequested,
  removeMoodBoardItem,
  setMoodBoardStatus,
  updateMoodBoardItem,
} from '@/lib/designer/portalService';
import { AiActionsMenu } from './AiActionsMenu';
import { Dropzone, EmptyState, StatusBadge } from './shared';

interface Props {
  projectId: string;
  projectName: string;
  roomId: string;
  roomName: string;
  boards: MoodBoard[];
  canEdit: boolean;
  canReview: boolean;
}

export function MoodBoardPanel({
  projectId,
  projectName,
  roomId,
  roomName,
  boards,
  canEdit,
  canReview,
}: Props) {
  const { toast } = useToast();
  const board = boards[0]; // one required mood board per room (spec)
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState(`${roomName} Mood Board`);
  const [direction, setDirection] = useState('');
  const [presenting, setPresenting] = useState(false);
  const [revisionNote, setRevisionNote] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  async function handleCreate() {
    try {
      await createMoodBoard(projectId, {
        roomId,
        roomName,
        title: title.trim() || `${roomName} Mood Board`,
        designDirection: direction,
      });
      setCreating(false);
      toast({ title: 'Mood board created' });
    } catch (e: any) {
      toast({
        title: 'Could not create mood board',
        description: e?.message,
        variant: 'destructive',
      });
    }
  }

  async function changeStatus(status: MoodBoardStatus, note?: string) {
    try {
      await setMoodBoardStatus(projectId, board.id, status, note);
      toast({ title: `Mood board: ${status}` });
      // Notify the loop: designer → client on send-to-review, client → staff on decision.
      const vars = { itemName: board.title, room: roomName, projectName };
      if (status === 'Client Review') {
        void notifyDesignReviewRequested(projectId, vars);
      } else if (canReview && status === 'Approved') {
        void notifyClientDecided(projectId, { ...vars, decision: 'approved' });
      } else if (canReview && status === 'Revision Requested') {
        void notifyClientDecided(projectId, {
          ...vars,
          decision: 'requested a revision on',
        });
      }
    } catch (e: any) {
      toast({
        title: 'Update failed',
        description: e?.message,
        variant: 'destructive',
      });
    }
  }

  if (!board) {
    if (!canEdit) {
      return (
        <EmptyState
          icon={Palette}
          title="No mood board yet"
          hint="The designer hasn't started a mood board for this room."
        />
      );
    }
    return (
      <div className="max-w-lg">
        {!creating ? (
          <EmptyState
            icon={Palette}
            title="No mood board for this room"
            hint="Every room needs one mood board to set the design direction."
            action={
              <Button onClick={() => setCreating(true)} className="gap-1.5">
                <Plus className="w-4 h-4" /> Create Mood Board
              </Button>
            }
          />
        ) : (
          <div className="space-y-3 rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900">
              New mood board — {roomName}
            </h3>
            <div>
              <span className="mb-1 block text-xs font-medium text-gray-500">
                Title
              </span>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-gray-500">
                Design direction
              </span>
              <Textarea
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
                placeholder="Describe the look & feel for this room…"
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate}>Create</Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Board header */}
      <div className="rounded-xl border border-gray-200 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-900 truncate">
                {board.title}
              </h3>
              <StatusBadge status={board.status} />
            </div>
            {board.designDirection && (
              <p className="text-sm text-gray-600 mt-1 max-w-2xl">
                {board.designDirection}
              </p>
            )}
            {board.status === 'Revision Requested' && board.revisionNotes && (
              <p className="text-sm text-red-600 mt-2">
                <span className="font-medium">Revision requested:</span>{' '}
                {board.revisionNotes}
              </p>
            )}
            {board.status === 'Approved' && board.approvedByName && (
              <p className="text-xs text-emerald-600 mt-2">
                Approved by {board.approvedByName}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setPresenting(true)}
              disabled={!board.items?.length}
            >
              <Maximize2 className="w-4 h-4" /> Present
            </Button>
            <AiActionsMenu
              scope="moodBoard"
              context={{ projectId, roomId, roomName, moodBoardId: board.id }}
            />
            {canEdit && (
              <>
                {(board.status === 'Draft' ||
                  board.status === 'Revision Requested') && (
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => changeStatus('Ready For Review')}
                  >
                    <Send className="w-4 h-4" /> Submit for review
                  </Button>
                )}
                {board.status === 'Ready For Review' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => changeStatus('Client Review')}
                  >
                    Send to client
                  </Button>
                )}
              </>
            )}
            {canReview &&
              (board.status === 'Client Review' ||
                board.status === 'Ready For Review') && (
                <>
                  <Button
                    size="sm"
                    className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => changeStatus('Approved')}
                  >
                    <Check className="w-4 h-4" /> Approve board
                  </Button>
                  <RequestRevision
                    onSubmit={(note) =>
                      changeStatus('Revision Requested', note)
                    }
                    value={revisionNote}
                    setValue={setRevisionNote}
                  />
                </>
              )}
          </div>
        </div>
      </div>

      {/* Items */}
      <MoodBoardItems
        projectId={projectId}
        board={board}
        canEdit={canEdit}
        canReview={canReview}
        showAdd={showAdd}
        setShowAdd={setShowAdd}
      />

      {canEdit &&
        (board.status === 'Draft' || board.status === 'Revision Requested') && (
          <Button
            variant="outline"
            className="gap-2 border-dashed text-gray-400"
            onClick={() =>
              setMoodBoardDeleteConfirm(projectId, board.id, toast)
            }
          >
            <Trash2 className="w-4 h-4" /> Delete mood board
          </Button>
        )}

      {/* Presentation mode */}
      <Dialog open={presenting} onOpenChange={setPresenting}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {board.title} — {roomName}
            </DialogTitle>
          </DialogHeader>
          {board.designDirection && (
            <p className="text-sm text-gray-600">{board.designDirection}</p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-[70vh] overflow-auto pr-1">
            {(board.items || [])
              .filter((i) => i.imageUrl)
              .map((i) => (
                <figure
                  key={i.id}
                  className="rounded-lg overflow-hidden border border-gray-100"
                >
                  <img
                    src={i.imageUrl}
                    alt={i.title}
                    className="w-full h-44 object-cover"
                  />
                  <figcaption className="p-2 text-xs">
                    <span className="font-medium text-gray-800">{i.title}</span>
                    <span className="block text-gray-400">
                      {i.category}
                      {i.price != null ? ` · ${formatCurrency(i.price)}` : ''}
                    </span>
                  </figcaption>
                </figure>
              ))}
          </div>
          {!board.items?.some((i) => i.imageUrl) && (
            <p className="text-sm text-gray-400 py-8 text-center">
              No images to present yet.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

async function setMoodBoardDeleteConfirm(
  projectId: string,
  boardId: string,
  toast: ReturnType<typeof useToast>['toast']
) {
  if (
    !window.confirm(
      'Delete this mood board and all its items? This cannot be undone.'
    )
  )
    return;
  try {
    await deleteMoodBoard(projectId, boardId);
    toast({ title: 'Mood board deleted' });
  } catch (e: any) {
    toast({
      title: 'Delete failed',
      description: e?.message,
      variant: 'destructive',
    });
  }
}

function RequestRevision({
  onSubmit,
  value,
  setValue,
}: {
  onSubmit: (note: string) => void;
  value: string;
  setValue: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5 text-red-600 border-red-200"
        onClick={() => setOpen(true)}
      >
        <RotateCcw className="w-4 h-4" /> Request revision
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request a revision</DialogTitle>
          </DialogHeader>
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="What would you like changed?"
            rows={4}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                onSubmit(value);
                setValue('');
                setOpen(false);
              }}
              disabled={!value.trim()}
            >
              Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Items grid grouped by category ──────────────────────────────────────────
function MoodBoardItems({
  projectId,
  board,
  canEdit,
  canReview,
  showAdd,
  setShowAdd,
}: {
  projectId: string;
  board: MoodBoard;
  canEdit: boolean;
  canReview: boolean;
  showAdd: boolean;
  setShowAdd: (v: boolean) => void;
}) {
  const grouped = useMemo(() => {
    const m = new Map<string, MoodBoardItem[]>();
    for (const it of board.items || []) {
      const k = it.category || 'Custom';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(it);
    }
    return Array.from(m.entries());
  }, [board.items]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-widest">
          Items ({board.items?.length || 0})
        </h4>
        {canEdit && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setShowAdd(true)}
          >
            <Plus className="w-4 h-4" /> Add item
          </Button>
        )}
      </div>

      {!board.items?.length && (
        <EmptyState
          icon={ImageIcon}
          title="No items yet"
          hint={
            canEdit
              ? 'Add inspiration images, products, and links.'
              : 'The designer is still curating this board.'
          }
        />
      )}

      {grouped.map(([cat, items]) => (
        <div key={cat}>
          <p className="text-xs font-semibold text-gray-400 mb-2">{cat}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <ItemCard
                key={item.id}
                projectId={projectId}
                board={board}
                item={item}
                canEdit={canEdit}
                canReview={canReview}
              />
            ))}
          </div>
        </div>
      ))}

      {showAdd && (
        <AddItemDialog
          projectId={projectId}
          board={board}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}

function ItemCard({
  projectId,
  board,
  item,
  canEdit,
  canReview,
}: {
  projectId: string;
  board: MoodBoard;
  item: MoodBoardItem;
  canEdit: boolean;
  canReview: boolean;
}) {
  const { toast } = useToast();
  async function setApproval(approvalStatus: MoodBoardItem['approvalStatus']) {
    try {
      await updateMoodBoardItem(projectId, board, item.id, { approvalStatus });
    } catch (e: any) {
      toast({
        title: 'Update failed',
        description: e?.message,
        variant: 'destructive',
      });
    }
  }
  async function remove() {
    if (!window.confirm('Remove this item?')) return;
    await removeMoodBoardItem(projectId, board, item.id).catch((e: any) =>
      toast({
        title: 'Remove failed',
        description: e?.message,
        variant: 'destructive',
      })
    );
  }
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden bg-white flex flex-col">
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt={item.title}
          className="w-full h-40 object-cover"
        />
      ) : (
        <div className="w-full h-40 bg-gray-50 flex items-center justify-center">
          <ImageIcon className="w-8 h-8 text-gray-200" />
        </div>
      )}
      <div className="p-3 flex-1 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-gray-900 text-sm leading-tight">
            {item.title}
          </p>
          <StatusBadge status={item.approvalStatus} />
        </div>
        {(item.vendor || item.manufacturer) && (
          <p className="text-xs text-gray-500">
            {[item.manufacturer, item.vendor].filter(Boolean).join(' · ')}
          </p>
        )}
        {item.sku && <p className="text-xs text-gray-400">SKU {item.sku}</p>}
        {item.price != null && (
          <p className="text-xs font-semibold text-gray-700">
            {formatCurrency(item.price)}
          </p>
        )}
        {item.notes && <p className="text-xs text-gray-500">{item.notes}</p>}
        <div className="flex flex-wrap gap-2 mt-1">
          {item.productUrl && (
            <a
              href={item.productUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-600 inline-flex items-center gap-0.5"
            >
              <ExternalLink className="w-3 h-3" /> Product
            </a>
          )}
          {item.vendorUrl && (
            <a
              href={item.vendorUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-600 inline-flex items-center gap-0.5"
            >
              <ExternalLink className="w-3 h-3" /> Vendor
            </a>
          )}
          {item.specSheetUrl && (
            <a
              href={item.specSheetUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-600 inline-flex items-center gap-0.5"
            >
              <FileText className="w-3 h-3" /> Spec
            </a>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-auto pt-2">
          {canReview && (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-emerald-600"
                onClick={() => setApproval('approved')}
              >
                <Check className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-orange-600"
                onClick={() => setApproval('needsRevision')}
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-red-600"
                onClick={() => setApproval('rejected')}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </>
          )}
          {canEdit && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-gray-400 ml-auto"
              onClick={remove}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function AddItemDialog({
  projectId,
  board,
  onClose,
}: {
  projectId: string;
  board: MoodBoard;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    category: 'Custom',
    title: '',
    imageUrl: '',
    productUrl: '',
    vendorUrl: '',
    specSheetUrl: '',
    vendor: '',
    manufacturer: '',
    sku: '',
    price: '',
    notes: '',
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function onUpload(files: File[]) {
    const file = files[0];
    if (!file) return;
    setUploading(true);
    try {
      const att = await uploadRFIAttachment(projectId, file);
      set('imageUrl', att.url);
    } catch (e: any) {
      toast({
        title: 'Upload failed',
        description: e?.message,
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!form.title.trim()) {
      toast({ title: 'Add a title', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await addMoodBoardItem(projectId, board, {
        category: form.category,
        title: form.title,
        imageUrl: form.imageUrl || undefined,
        productUrl: form.productUrl || undefined,
        vendorUrl: form.vendorUrl || undefined,
        specSheetUrl: form.specSheetUrl || undefined,
        vendor: form.vendor || undefined,
        manufacturer: form.manufacturer || undefined,
        sku: form.sku || undefined,
        price: form.price ? parseFloat(form.price) : undefined,
        notes: form.notes || undefined,
      });
      toast({ title: 'Item added' });
      onClose();
    } catch (e: any) {
      toast({
        title: 'Could not add item',
        description: e?.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Add mood board item</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="mb-1 block text-xs font-medium text-gray-500">
                Category
              </span>
              <Select
                value={form.category}
                onValueChange={(v) => set('category', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MOODBOARD_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-gray-500">
                Title *
              </span>
              <Input
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="e.g. Matte black faucet"
              />
            </div>
          </div>
          {form.imageUrl ? (
            <div className="relative">
              <img
                src={form.imageUrl}
                alt="preview"
                className="w-full h-40 object-cover rounded-lg"
              />
              <Button
                size="sm"
                variant="secondary"
                className="absolute top-2 right-2 h-7"
                onClick={() => set('imageUrl', '')}
              >
                Replace
              </Button>
            </div>
          ) : (
            <Dropzone
              onFiles={onUpload}
              disabled={uploading}
              hint={
                uploading ? 'Uploading…' : 'Drop an image, or click to upload'
              }
              accept="image/*"
            />
          )}
          <Input
            value={form.imageUrl}
            onChange={(e) => set('imageUrl', e.target.value)}
            placeholder="…or paste an image URL"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              value={form.productUrl}
              onChange={(e) => set('productUrl', e.target.value)}
              placeholder="Product link"
            />
            <Input
              value={form.vendorUrl}
              onChange={(e) => set('vendorUrl', e.target.value)}
              placeholder="Vendor link"
            />
            <Input
              value={form.specSheetUrl}
              onChange={(e) => set('specSheetUrl', e.target.value)}
              placeholder="Spec sheet link"
            />
            <Input
              value={form.vendor}
              onChange={(e) => set('vendor', e.target.value)}
              placeholder="Vendor"
            />
            <Input
              value={form.manufacturer}
              onChange={(e) => set('manufacturer', e.target.value)}
              placeholder="Manufacturer"
            />
            <Input
              value={form.sku}
              onChange={(e) => set('sku', e.target.value)}
              placeholder="SKU"
            />
            <Input
              value={form.price}
              onChange={(e) => set('price', e.target.value)}
              placeholder="Price"
              inputMode="decimal"
            />
          </div>
          <Textarea
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Notes / why this fits the direction"
            rows={2}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || uploading}>
            {saving ? 'Saving…' : 'Add item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

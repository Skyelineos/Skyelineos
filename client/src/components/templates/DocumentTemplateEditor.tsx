import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  ChevronLeft, ChevronDown, ChevronUp, Download, Trash2, Save,
  Bold, Italic, Underline, List, ListOrdered, Image, Table, Type, X,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface DocSetup {
  assignedStaff: string;
  name: string;
  showRecipientName: boolean;
  showSiteAddress: boolean;
  status: 'Draft' | 'Active' | 'Archived';
  expiryDays: number;
  countersign: boolean;
  description: string;
}

export interface DocumentTemplateEditorProps {
  template: { id: string; name: string; content?: string; description?: string };
  onBack: () => void;
  onSave: (data: { name: string; content: string; description: string }) => Promise<void>;
  onDelete: () => void;
}

// ── Collapsible section ────────────────────────────────────────────────────────

function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-gray-200">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        {title}
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && children && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

// ── Formatting toolbar ─────────────────────────────────────────────────────────

function FormatToolbar({ editorRef }: { editorRef: React.RefObject<HTMLDivElement> }) {
  const exec = (cmd: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
  };

  return (
    <div className="flex items-center gap-0.5 flex-wrap border-b border-gray-200 bg-gray-50 px-2 py-1.5 rounded-t-sm">
      <button
        title="Heading"
        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 rounded transition-colors"
        onMouseDown={e => { e.preventDefault(); exec('formatBlock', 'h2'); }}
      >
        <Type className="w-3.5 h-3.5" /> Heading
      </button>
      <div className="w-px h-4 bg-gray-300 mx-1" />
      {[
        { Icon: Bold, cmd: 'bold', title: 'Bold' },
        { Icon: Italic, cmd: 'italic', title: 'Italic' },
        { Icon: Underline, cmd: 'underline', title: 'Underline' },
      ].map(({ Icon, cmd, title }) => (
        <button
          key={cmd}
          title={title}
          className="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-200 rounded transition-colors"
          onMouseDown={e => { e.preventDefault(); exec(cmd); }}
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}
      <div className="w-px h-4 bg-gray-300 mx-1" />
      <button
        title="Ordered list"
        className="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-200 rounded transition-colors"
        onMouseDown={e => { e.preventDefault(); exec('insertOrderedList'); }}
      >
        <ListOrdered className="w-3.5 h-3.5" />
      </button>
      <button
        title="Bullet list"
        className="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-200 rounded transition-colors"
        onMouseDown={e => { e.preventDefault(); exec('insertUnorderedList'); }}
      >
        <List className="w-3.5 h-3.5" />
      </button>
      <div className="w-px h-4 bg-gray-300 mx-1" />
      <button
        title="Insert image placeholder"
        className="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-200 rounded transition-colors"
        onMouseDown={e => { e.preventDefault(); exec('insertHTML', '<img src="" alt="[image]" style="max-width:100%;border:1px dashed #ccc;padding:4px;" />'); }}
      >
        <Image className="w-3.5 h-3.5" />
      </button>
      <button
        title="Insert table"
        className="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-200 rounded transition-colors"
        onMouseDown={e => {
          e.preventDefault();
          exec('insertHTML', '<table style="width:100%;border-collapse:collapse;margin:8px 0"><tr><td style="border:1px solid #ccc;padding:4px">&nbsp;</td><td style="border:1px solid #ccc;padding:4px">&nbsp;</td></tr><tr><td style="border:1px solid #ccc;padding:4px">&nbsp;</td><td style="border:1px solid #ccc;padding:4px">&nbsp;</td></tr></table>');
        }}
      >
        <Table className="w-3.5 h-3.5" />
      </button>
      <div className="w-px h-4 bg-gray-300 mx-1" />
      <button
        title="Clear formatting"
        className="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-200 rounded transition-colors"
        onMouseDown={e => { e.preventDefault(); exec('removeFormat'); }}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function DocumentTemplateEditor({
  template,
  onBack,
  onSave,
  onDelete,
}: DocumentTemplateEditorProps) {
  const { toast } = useToast();
  const editorRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);

  const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

  const [setup, setSetup] = useState<DocSetup>({
    assignedStaff: '',
    name: template.name,
    showRecipientName: true,
    showSiteAddress: true,
    status: 'Draft',
    expiryDays: 0,
    countersign: false,
    description: template.description || '',
  });

  // Seed editor content once
  useEffect(() => {
    if (editorRef.current && template.content) {
      editorRef.current.innerHTML = template.content;
    }
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const content = editorRef.current?.innerHTML || '';
      await onSave({ name: setup.name, content, description: setup.description });
      toast({ title: 'Template saved' });
    } catch {
      toast({ title: 'Error saving template', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [setup, onSave, toast]);

  const handleDownload = () => {
    toast({ title: 'PDF download', description: 'PDF export coming soon.' });
  };

  return (
    <div className="flex flex-col h-full min-h-screen bg-gray-100">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="font-medium">{setup.name || 'New Template'}</span>
        </button>
      </div>

      {/* Body: center preview + right panel */}
      <div className="flex flex-1 overflow-hidden">

        {/* Center: document preview */}
        <div className="flex-1 overflow-y-auto py-8 px-4 flex flex-col items-center">
          <div className="w-full max-w-2xl bg-white shadow-lg rounded-sm">

            {/* Document header */}
            <div className="flex items-start justify-between p-6 border-b border-gray-200">
              <img
                src="/logos/logo-transparent-cropped.png"
                alt="Skyeline Homes"
                className="h-16 w-auto object-contain"
              />
              <div className="text-right text-xs text-gray-700 leading-relaxed">
                <p className="font-bold text-sm text-gray-900">Skyeline Homes</p>
                <p>767 Automall Drive</p>
                <p>American Fork UT 84003</p>
                <p>Phone: 2084035905</p>
                <p>skyelinehomes.com</p>
              </div>
            </div>

            {/* Info boxes */}
            <div className="grid grid-cols-3 border-b border-gray-200">
              {[
                {
                  label: 'Client',
                  lines: ['John Smith', '207 Greenhill Rd', 'Mapil', 'SA 5072', 'john.smith@jack.com'],
                },
                {
                  label: 'Site',
                  lines: ['123 Job Street', 'Adelaide', 'SA 5000'],
                },
                {
                  label: 'Document Details',
                  pairs: [['Document ID:', '1001'], ['Date:', today]],
                },
              ].map(box => (
                <div key={box.label} className="border-r last:border-r-0 border-gray-200">
                  <div className="bg-gray-900 text-white text-xs font-semibold px-3 py-1.5">{box.label}</div>
                  <div className="p-3 text-xs text-gray-700 space-y-0.5">
                    {'lines' in box
                      ? box.lines.map((l, i) => <p key={i}>{l}</p>)
                      : box.pairs!.map(([k, v]) => (
                          <div key={k} className="flex gap-2">
                            <span className="font-medium w-24">{k}</span>
                            <span>{v}</span>
                          </div>
                        ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Rich text editor */}
            <div className="border-b border-gray-200">
              <FormatToolbar editorRef={editorRef} />
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                className="min-h-48 p-4 text-sm text-gray-800 outline-none focus:ring-0 empty:before:content-['Start_typing_to_add_more_information_to_this_document…'] empty:before:text-gray-400"
                style={{ lineHeight: 1.7 }}
              />
            </div>

            {/* Signature area */}
            <div className="p-6 space-y-8">
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Name</p>
                <div className="border-b border-gray-400 pb-1 w-64" />
                <p className="text-sm text-gray-700 pt-1">
                  {setup.showRecipientName ? 'John Smith' : ''}
                </p>
              </div>
              {setup.countersign && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Date</p>
                  <div className="border-b border-gray-400 pb-1 w-64" />
                </div>
              )}
            </div>

            {/* Document footer */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200">
              <img
                src="/logos/logo-transparent-cropped.png"
                alt="Skyeline Homes"
                className="h-8 w-auto object-contain opacity-60"
              />
              <div className="text-xs text-gray-500 text-right">
                <p className="font-medium">{setup.name || 'New Template'}</p>
                <p>Page 1 of 1</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right panel: Document Setup */}
        <div className="w-72 shrink-0 bg-white border-l border-gray-200 overflow-y-auto flex flex-col">

          <Section title="Document Setup" defaultOpen>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-gray-600">Assigned Staff</Label>
                <Input
                  className="h-8 text-sm"
                  placeholder="Select staff…"
                  value={setup.assignedStaff}
                  onChange={e => setSetup(s => ({ ...s, assignedStaff: e.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-gray-600">Document Name</Label>
                <Input
                  className="h-8 text-sm"
                  value={setup.name}
                  onChange={e => setSetup(s => ({ ...s, name: e.target.value }))}
                />
                <p className="text-xs text-gray-400">Shown to the recipient when viewing a document.</p>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-[#C9A96E]"
                  checked={setup.showRecipientName}
                  onChange={e => setSetup(s => ({ ...s, showRecipientName: e.target.checked }))}
                />
                Show recipient name on first page.
              </label>

              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-[#C9A96E]"
                  checked={setup.showSiteAddress}
                  onChange={e => setSetup(s => ({ ...s, showSiteAddress: e.target.checked }))}
                />
                Show site address on first page.
              </label>

              <div className="space-y-1">
                <Label className="text-xs text-gray-600">Status</Label>
                <Select
                  value={setup.status}
                  onValueChange={v => setSetup(s => ({ ...s, status: v as DocSetup['status'] }))}
                >
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-gray-600">Document Expiry</Label>
                <div className="flex items-center gap-2">
                  <Input
                    className="h-8 text-sm w-20"
                    type="number"
                    min={0}
                    value={setup.expiryDays}
                    onChange={e => setSetup(s => ({ ...s, expiryDays: parseInt(e.target.value) || 0 }))}
                  />
                  <span className="text-sm text-gray-500">days</span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-[#C9A96E] mt-0.5"
                    checked={setup.countersign}
                    onChange={e => setSetup(s => ({ ...s, countersign: e.target.checked }))}
                  />
                  <span>Countersign document.</span>
                </label>
                <p className="text-xs text-gray-400 pl-5">
                  When enabled the builder representative field will be included. When digitally signed by the client, a digital signature of the user who sent the document will automatically be added to the signed PDF.
                </p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-gray-600">Description</Label>
                <Textarea
                  className="text-sm resize-none"
                  rows={3}
                  value={setup.description}
                  onChange={e => setSetup(s => ({ ...s, description: e.target.value }))}
                />
              </div>

              <Button
                variant="outline"
                className="w-full gap-2 text-sm"
                onClick={handleDownload}
              >
                <Download className="w-4 h-4" /> Download Template PDF
              </Button>
            </div>
          </Section>

          <Section title="Attachments" />
          <Section title="Estimate" />
          <Section title="Payment" />

          {/* Spacer */}
          <div className="flex-1" />

          {/* Action buttons */}
          <div className="p-4 border-t border-gray-200 space-y-2">
            <Button
              variant="outline"
              className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:border-red-400 gap-2"
              onClick={onDelete}
            >
              <Trash2 className="w-4 h-4" /> Delete Template
            </Button>
            <Button
              className="w-full gap-2 text-white"
              style={{ backgroundColor: '#C9A96E' }}
              onClick={handleSave}
              disabled={saving}
            >
              <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// One row in the sub's Compliance tab — replaces the old toast-stub Upload
// button with a real drag-drop + file-picker flow.
//
// Drop or click → uploadComplianceDoc() handles the Storage + server write.
// For COI we collect an expiry date; for contractorLicense we collect the
// license number. Both are required by the server.
//
// Expiry display: amber "expires in N days" badge starting 30 days out,
// red "Expired" once past today. Drives the "you're about to fail your
// COI gate" visibility the GC asked for.

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, CheckCircle, AlertTriangle, Loader2, FileText, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  uploadComplianceDoc, isComplianceFileAllowed,
  ComplianceType,
} from '@/lib/compliance/uploadComplianceDoc';

interface ComplianceEntry {
  uploadedAt?: any;
  fileUrl?: string;
  fileName?: string;
  expiresAt?: string;
  contractorLicenseNumber?: string;
}

export interface ComplianceUploadCardProps {
  type: ComplianceType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  entry?: ComplianceEntry;
  // Legacy mirror flag from users/{uid} — true iff the doc is "on file"
  // per the D-016 award gate's view of the world.
  onFile: boolean;
  subContactId: string;
  projectId: string;
  // After a successful upload, refresh the parent's compliance state.
  onUploaded?: () => void;
}

function expiryBadge(expiresAt?: string): { text: string; tone: 'green' | 'amber' | 'red' } | null {
  if (!expiresAt) return null;
  const exp = new Date(expiresAt);
  if (isNaN(exp.getTime())) return null;
  const now = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;
  const days = Math.ceil((exp.getTime() - now.getTime()) / msPerDay);
  if (days < 0) return { text: 'Expired', tone: 'red' };
  if (days <= 30) return { text: `Expires in ${days} day${days === 1 ? '' : 's'}`, tone: 'amber' };
  return { text: `Expires ${exp.toLocaleDateString()}`, tone: 'green' };
}

export function ComplianceUploadCard(props: ComplianceUploadCardProps) {
  const { type, label, description, icon: Icon, entry, onFile, subContactId, projectId, onUploaded } = props;
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [dragging, setDragging] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [picked, setPicked] = useState<File | null>(null);
  const [expiresAt, setExpiresAt] = useState<string>(entry?.expiresAt || '');
  const [licenseNumber, setLicenseNumber] = useState<string>(entry?.contractorLicenseNumber || '');
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);

  // Reset form state when the entry changes (e.g. parent refreshed after upload).
  useEffect(() => {
    setExpiresAt(entry?.expiresAt || '');
    setLicenseNumber(entry?.contractorLicenseNumber || '');
  }, [entry?.expiresAt, entry?.contractorLicenseNumber]);

  function handlePick(file: File) {
    if (!isComplianceFileAllowed(file)) {
      toast({
        title: 'File not allowed',
        description: 'Must be a PDF or image and under 10MB.',
        variant: 'destructive',
      });
      return;
    }
    setPicked(file);
    setShowForm(true);
  }

  async function handleSubmit() {
    if (!picked) {
      toast({ title: 'Pick a file first', variant: 'destructive' });
      return;
    }
    if (!subContactId) {
      toast({
        title: 'Account not linked yet',
        description: 'Your portal login is not yet linked to a contact record. Contact Skyeline to finish setup.',
        variant: 'destructive',
      });
      return;
    }
    if (!projectId) {
      toast({
        title: 'No project assigned',
        description: 'You need to be on at least one project before uploading compliance docs.',
        variant: 'destructive',
      });
      return;
    }
    if (type === 'coi' && !expiresAt) {
      toast({ title: 'Expiry date required', variant: 'destructive' });
      return;
    }
    if (type === 'contractorLicense' && !licenseNumber.trim()) {
      toast({ title: 'License number required', variant: 'destructive' });
      return;
    }

    setBusy(true);
    setProgress(0);
    try {
      await uploadComplianceDoc({
        file: picked,
        type,
        subContactId,
        projectId,
        expiresAt: type === 'coi' ? expiresAt : undefined,
        contractorLicenseNumber: type === 'contractorLicense' ? licenseNumber.trim() : undefined,
        onProgress: setProgress,
      });
      toast({
        title: 'Uploaded',
        description: `${label} on file.`,
      });
      setPicked(null);
      setShowForm(false);
      setProgress(0);
      onUploaded?.();
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  const badge = type === 'coi' ? expiryBadge(entry?.expiresAt) : null;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${onFile ? 'bg-green-50' : 'bg-red-50'}`}>
              <Icon className={`w-5 h-5 ${onFile ? 'text-green-600' : 'text-red-500'}`} />
            </div>
            <div>
              <p className="font-semibold text-gray-900">{label}</p>
              <p className="text-sm text-gray-500">{description}</p>
              {entry?.fileName && (
                <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  {entry.fileName}
                  {entry.fileUrl && (
                    <a
                      href={entry.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 underline ml-2"
                    >
                      View
                    </a>
                  )}
                </p>
              )}
              {type === 'contractorLicense' && entry?.contractorLicenseNumber && (
                <p className="text-xs text-gray-500 mt-1">
                  License #: <span className="font-mono">{entry.contractorLicenseNumber}</span>
                </p>
              )}
              {badge && (
                <span
                  className={`inline-block mt-1 text-[11px] px-2 py-0.5 rounded-full ${
                    badge.tone === 'red'
                      ? 'bg-red-100 text-red-700'
                      : badge.tone === 'amber'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-green-50 text-green-700'
                  }`}
                >
                  {badge.tone === 'red' ? <AlertTriangle className="w-3 h-3 inline mr-0.5" /> : null}
                  {badge.text}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                onFile ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}
            >
              {onFile ? (
                <span className="inline-flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> On File
                </span>
              ) : 'Missing'}
            </span>
          </div>
        </div>

        {/* Drop zone + form */}
        <div className="mt-4">
          {!showForm ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handlePick(f);
                  e.target.value = '';
                }}
              />
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => {
                  e.preventDefault();
                  setDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handlePick(f);
                }}
                className={`cursor-pointer rounded-lg border-2 border-dashed py-6 px-4 text-center transition-colors ${
                  dragging
                    ? 'border-[#C9A96E] bg-[#FFF8E7]'
                    : 'border-gray-200 hover:border-[#C9A96E] hover:bg-[#FFF8E7]'
                }`}
              >
                <Upload className="w-6 h-6 mx-auto mb-2 text-[#C9A96E]" />
                <p className="text-sm text-gray-700 font-medium">
                  {onFile ? 'Replace this document' : 'Drag a file or click to upload'}
                </p>
                <p className="text-[11px] text-gray-400 mt-1">PDF or image, up to 10MB</p>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-gray-200 p-3 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-gray-500" />
                  <span className="truncate max-w-xs">{picked?.name}</span>
                  {picked && (
                    <span className="text-xs text-gray-400">
                      {(picked.size / 1024).toFixed(0)} KB
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="text-gray-400 hover:text-gray-700"
                  onClick={() => { setPicked(null); setShowForm(false); }}
                  disabled={busy}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {type === 'coi' && (
                <div>
                  <Label htmlFor={`coi-exp-${type}`} className="text-xs">Insurance expires</Label>
                  <Input
                    id={`coi-exp-${type}`}
                    type="date"
                    value={expiresAt}
                    onChange={e => setExpiresAt(e.target.value)}
                    disabled={busy}
                  />
                </div>
              )}
              {type === 'contractorLicense' && (
                <div>
                  <Label htmlFor={`lic-${type}`} className="text-xs">Contractor license number</Label>
                  <Input
                    id={`lic-${type}`}
                    value={licenseNumber}
                    onChange={e => setLicenseNumber(e.target.value)}
                    placeholder="e.g. 123456"
                    disabled={busy}
                  />
                </div>
              )}

              {busy && (
                <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded p-2 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Uploading… {Math.round(progress)}%
                </div>
              )}

              <Button
                size="sm"
                className="w-full gap-1.5 text-white"
                style={{ backgroundColor: '#22c55e' }}
                onClick={handleSubmit}
                disabled={busy}
              >
                <Upload className="w-3.5 h-3.5" /> Upload {label}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

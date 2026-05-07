import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, X } from 'lucide-react';

interface ContactImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ContactImportModal({ open, onOpenChange }: ContactImportModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && (file.type === 'text/csv' || file.type.includes('spreadsheet') || file.name.endsWith('.xlsx') || file.name.endsWith('.csv'))) {
      setSelectedFile(file);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/contacts/import', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        onOpenChange(false);
        setSelectedFile(null);
        // Refresh the page or invalidate cache
        window.location.reload();
      }
    } catch (error) {
      console.error('Import failed:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import Contacts</DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file to import contacts. The file should include columns for name, email, phone, company, role, and trade.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file">Select File</Label>
            <Input
              id="file"
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileChange}
            />
          </div>

          {selectedFile && (
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-2">
                <Upload className="h-4 w-4 text-gray-600" />
                <span className="text-sm font-medium">{selectedFile.name}</span>
                <span className="text-xs text-gray-500">
                  ({Math.round(selectedFile.size / 1024)}KB)
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedFile(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button 
              onClick={handleImport} 
              disabled={!selectedFile || isUploading}
            >
              {isUploading ? 'Importing...' : 'Import'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, Download, ExternalLink } from 'lucide-react';

interface FilePreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: {
    id: string;
    name: string;
    url: string;
    type: string;
    size?: number;
  } | null;
}

export function FilePreviewModal({ open, onOpenChange, file }: FilePreviewModalProps) {
  if (!file) return null;

  const isImage = file.type.startsWith('image/');
  const isPDF = file.type === 'application/pdf';
  const isVideo = file.type.startsWith('video/');

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = file.url;
    link.download = file.name;
    link.click();
  };

  const handleOpenExternal = () => {
    window.open(file.url, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg">{file.name}</DialogTitle>
              <DialogDescription>
                {file.type} {file.size && `• ${formatFileSize(file.size)}`}
              </DialogDescription>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                className="flex items-center space-x-1"
              >
                <Download className="h-4 w-4" />
                <span>Download</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenExternal}
                className="flex items-center space-x-1"
              >
                <ExternalLink className="h-4 w-4" />
                <span>Open</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {isImage && (
            <div className="flex justify-center p-4">
              <img
                src={file.url}
                alt={file.name}
                className="max-w-full max-h-[60vh] object-contain rounded"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                }}
              />
              <div className="hidden text-center text-muted-foreground">
                <p>Unable to preview image</p>
                <Button variant="outline" onClick={handleDownload} className="mt-2">
                  Download to view
                </Button>
              </div>
            </div>
          )}

          {isPDF && (
            <div className="h-[60vh]">
              <embed
                src={file.url}
                type="application/pdf"
                className="w-full h-full rounded"
              />
            </div>
          )}

          {isVideo && (
            <div className="flex justify-center p-4">
              <video
                src={file.url}
                controls
                className="max-w-full max-h-[60vh] rounded"
              >
                Your browser does not support video playback.
              </video>
            </div>
          )}

          {!isImage && !isPDF && !isVideo && (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <div className="mb-4">
                <div className="w-16 h-16 mx-auto bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-2xl">📄</span>
                </div>
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">Preview not available</h3>
              <p className="text-sm mb-4">
                This file type cannot be previewed in the browser.
              </p>
              <Button onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Download file
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default FilePreviewModal;
import { useState } from 'react';
import { FileText, ExternalLink, Eye } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { guessFileType } from './bookingDashboardUtils';

/**
 * Authorization document button.
 * - Images / PDFs: preview in-app via a modal (with open-in-new-tab fallback).
 * - DOC/DOCX or unknown: open in new tab only.
 */
function normalizeFileType(fileType) {
  if (!fileType) return null;
  const lower = String(fileType).toLowerCase();
  if (lower === 'pdf' || lower === 'image' || lower === 'doc') return lower;
  if (lower === 'application/pdf') return 'pdf';
  if (lower.startsWith('image/')) return 'image';
  if (
    lower === 'application/msword' ||
    lower === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'doc';
  }
  return null;
}

export function AuthorizationDocButton({ url, fileType }) {
  const [open, setOpen] = useState(false);
  if (!url) return null;

  const type = normalizeFileType(fileType) || guessFileType(url);
  const canPreview = type === 'image' || type === 'pdf';

  const openInTab = () => window.open(url, '_blank', 'noopener,noreferrer');

  if (!canPreview) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2 mt-1"
      >
        <FileText className="h-3.5 w-3.5" />
        View Authorization Doc
        <ExternalLink className="h-3 w-3" />
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2 mt-1 cursor-pointer"
      >
        <FileText className="h-3.5 w-3.5" />
        View Authorization Doc
        <Eye className="h-3 w-3" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl w-full">
          <DialogHeader>
            <DialogTitle>Authorization Document</DialogTitle>
          </DialogHeader>

          <div className="overflow-auto max-h-[65vh] rounded-md border border-border bg-muted flex items-center justify-center">
            {type === 'image' && (
              <img
                src={url}
                alt="Authorization document"
                className="max-w-full max-h-[65vh] object-contain"
              />
            )}
            {type === 'pdf' && (
              <iframe
                src={url}
                title="Authorization document"
                className="w-full h-[65vh]"
              />
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={openInTab}>
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Open in New Tab
            </Button>
            <Button size="sm" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

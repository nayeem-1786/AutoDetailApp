'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Code2, AlertTriangle } from 'lucide-react';

interface EmbedDialogProps {
  open: boolean;
  onClose: () => void;
  onInsert: (html: string) => void;
}

export function EmbedDialog({ open, onClose, onInsert }: EmbedDialogProps) {
  const [code, setCode] = useState('');

  function handleInsert() {
    if (!code.trim()) return;

    const html = `<div style="margin:16px 0;" class="custom-embed">
${code.trim()}
</div>`;

    onInsert(html);
    resetAndClose();
  }

  function resetAndClose() {
    setCode('');
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && resetAndClose()}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Code2 className="h-5 w-5" />
          Embed Code
        </DialogTitle>
      </DialogHeader>
      <DialogContent>
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p className="text-xs text-amber-400">
              Only paste embed code from trusted sources. Untrusted code may
              pose security risks.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ui-text">
              Embed Code
            </label>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Paste your embed code here (e.g. iframe, script, widget code)..."
              rows={8}
              className="w-full rounded-md border border-ui-border bg-ui-bg px-3 py-2 font-mono text-sm text-ui-text placeholder:text-ui-text-muted focus:outline-none focus:ring-2 focus:ring-ui-ring"
            />
          </div>
        </div>
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={resetAndClose}>
          Cancel
        </Button>
        <Button onClick={handleInsert} disabled={!code.trim()}>
          Insert Embed
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

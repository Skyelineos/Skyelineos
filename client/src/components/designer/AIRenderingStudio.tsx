import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles, Clock } from 'lucide-react';

interface AIRenderingStudioProps {
  projectId: string;
  projectName?: string;
}

export default function AIRenderingStudio({ projectId, projectName }: AIRenderingStudioProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center py-20 space-y-6">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
        <Sparkles className="h-8 w-8 text-white" />
      </div>

      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">AI Rendering Studio</h2>
        <p className="text-gray-500 max-w-sm">
          Generate photo-realistic room renderings from finish selections — powered by DALL-E 3 and FLUX 1.1 Pro.
        </p>
      </div>

      <Button
        onClick={() => setOpen(true)}
        className="h-12 px-8 text-base"
        style={{ backgroundColor: '#C9A96E', color: '#141414' }}
      >
        <Sparkles className="h-4 w-4 mr-2" />
        Generate Rendering
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-3">
              <Clock className="h-7 w-7 text-white" />
            </div>
            <DialogTitle className="text-xl">Coming Soon</DialogTitle>
          </DialogHeader>
          <p className="text-gray-500 text-sm mt-2 pb-2">
            AI renderings are on the way. In the meantime, upload your Canva design boards and PDF inspiration files directly to each selection.
          </p>
          <Button variant="outline" className="w-full mt-2" onClick={() => setOpen(false)}>
            Got it
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

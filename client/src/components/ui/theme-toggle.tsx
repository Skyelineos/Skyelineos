import { Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Simple theme toggle placeholder - focusing on accent color only
export function ThemeToggle() {
  return (
    <Button variant="outline" size="icon" className="h-9 w-9">
      <Palette className="h-4 w-4" />
      <span className="sr-only">Theme settings</span>
    </Button>
  );
}
// Designer Portal — AI placeholder actions dropdown.
import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import {
  AI_ACTIONS,
  runAiAction,
  type AiActionContext,
  type AiActionDef,
} from '@/lib/designer/aiActions';

export function AiActionsMenu({
  scope,
  context,
  size = 'sm',
}: {
  scope?: AiActionDef['scope'] | AiActionDef['scope'][];
  context: AiActionContext;
  size?: 'sm' | 'default';
}) {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);

  const scopes = scope ? (Array.isArray(scope) ? scope : [scope]) : null;
  const actions = scopes
    ? AI_ACTIONS.filter((a) => scopes.includes(a.scope))
    : AI_ACTIONS;

  async function run(key: AiActionDef['key'], label: string) {
    setRunning(true);
    try {
      const res = await runAiAction(key, context);
      toast({ title: label, description: res.message });
    } finally {
      setRunning(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size={size}
          className="gap-1.5"
          disabled={running}
        >
          {running ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" style={{ color: '#C9A96E' }} />
          )}
          AI Actions
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>AI assistance (preview)</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {actions.map((a) => (
          <DropdownMenuItem
            key={a.key}
            onClick={() => run(a.key, a.label)}
            className="flex flex-col items-start gap-0.5"
          >
            <span className="font-medium">{a.label}</span>
            <span className="text-xs text-gray-400">{a.description}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

import { useState } from 'react';
import { Microscope, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeepResearchPanel } from '@/components/DeepResearchPanel';
import { requestJson } from '@/lib/http';
import { toast } from 'sonner';
import { API_URL } from '../../config';

interface DeepResearchButtonProps {
  threadId: string;
  workletId: string;
  workletTitle: string;
  problemStatement: string;
  description: string;
}

export const DeepResearchButton = ({
  threadId,
  workletId,
  workletTitle,
  problemStatement,
  description,
}: DeepResearchButtonProps) => {
  const [researchId, setResearchId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  const handleStartResearch = async () => {
    setIsStarting(true);
    try {
      // Check if research already exists for this worklet
      try {
        const existing = await requestJson<{ research_id: string; status: string }>(
          `${API_URL}/deep-research/by-worklet/${threadId}/${workletId}`
        );
        if (existing?.research_id) {
          setResearchId(existing.research_id);
          setPanelOpen(true);
          setIsStarting(false);
          return;
        }
      } catch {
        // 404 means no existing research — proceed to create
      }

      const prompt = [
        `Title: ${workletTitle}`,
        `Problem Statement: ${problemStatement}`,
        `Description: ${description}`,
      ].join('\n\n');

      const body = new FormData();
      body.append('prompt', prompt);
      body.append('links', '');
      body.append('thread_id', threadId);
      body.append('worklet_id', workletId);

      const result = await requestJson<{ research_id: string }>(
        `${API_URL}/deep-research/`,
        { method: 'POST', body }
      );

      setResearchId(result.research_id);
      setPanelOpen(true);
      toast.success('Deep Research started');
    } catch (error: any) {
      console.error('Failed to start deep research:', error);
      const msg = error?.message || error?.toString() || 'Unknown error';
      toast.error(`Failed to start deep research: ${msg}`);
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleStartResearch}
        disabled={isStarting}
        className="border-border"
      >
        {isStarting ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Microscope className="h-4 w-4 mr-2" />
        )}
        Deep Research
      </Button>

      {researchId && (
        <DeepResearchPanel
          researchId={researchId}
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </>
  );
};

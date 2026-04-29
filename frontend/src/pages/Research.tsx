import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FlaskConical, ArrowLeft, Sun, Moon, Trash2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { useTheme } from '@/contexts/ThemeContext';
import { requestJson } from '@/lib/http';
import { toast } from 'sonner';
import { API_URL, PROJECT_NAME } from '../../config';
import { DeepResearchStandalone } from '@/components/DeepResearchStandalone';
import { DeepResearchPanel } from '@/components/DeepResearchPanel';
import type { DeepResearchResult } from '@/types/deep-research';

const Research = () => {
  const { researchId } = useParams<{ researchId?: string }>();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [pastResearch, setPastResearch] = useState<DeepResearchResult[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(researchId || null);

  useEffect(() => {
    fetchPastResearch();
  }, []);

  useEffect(() => {
    if (researchId) setSelectedId(researchId);
  }, [researchId]);

  const fetchPastResearch = async () => {
    try {
      const data = await requestJson<{ research: DeepResearchResult[] }>(
        `${API_URL}/deep-research/list`
      );
      setPastResearch(data.research || []);
    } catch {
      // silently fail
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await requestJson(`${API_URL}/deep-research/${id}`, { method: 'DELETE' });
      setPastResearch((prev) => prev.filter((r) => r.research_id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        navigate('/research', { replace: true });
      }
      toast.success('Research deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handleSelect = (id: string) => {
    setSelectedId(id);
    navigate(`/research/${id}`, { replace: true });
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="h-screen w-full bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Back
            </Button>
            <div className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-bold">{PROJECT_NAME} — Deep Research</h1>
            </div>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={toggleTheme}>
                  {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Toggle theme</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — past research */}
        <div className="w-72 border-r border-border flex flex-col">
          <div className="p-3 border-b border-border">
            <Button
              variant="default"
              size="sm"
              className="w-full gradient-primary"
              onClick={() => {
                setSelectedId(null);
                navigate('/research', { replace: true });
              }}
            >
              <FlaskConical className="h-4 w-4 mr-2" /> New Research
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {pastResearch.map((r) => (
                <Card
                  key={r.research_id}
                  className={`p-3 cursor-pointer hover:bg-muted/50 transition-colors ${
                    selectedId === r.research_id ? 'bg-muted border-primary/30' : ''
                  }`}
                  onClick={() => handleSelect(r.research_id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {r.prompt.length > 50 ? r.prompt.slice(0, 50) + '...' : r.prompt}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {timeAgo(r.created_at)}
                        </span>
                        <Badge
                          variant="outline"
                          className={
                            r.status === 'completed'
                              ? 'text-green-500 border-green-500/20 text-xs'
                              : r.status === 'failed'
                              ? 'text-red-500 border-red-500/20 text-xs'
                              : 'text-yellow-500 border-yellow-500/20 text-xs'
                          }
                        >
                          {r.status}
                        </Badge>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 hover:bg-destructive/10 hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(r.research_id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </Card>
              ))}
              {pastResearch.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No research sessions yet
                </p>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-auto">
          {selectedId ? (
            <div className="p-6">
              <DeepResearchPanel
                key={selectedId}
                researchId={selectedId}
                open={true}
                inline
                onClose={() => {
                  setSelectedId(null);
                  navigate('/research', { replace: true });
                }}
              />
            </div>
          ) : (
            <DeepResearchStandalone />
          )}
        </div>
      </div>
    </div>
  );
};

export default Research;

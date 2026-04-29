import { useState } from 'react';
import { Plus, X, Upload, FileIcon, Loader2, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { requestJson } from '@/lib/http';
import { API_URL } from '../../config';
import { DeepResearchPanel } from '@/components/DeepResearchPanel';

export const DeepResearchStandalone = () => {
  const [prompt, setPrompt] = useState('');
  const [links, setLinks] = useState<string[]>(['']);
  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [researchId, setResearchId] = useState<string | null>(null);

  const addLink = () => setLinks([...links, '']);
  const removeLink = (i: number) => setLinks(links.filter((_, idx) => idx !== i));
  const updateLink = (i: number, v: string) => {
    const next = [...links];
    next[i] = v;
    setLinks(next);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles([...files, ...Array.from(e.target.files)]);
  };
  const removeFile = (i: number) => setFiles(files.filter((_, idx) => idx !== i));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) {
      toast.error('Please enter a research prompt');
      return;
    }

    setIsSubmitting(true);
    try {
      const filteredLinks = links.filter((l) => l.trim() !== '');
      const body = new FormData();
      body.append('prompt', prompt);
      body.append('links', JSON.stringify(filteredLinks));
      files.forEach((file) => body.append('files', file));

      const result = await requestJson<{ research_id: string }>(
        `${API_URL}/deep-research/`,
        { method: 'POST', body }
      );

      setResearchId(result.research_id);
      toast.success('Deep Research started');
    } catch (error: any) {
      console.error('Failed to start research:', error);
      const msg = error?.message || error?.toString() || 'Unknown error';
      toast.error(`Failed to start deep research: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (researchId) {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => setResearchId(null)}>
          Start New Research
        </Button>
        <DeepResearchPanel
          researchId={researchId}
          open={true}
          inline
          onClose={() => setResearchId(null)}
        />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto p-6">
      <Card className="p-6 bg-card border-border space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <FlaskConical className="h-6 w-6 text-primary" />
          <h2 className="text-xl font-semibold">Deep Research</h2>
        </div>

        <p className="text-sm text-muted-foreground">
          Enter a research topic, upload documents, or provide links. The system will
          analyze the current state of the art, identify key players, perform comparative
          analysis, and generate forward-looking problem statements.
        </p>

        {/* Prompt */}
        <div className="space-y-2">
          <Label htmlFor="research-prompt" className="text-foreground">
            Research Prompt *
          </Label>
          <Textarea
            id="research-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the research topic you want to explore deeply..."
            className="bg-input border-border min-h-[120px]"
            required
          />
        </div>

        {/* Links */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-foreground">Links (optional)</Label>
            <Button type="button" onClick={addLink} size="sm" variant="outline" className="border-border">
              <Plus className="h-4 w-4 mr-1" /> Add Link
            </Button>
          </div>
          <div className="space-y-2">
            {links.map((link, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={link}
                  onChange={(e) => updateLink(i, e.target.value)}
                  placeholder="https://example.com"
                  className="bg-input border-border"
                />
                <Button type="button" onClick={() => removeLink(i)} size="icon" variant="ghost" className="hover:bg-destructive/10 hover:text-destructive">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Files */}
        <div className="space-y-2">
          <Label className="text-foreground">Files (optional)</Label>
          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary transition-all cursor-pointer">
            <input
              type="file"
              id="research-file-upload"
              multiple
              accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.md,.xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <label htmlFor="research-file-upload" className="cursor-pointer">
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Click to upload or drag and drop</p>
              <p className="text-xs text-muted-foreground mt-1">PDF, DOC, PPT, images, spreadsheets</p>
            </label>
          </div>
          {files.length > 0 && (
            <div className="space-y-2 mt-2">
              {files.map((file, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-2">
                    <FileIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{file.name}</span>
                  </div>
                  <Button type="button" onClick={() => removeFile(i)} size="icon" variant="ghost" className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit */}
        <Button
          type="submit"
          className="w-full gradient-primary hover:opacity-90 transition-smooth shadow-glow"
          size="lg"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Starting Research...
            </>
          ) : (
            <>
              <FlaskConical className="h-4 w-4 mr-2" /> Start Deep Research
            </>
          )}
        </Button>
      </Card>
    </form>
  );
};

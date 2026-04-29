import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, X, Upload, FileIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { useGoogleDrivePicker } from '@/hooks/use-google-drive-picker';
import { GOOGLE_CLIENT_ID, GOOGLE_API_KEY } from '../../config';

interface ThreadFormProps {
  onGenerate: (formData: {
    thread_name: string;
    custom_prompt: string;
    links: string[];
    files: File[];
    count: number;
  }) => void;
  clusterName?: string;
}

export const ThreadForm = ({ onGenerate, clusterName }: ThreadFormProps) => {
  const location = useLocation();
  const state = (location.state as any) || {};
  const previous = state.previousFormData || {};

  const [threadName, setThreadName] = useState(previous.thread_name || '');
  const [customPrompt, setCustomPrompt] = useState(previous.custom_prompt || '');
  const [links, setLinks] = useState<string[]>(previous.links && previous.links.length ? previous.links : ['']);
  const [files, setFiles] = useState<File[]>(previous.files || []);
  const [count, setCount] = useState(previous.count || 3);

  // Clear location state after hydrating to avoid stale refills on subsequent navigations
  useEffect(() => {
    if (state.previousFormData) {
      history.replaceState({}, document.title, location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addLink = () => {
    setLinks([...links, '']);
  };

  const removeLink = (index: number) => {
    setLinks(links.filter((_, i) => i !== index));
  };

  const updateLink = (index: number, value: string) => {
    const newLinks = [...links];
    newLinks[index] = value;
    setLinks(newLinks);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles([...files, ...Array.from(e.target.files)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'md', 'xlsx', 'xls', 'csv'];
  const googleDriveEnabled = Boolean(GOOGLE_CLIENT_ID && GOOGLE_API_KEY);

  const { openPicker, isLoading: isDriveLoading, error: driveError } = useGoogleDrivePicker({
    clientId: GOOGLE_CLIENT_ID,
    apiKey: GOOGLE_API_KEY,
    allowedExtensions: ALLOWED_EXTENSIONS,
    maxFiles: 10,
  });

  useEffect(() => {
    if (driveError) {
      toast.error(driveError);
    }
  }, [driveError]);

  const handleGoogleDrivePick = async () => {
    const pickedFiles = await openPicker();
    if (pickedFiles.length > 0) {
      setFiles((prev) => [...prev, ...pickedFiles]);
      toast.success(`Added ${pickedFiles.length} file(s) from Google Drive`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const filteredLinks = links.filter(link => link.trim() !== '');
    onGenerate({
      thread_name: threadName,
      custom_prompt: customPrompt,
      links: filteredLinks,
      files,
      count,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto p-6">
      <Card className="p-6 bg-card border-border space-y-6">
        {clusterName && (
          <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            Creating a thread in <span className="font-semibold text-foreground">{clusterName}</span>
          </div>
        )}
        {/* Thread Name */}
        <div className="space-y-2">
          <Label htmlFor="thread_name" className="text-foreground">Thread Name</Label>
          <Input
            id="thread_name"
            value={threadName}
            onChange={(e) => setThreadName(e.target.value)}
            required
            placeholder="Enter thread name"
            className="bg-input border-border"
          />
        </div>

        {/* Custom Prompt */}
        <div className="space-y-2">
          <Label htmlFor="custom_prompt" className="text-foreground">Custom Prompt</Label>
          <Textarea
            id="custom_prompt"
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="Enter your custom prompt"
            className="bg-input border-border min-h-[100px]"
          />
        </div>

        {/* Links */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-foreground">Links</Label>
            <Button
              type="button"
              onClick={addLink}
              size="sm"
              variant="outline"
              className="border-border"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Link
            </Button>
          </div>
          <div className="space-y-2">
            {links.map((link, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={link}
                  onChange={(e) => updateLink(index, e.target.value)}
                  placeholder="https://example.com"
                  className="bg-input border-border"
                />
                <Button
                  type="button"
                  onClick={() => removeLink(index)}
                  size="icon"
                  variant="ghost"
                  className="hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Files */}
        <div className="space-y-2">
          <Label className="text-foreground">Files</Label>
          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary transition-smooth cursor-pointer">
            <input
              type="file"
              id="file-upload"
              multiple
              accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.md,.xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Click to upload or drag and drop
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PDF, DOC, PPT, JPG, MD (max 10 files)
              </p>
            </label>
          </div>

          {/* Google Drive Picker */}
          {googleDriveEnabled && (
            <Button
              type="button"
              variant="outline"
              className="w-full border-border"
              onClick={handleGoogleDrivePick}
              disabled={isDriveLoading}
            >
              {isDriveLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Downloading from Drive...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4 mr-2" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                    <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                    <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-20.4 35.3c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47"/>
                    <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.5l5.4 13.15z" fill="#ea4335"/>
                    <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                    <path d="m59.8 53h-27.5l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h45.5c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                    <path d="m73.4 26.5-10.2-17.65c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 23.8h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                  </svg>
                  Pick from Google Drive
                </>
              )}
            </Button>
          )}

          {files.length > 0 && (
            <div className="space-y-2 mt-4">
              {files.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-muted rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <FileIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{file.name}</span>
                  </div>
                  <Button
                    type="button"
                    onClick={() => removeFile(index)}
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Count */}
        <div className="space-y-2">
          <Label htmlFor="count" className="text-foreground">Count (1-6)</Label>
          <Input
            id="count"
            type="number"
            min={1}
            max={6}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            required
            className="bg-input border-border"
          />
        </div>

        {/* Submit Button */}
        <Button
          type="submit"
          className="w-full gradient-primary hover:opacity-90 transition-smooth shadow-glow"
          size="lg"
        >
          Generate Worklets
        </Button>
      </Card>
    </form>
  );
};

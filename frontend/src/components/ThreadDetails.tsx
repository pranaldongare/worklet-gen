import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Download,
  FileIcon,
  Loader2,
  Pencil,
  PenLine,
  Plus,
  ScrollText,
  ShieldAlert,
  Star,
  X,
} from 'lucide-react';
import { ReferenceGraph } from '@/components/ReferenceGraph';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ArrayAttribute,
  EnhanceWorkletResponse,
  IterateWorkletResponse,
  ObjectAttribute,
  SelectIterationResponse,
  SelectWorkletIterationResponse,
  StringAttribute,
  Thread,
  WorkletFieldKey,
  WorkletIteration,
  WorkletWithIterations,
} from '@/types/thread';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { API_URL } from '../../config';
import { toast } from 'sonner';
import {
  ApiError,
  ensureOk,
  requestBlob,
  requestJson,
} from '@/lib/http';
import {
  clampToIterations,
  clampWorkletIterationIndex,
  ensureWorkletBundle,
  ensureWorkletIteration,
  getArrayIteration,
  getDefaultWorkletIteration,
  getIterationCount,
  getObjectIteration,
  getSelectedIndex,
  getStringIteration,
  getWorkletIterationAt,
  getWorkletIterationCount,
} from '@/lib/worklet';

interface ThreadDetailsProps {
  thread: Thread;
  worklets: WorkletWithIterations[];
  onUpdateWorklet: (worklet: WorkletWithIterations) => void;
  clusterName?: string;
}

type FieldType = 'string' | 'array' | 'object';

interface FieldConfig {
  key: WorkletFieldKey;
  label: string;
  type: FieldType;
}

const FIELD_CONFIGS: FieldConfig[] = [
  { key: 'title', label: 'Title', type: 'string' },
  { key: 'problem_statement', label: 'Problem Statement', type: 'string' },
  { key: 'description', label: 'Description', type: 'string' },
  { key: 'challenge_use_case', label: 'Challenge / Use Case', type: 'string' },
  { key: 'deliverables', label: 'Deliverables', type: 'array' },
  { key: 'kpis', label: 'KPIs', type: 'array' },
  { key: 'prerequisites', label: 'Prerequisites', type: 'array' },
  {
    key: 'infrastructure_requirements',
    label: 'Infrastructure Requirements',
    type: 'string',
  },
  { key: 'tech_stack', label: 'Tech Stack', type: 'string' },
  { key: 'milestones', label: 'Milestones', type: 'object' },
  { key: 'budget_estimation', label: 'Budget Estimation', type: 'object' },
  { key: 'risk_assessment', label: 'Risk Assessment', type: 'object' },
];

const DEFAULT_FIELD_PROMPT_STATE = {
  open: false,
  field: null as WorkletFieldKey | null,
  prompt: '',
  iterationIndex: 0,
};

const computeInitialIndices = (
  iteration: WorkletIteration,
): Record<WorkletFieldKey, number> => {
  return FIELD_CONFIGS.reduce((acc, field) => {
    const attr = iteration[field.key];
    acc[field.key] = getSelectedIndex(attr);
    return acc;
  }, {} as Record<WorkletFieldKey, number>);
};

const getAttribute = (
  iteration: WorkletIteration,
  key: WorkletFieldKey,
): StringAttribute | ArrayAttribute | ObjectAttribute => iteration[key];

export const ThreadDetails = ({ thread, worklets, onUpdateWorklet, clusterName }: ThreadDetailsProps) => {
  const [activeWorkletId, setActiveWorkletId] = useState<string | null>(null);
  const [activeIterationIndex, setActiveIterationIndex] = useState(0);
  const [fieldViewIndices, setFieldViewIndices] = useState<Record<WorkletFieldKey, number>>({} as Record<WorkletFieldKey, number>);
  const [selectingField, setSelectingField] = useState<WorkletFieldKey | null>(null);
  const [iteratingField, setIteratingField] = useState<WorkletFieldKey | null>(null);
  const [fieldPromptState, setFieldPromptState] = useState(DEFAULT_FIELD_PROMPT_STATE);
  const [enhanceDialogOpen, setEnhanceDialogOpen] = useState(false);
  const [enhancePrompt, setEnhancePrompt] = useState('');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [defaultSelecting, setDefaultSelecting] = useState(false);
  const [operationError, setOperationError] = useState<{
    field?: WorkletFieldKey;
    operation: string;
    message: string;
    retryable: boolean;
    retryFn: (() => void) | null;
  } | null>(null);
  const [editingField, setEditingField] = useState<WorkletFieldKey | null>(null);
  const [editValue, setEditValue] = useState<any>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [generatingField, setGeneratingField] = useState<string | null>(null);
  const [referenceFilter, setReferenceFilter] = useState<string>('all');

  const activeWorklet = useMemo(
    () => worklets.find((w) => w.worklet_id === activeWorkletId) ?? null,
    [worklets, activeWorkletId],
  );

  useEffect(() => {
    if (!activeWorklet) {
      setActiveIterationIndex(0);
      setFieldViewIndices({} as Record<WorkletFieldKey, number>);
      return;
    }

    const defaultIndex = clampWorkletIterationIndex(
      activeWorklet,
      activeWorklet.selected_iteration_index,
    );
    setActiveIterationIndex(defaultIndex);
  }, [activeWorklet?.worklet_id, activeWorklet?.selected_iteration_index]);

  const activeIteration = useMemo(() => {
    if (!activeWorklet) return null;
    return getWorkletIterationAt(activeWorklet, activeIterationIndex);
  }, [activeWorklet, activeIterationIndex]);

  useEffect(() => {
    if (!activeIteration) return;
    setFieldViewIndices(computeInitialIndices(activeIteration));
  }, [activeIteration?.iteration_id]);

  const isDialogOpen = Boolean(activeWorklet);
  const isIterating = iteratingField !== null;

  const totalWorkletIterations = activeWorklet ? getWorkletIterationCount(activeWorklet) : 0;

  const getViewIndex = (key: WorkletFieldKey): number => {
    if (!activeIteration) return 0;
    const attr = getAttribute(activeIteration, key);
    const fallback = getSelectedIndex(attr);
    const requested = fieldViewIndices[key];
    return clampToIterations(attr, typeof requested === 'number' ? requested : fallback);
  };

  const closeFieldPrompt = () => {
    if (isIterating) return;
    setFieldPromptState(DEFAULT_FIELD_PROMPT_STATE);
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      if (isIterating || isEnhancing) return;
      setActiveWorkletId(null);
      setFieldPromptState(DEFAULT_FIELD_PROMPT_STATE);
      setEnhanceDialogOpen(false);
      setEnhancePrompt('');
    }
  };

  const handleOpenWorklet = (worklet: WorkletWithIterations) => {
    setActiveWorkletId(worklet.worklet_id);
    const defaultIndex = clampWorkletIterationIndex(
      worklet,
      worklet.selected_iteration_index,
    );
    setActiveIterationIndex(defaultIndex);
  };

  const getActiveTitle = (): string => {
    if (!activeIteration) return '';
    const index = getViewIndex('title');
    const value = getStringIteration(activeIteration.title, index).trim();
    return value.length > 0 ? value : 'Worklet';
  };

  const sanitizeFilename = (raw: string): string => {
    const safe = raw.replace(/[\\/:*?"<>|]/g, '-').trim();
    return safe.length > 0 ? safe : 'worklet';
  };

  const handleDownload = async (type: 'pdf' | 'pptx') => {
    if (!activeWorklet) return;
    try {
      const blob = await requestBlob(
        `${API_URL}/thread/${thread.thread_id}/download/${activeWorklet.worklet_id}/${type}`,
      );
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${sanitizeFilename(getActiveTitle())}.${type}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`${type.toUpperCase()} downloaded`);
    } catch (error) {
      console.error(error);
      if (error instanceof ApiError) {
        toast.error(error.message);
      } else {
        toast.error(error instanceof Error ? error.message : 'Download failed');
      }
    }
  };

  const handleDownloadAll = async (type: 'pdf' | 'pptx') => {
    try {
      const response = await fetch(`${API_URL}/thread/${thread.thread_id}/download/all/${type}`);
      await ensureOk(response);
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition');
      let suggestedName = disposition?.match(/filename="?([^";]+)"?/i)?.[1];
      if (!suggestedName) {
        suggestedName = `worklets-${type}-bundle.zip`;
      } else if (!/\.zip$/i.test(suggestedName)) {
        suggestedName = suggestedName.replace(/\.[^.]+$/, '') + '.zip';
      }
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = suggestedName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`ZIP with all ${type.toUpperCase()} files downloaded`);
    } catch (error) {
      console.error(error);
      if (error instanceof ApiError) {
        toast.error(error.message);
      } else {
        toast.error(error instanceof Error ? error.message : 'Bulk download failed');
      }
    }
  };

  const handleNavigateField = (field: WorkletFieldKey, delta: number) => {
    if (!activeIteration) return;
    const attr = getAttribute(activeIteration, field);
    const total = getIterationCount(attr);
    if (total <= 1) return;
    const current = getViewIndex(field);
    const next = clampToIterations(attr, current + delta);
    if (next === current) return;
    setFieldViewIndices((prev) => ({ ...prev, [field]: next }));
  };

  const handleSelectFieldIteration = async (field: WorkletFieldKey, index: number) => {
    if (!activeWorklet || !activeIteration) return;
    const attr = getAttribute(activeIteration, field);
    const selected = getSelectedIndex(attr);
    if (index === selected) return;
    setSelectingField(field);
    try {
      const payload = {
        worklet_id: activeWorklet.worklet_id,
        worklet_iteration_id: activeIteration.iteration_id,
        field,
        selected_index: index,
      };
      await requestJson<SelectIterationResponse>(`${API_URL}/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const updatedIteration: WorkletIteration = {
        ...activeIteration,
        [field]: {
          ...attr,
          selected_index: index,
        },
      };

      const updatedWorklet = ensureWorkletBundle({
        ...activeWorklet,
        iterations: activeWorklet.iterations.map((iteration) =>
          iteration.iteration_id === activeIteration.iteration_id ? updatedIteration : iteration,
        ),
      });

      onUpdateWorklet(updatedWorklet);
      setFieldViewIndices((prev) => ({ ...prev, [field]: index }));
      toast.success('Default iteration updated');
    } catch (error) {
      console.error(error);
      if (error instanceof ApiError) {
        toast.error(error.message ?? 'Selection failed');
      } else {
        toast.error(error instanceof Error ? error.message : 'Selection failed');
      }
    } finally {
      setSelectingField(null);
    }
  };

  const handleOpenFieldPrompt = (field: WorkletFieldKey, index: number) => {
    if (isIterating) return;
    setFieldPromptState({ open: true, field, prompt: '', iterationIndex: index });
  };

  const handleFieldPromptSubmit = async () => {
    if (!activeWorklet || !activeIteration || !fieldPromptState.field) return;
    const trimmed = fieldPromptState.prompt.trim();
    if (!trimmed) {
      toast.error('Please enter a prompt to iterate this field');
      return;
    }

    setIteratingField(fieldPromptState.field);
    try {
      const payload = {
        worklet_id: activeWorklet.worklet_id,
        worklet_iteration_id: activeIteration.iteration_id,
        field: fieldPromptState.field,
        index: fieldPromptState.iterationIndex,
        prompt: trimmed,
      };

      const response = await requestJson<IterateWorkletResponse>(`${API_URL}/iterate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const attr = getAttribute(activeIteration, fieldPromptState.field);
      const updatedIteration: WorkletIteration = {
        ...activeIteration,
        [fieldPromptState.field]: {
          ...attr,
          selected_index: response.selected_index,
          iterations: response.iterations as any,
        },
      };

      const updatedWorklet = ensureWorkletBundle({
        ...activeWorklet,
        iterations: activeWorklet.iterations.map((iteration) =>
          iteration.iteration_id === activeIteration.iteration_id ? updatedIteration : iteration,
        ),
      });

      onUpdateWorklet(updatedWorklet);
      setFieldViewIndices((prev) => ({
        ...prev,
        [fieldPromptState.field as WorkletFieldKey]: response.selected_index,
      }));
      toast.success('Iteration applied');
      setFieldPromptState(DEFAULT_FIELD_PROMPT_STATE);
    } catch (error) {
      console.error(error);
      const apiErr = error instanceof ApiError ? error : null;
      const message = apiErr?.message ?? (error instanceof Error ? error.message : 'Iteration failed');
      const retryable = apiErr?.retryable ?? true;
      setOperationError({
        field: fieldPromptState.field!,
        operation: 'iterate',
        message,
        retryable,
        retryFn: retryable ? () => handleFieldPromptSubmit() : null,
      });
      toast.error(message);
    } finally {
      setIteratingField(null);
    }
  };

  const handleIterationNavigate = (delta: number) => {
    if (!activeWorklet) return;
    if (totalWorkletIterations <= 1) return;
    const next = clampWorkletIterationIndex(activeWorklet, activeIterationIndex + delta);
    if (next === activeIterationIndex) return;
    setActiveIterationIndex(next);
  };

  const handleSelectDefaultIteration = async () => {
    if (!activeWorklet || !activeIteration) return;
    const currentDefault = getWorkletIterationAt(activeWorklet, activeWorklet.selected_iteration_index);
    if (currentDefault.iteration_id === activeIteration.iteration_id) {
      return;
    }
    setDefaultSelecting(true);
    try {
      const response = await requestJson<SelectWorkletIterationResponse>(
        `${API_URL}/worklet-iterations/select-default`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            worklet_id: activeWorklet.worklet_id,
            worklet_iteration_id: activeIteration.iteration_id,
          }),
        },
      );

      const updatedWorklet = ensureWorkletBundle({
        ...activeWorklet,
        selected_iteration_index: response.selected_iteration_index,
      });

      onUpdateWorklet(updatedWorklet);
      setActiveIterationIndex(response.selected_iteration_index);
      toast.success('Default worklet iteration updated');
    } catch (error) {
      console.error(error);
      if (error instanceof ApiError) {
        toast.error(error.message ?? 'Failed to update default iteration');
      } else {
        toast.error(error instanceof Error ? error.message : 'Failed to update default iteration');
      }
    } finally {
      setDefaultSelecting(false);
    }
  };

  const handleEnhanceSubmit = async () => {
    if (!activeWorklet || !activeIteration) return;
    const trimmed = enhancePrompt.trim();
    if (!trimmed) {
      toast.error('Please provide a prompt to enhance the worklet');
      return;
    }
    setIsEnhancing(true);
    try {
      const response = await requestJson<EnhanceWorkletResponse>(
        `${API_URL}/worklet-iterations/enhance`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            worklet_id: activeWorklet.worklet_id,
            worklet_iteration_id: activeIteration.iteration_id,
            prompt: trimmed,
          }),
        },
      );

      const newIteration = ensureWorkletIteration(response.iteration as any);
      const updatedWorklet = ensureWorkletBundle({
        ...activeWorklet,
        iterations: [...activeWorklet.iterations, newIteration],
        selected_iteration_index: response.selected_iteration_index,
      });

      onUpdateWorklet(updatedWorklet);
      setActiveIterationIndex(response.selected_iteration_index);
      setEnhancePrompt('');
      setEnhanceDialogOpen(false);
      toast.success('Worklet enhanced');
    } catch (error) {
      console.error(error);
      const apiErr = error instanceof ApiError ? error : null;
      const message = apiErr?.message ?? (error instanceof Error ? error.message : 'Enhancement failed');
      const retryable = apiErr?.retryable ?? true;
      setOperationError({
        operation: 'enhance',
        message,
        retryable,
        retryFn: retryable ? () => handleEnhanceSubmit() : null,
      });
      toast.error(message);
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleStartEdit = (field: WorkletFieldKey) => {
    if (!activeIteration) return;
    const viewIndex = getViewIndex(field);
    const fieldConfig = FIELD_CONFIGS.find((f) => f.key === field);
    if (!fieldConfig) return;

    if (fieldConfig.type === 'array') {
      setEditValue([...getArrayIteration(getAttribute(activeIteration, field) as ArrayAttribute, viewIndex)]);
    } else if (fieldConfig.type === 'object') {
      setEditValue({ ...getObjectIteration(getAttribute(activeIteration, field) as ObjectAttribute, viewIndex) });
    } else {
      setEditValue(getStringIteration(getAttribute(activeIteration, field) as StringAttribute, viewIndex));
    }
    setEditingField(field);
  };

  const handleCancelEdit = () => {
    setEditingField(null);
    setEditValue(null);
  };

  const handleSaveEdit = async (field: WorkletFieldKey) => {
    if (!activeWorklet || !activeIteration || editValue == null) return;
    setIsSavingEdit(true);
    try {
      const response = await requestJson<IterateWorkletResponse>(`${API_URL}/manual-edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worklet_id: activeWorklet.worklet_id,
          worklet_iteration_id: activeIteration.iteration_id,
          field,
          value: editValue,
        }),
      });

      const attr = getAttribute(activeIteration, field);
      const updatedIteration: WorkletIteration = {
        ...activeIteration,
        [field]: { ...attr, selected_index: response.selected_index, iterations: response.iterations as any },
      };
      const updatedWorklet = ensureWorkletBundle({
        ...activeWorklet,
        iterations: activeWorklet.iterations.map((it) =>
          it.iteration_id === activeIteration.iteration_id ? updatedIteration : it,
        ),
      });
      onUpdateWorklet(updatedWorklet);
      setFieldViewIndices((prev) => ({ ...prev, [field]: response.selected_index }));
      toast.success('Edit saved');
      setEditingField(null);
      setEditValue(null);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof ApiError ? error.message : 'Save failed');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleGenerateField = async (field: 'budget_estimation' | 'risk_assessment') => {
    if (!activeWorklet || !activeIteration) return;
    setGeneratingField(field);
    try {
      const endpoint = field === 'budget_estimation' ? 'generate-budget' : 'generate-risk';
      const response = await requestJson<IterateWorkletResponse>(
        `${API_URL}/worklet-iterations/${endpoint}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            worklet_id: activeWorklet.worklet_id,
            worklet_iteration_id: activeIteration.iteration_id,
          }),
        },
      );

      const attr = getAttribute(activeIteration, field);
      const updatedIteration: WorkletIteration = {
        ...activeIteration,
        [field]: { ...attr, selected_index: response.selected_index, iterations: response.iterations as any },
      };
      const updatedWorklet = ensureWorkletBundle({
        ...activeWorklet,
        iterations: activeWorklet.iterations.map((it) =>
          it.iteration_id === activeIteration.iteration_id ? updatedIteration : it,
        ),
      });
      onUpdateWorklet(updatedWorklet);
      setFieldViewIndices((prev) => ({ ...prev, [field]: response.selected_index }));
      toast.success(`${field === 'budget_estimation' ? 'Budget' : 'Risk assessment'} generated`);
    } catch (error) {
      console.error(error);
      const apiErr = error instanceof ApiError ? error : null;
      toast.error(apiErr?.message ?? 'Generation failed');
    } finally {
      setGeneratingField(null);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <Card className="space-y-4 border-border bg-card p-6">
        <h3 className="text-xl font-semibold text-foreground">Thread Details</h3>
        <div className="space-y-3">
          {clusterName && (
            <div>
              <p className="text-sm text-muted-foreground">Cluster</p>
              <p className="text-foreground">{clusterName}</p>
            </div>
          )}
          <div>
            <p className="text-sm text-muted-foreground">Thread ID</p>
            <p className="font-mono text-foreground">{thread.thread_id}</p>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">Thread Name</p>
            <p className="text-foreground">{thread.thread_name}</p>
          </div>

          {thread.custom_prompt && (
            <div>
              <p className="text-sm text-muted-foreground">Custom Prompt</p>
              <p className="text-foreground [overflow-wrap:anywhere]">{thread.custom_prompt}</p>
            </div>
          )}

          {thread.links && thread.links.length > 0 && (
            <div>
              <p className="text-sm text-muted-foreground mb-2">Links</p>
              <div className="space-y-1">
                {thread.links.map((link) => (
                  <a
                    key={link}
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-accent hover:underline"
                  >
                    {link}
                  </a>
                ))}
              </div>
            </div>
          )}

          {thread.files && thread.files.length > 0 && (
            <div>
              <p className="text-sm text-muted-foreground mb-2">Uploaded Files</p>
              <div className="space-y-2">
                {thread.files.map((file) => (
                  <div key={file} className="flex items-center gap-2 rounded border border-border bg-muted p-2">
                    <FileIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm [overflow-wrap:anywhere]">{file}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-sm text-muted-foreground">Count</p>
            <p className="text-foreground">{thread.count}</p>
          </div>
        </div>
      </Card>

      {worklets.length > 0 && (
        <Card className="space-y-4 border-border bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xl font-semibold text-foreground">Generated Files</h3>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="gradient-primary text-primary-foreground transition-colors hover:opacity-90">
                  <Download className="mr-2 h-4 w-4" />
                  Download All
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleDownloadAll('pdf')}>
                  PDF (All)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDownloadAll('pptx')}>
                  PPTX (All)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {worklets.map((worklet) => {
              const iteration = getDefaultWorkletIteration(worklet);
              const rawTitle = getStringIteration(iteration.title);
              const buttonTitle = rawTitle.trim().length > 0 ? rawTitle : 'Untitled Worklet';
              return (
                <Button
                  key={worklet.worklet_id}
                  variant="outline"
                  className="h-auto justify-start border-border transition-colors hover:border-primary whitespace-normal py-3 text-left"
                  onClick={() => handleOpenWorklet(worklet)}
                >
                  <FileIcon className="mr-2 h-4 w-4" />
                  {thread.similarity_data?.some(
                    (s) => s.worklet_a_id === worklet.worklet_id || s.worklet_b_id === worklet.worklet_id
                  ) && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <AlertTriangle className="mr-1 h-4 w-4 text-amber-500 shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Similar to: {
                            thread.similarity_data
                              ?.filter((s) => s.worklet_a_id === worklet.worklet_id || s.worklet_b_id === worklet.worklet_id)
                              .map((s) => s.worklet_a_id === worklet.worklet_id ? s.worklet_b_title : s.worklet_a_title)
                              .join(', ')
                          }</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  <span className="text-left [overflow-wrap:anywhere]">
                    {buttonTitle}
                  </span>
                </Button>
              );
            })}
          </div>
        </Card>
      )}

      <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-3xl">
          {activeWorklet && activeIteration && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex-1">
                    <DialogTitle className="text-2xl leading-tight [overflow-wrap:anywhere]">
                      {getActiveTitle()}
                    </DialogTitle>
                    {isIterating && (
                      <DialogDescription className="text-sm text-muted-foreground">
                        Iteration in progress. Please wait...
                      </DialogDescription>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleIterationNavigate(-1)}
                      disabled={isIterating || isEnhancing || totalWorkletIterations <= 1 || activeIterationIndex <= 0}
                      aria-label="Previous worklet iteration"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="min-w-[3rem] text-center text-xs font-mono text-foreground">
                      {totalWorkletIterations > 0
                        ? `${activeIterationIndex + 1}/${totalWorkletIterations}`
                        : '0/0'}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleIterationNavigate(1)}
                      disabled={
                        isIterating ||
                        isEnhancing ||
                        totalWorkletIterations <= 1 ||
                        activeIterationIndex >= totalWorkletIterations - 1
                      }
                      aria-label="Next worklet iteration"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={handleSelectDefaultIteration}
                      disabled={
                        isIterating ||
                        isEnhancing ||
                        defaultSelecting ||
                        activeWorklet.selected_iteration_index === activeIterationIndex
                      }
                      aria-label="Set default worklet iteration"
                    >
                      {defaultSelecting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setEnhanceDialogOpen(true)}
                      disabled={isIterating || isEnhancing}
                      aria-label="Enhance worklet"
                    >
                      {isEnhancing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Pencil className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </DialogHeader>
              <ScrollArea className="h-[60vh] pr-4">
                <div className="space-y-6">
                  {FIELD_CONFIGS.map((field) => {
                    const attr = getAttribute(activeIteration, field.key);
                    const total = getIterationCount(attr);
                    const viewIndex = getViewIndex(field.key);
                    const selectedIndex = getSelectedIndex(attr);
                    const isSelected = total > 0 && viewIndex === selectedIndex;
                    const showSelect = total > 0 && !isSelected;

                    // Skip empty budget/risk fields
                    if ((field.key === 'budget_estimation' || field.key === 'risk_assessment') && total <= 1) {
                      const objVal = getObjectIteration(attr as ObjectAttribute, 0);
                      if (Object.keys(objVal).length === 0) {
                        // Show generate button only
                        return (
                          <section key={field.key} className="space-y-2">
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-semibold text-foreground">{field.label}</h4>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => handleGenerateField(field.key as 'budget_estimation' | 'risk_assessment')}
                                disabled={generatingField !== null}
                              >
                                {generatingField === field.key ? (
                                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                ) : field.key === 'budget_estimation' ? (
                                  <DollarSign className="mr-1 h-3 w-3" />
                                ) : (
                                  <ShieldAlert className="mr-1 h-3 w-3" />
                                )}
                                Generate
                              </Button>
                            </div>
                          </section>
                        );
                      }
                    }

                    let content: ReactNode;
                    const isFieldEditing = editingField === field.key;

                    if (isFieldEditing) {
                      if (field.type === 'array') {
                        const arrVal = Array.isArray(editValue) ? editValue : [];
                        content = (
                          <div className="space-y-2">
                            {arrVal.map((item: string, idx: number) => (
                              <div key={idx} className="flex items-center gap-2">
                                <Input
                                  value={item}
                                  onChange={(e) => {
                                    const updated = [...arrVal];
                                    updated[idx] = e.target.value;
                                    setEditValue(updated);
                                  }}
                                  className="flex-1"
                                />
                                <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                                  onClick={() => setEditValue(arrVal.filter((_: any, i: number) => i !== idx))}>
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                            <Button type="button" variant="outline" size="sm"
                              onClick={() => setEditValue([...arrVal, ''])}>
                              <Plus className="mr-1 h-3 w-3" /> Add item
                            </Button>
                          </div>
                        );
                      } else if (field.type === 'object') {
                        const objVal = typeof editValue === 'object' && editValue ? editValue : {};
                        const entries = Object.entries(objVal);
                        content = (
                          <div className="space-y-2">
                            {entries.map(([k, v], idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <Input value={k} className="w-1/3"
                                  onChange={(e) => {
                                    const newObj: Record<string, unknown> = {};
                                    entries.forEach(([ek, ev], ei) => {
                                      newObj[ei === idx ? e.target.value : ek] = ev;
                                    });
                                    setEditValue(newObj);
                                  }} />
                                <Input value={typeof v === 'string' ? v : JSON.stringify(v)} className="flex-1"
                                  onChange={(e) => {
                                    setEditValue({ ...objVal, [k]: e.target.value });
                                  }} />
                                <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                                  onClick={() => {
                                    const { [k]: _, ...rest } = objVal;
                                    setEditValue(rest);
                                  }}>
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                            <Button type="button" variant="outline" size="sm"
                              onClick={() => setEditValue({ ...objVal, '': '' })}>
                              <Plus className="mr-1 h-3 w-3" /> Add entry
                            </Button>
                          </div>
                        );
                      } else {
                        content = (
                          <Textarea value={typeof editValue === 'string' ? editValue : ''}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="min-h-[100px]" />
                        );
                      }
                    } else if (field.type === 'array') {
                      const values = getArrayIteration(attr as ArrayAttribute, viewIndex);
                      content = <ArrayContent values={values} />;
                    } else if (field.type === 'object') {
                      const values = getObjectIteration(attr as ObjectAttribute, viewIndex);
                      if (field.key === 'budget_estimation') {
                        content = <BudgetContent budget={values} />;
                      } else if (field.key === 'risk_assessment') {
                        content = <RiskAssessmentContent data={values} />;
                      } else {
                        content = <MilestonesContent milestones={values} />;
                      }
                    } else {
                      const value = getStringIteration(attr as StringAttribute, viewIndex);
                      content = <StringContent value={value} />;
                    }

                    return (
                      <section key={field.key} className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-semibold text-foreground">
                            {field.label}
                          </h4>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleNavigateField(field.key, -1)}
                              disabled={isIterating || total <= 1 || viewIndex <= 0}
                              aria-label={`Previous iteration for ${field.label}`}
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <span className="min-w-[3rem] text-center font-mono text-foreground">
                              {total > 0 ? `${viewIndex + 1}/${total}` : '0/0'}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleNavigateField(field.key, 1)}
                              disabled={isIterating || total <= 1 || viewIndex >= total - 1}
                              aria-label={`Next iteration for ${field.label}`}
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                          {showSelect && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleSelectFieldIteration(field.key, viewIndex)}
                              disabled={isIterating || selectingField === field.key}
                              aria-label={`Select iteration ${viewIndex + 1} for ${field.label}`}
                            >
                              {selectingField === field.key ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Check className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleOpenFieldPrompt(field.key, viewIndex)}
                            disabled={isIterating || isEnhancing}
                            aria-label={`Iterate ${field.label}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => editingField === field.key ? handleCancelEdit() : handleStartEdit(field.key)}
                            disabled={isIterating || isEnhancing || isSavingEdit}
                            aria-label={editingField === field.key ? `Cancel edit ${field.label}` : `Edit ${field.label}`}
                          >
                            <PenLine className="h-4 w-4" />
                          </Button>
                          {(field.key === 'budget_estimation' || field.key === 'risk_assessment') && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => handleGenerateField(field.key as 'budget_estimation' | 'risk_assessment')}
                              disabled={isIterating || isEnhancing || generatingField !== null}
                            >
                              {generatingField === field.key ? (
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              ) : field.key === 'budget_estimation' ? (
                                <DollarSign className="mr-1 h-3 w-3" />
                              ) : (
                                <ShieldAlert className="mr-1 h-3 w-3" />
                              )}
                              Generate
                            </Button>
                          )}
                          {isSelected && (
                            <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                              Selected
                            </span>
                          )}
                        </div>
                        <div className="rounded border border-border bg-muted/20 p-3">
                          {content}
                        </div>
                        {isFieldEditing && (
                          <div className="flex justify-end gap-2 pt-2">
                            <Button type="button" variant="outline" size="sm" onClick={handleCancelEdit} disabled={isSavingEdit}>
                              Cancel
                            </Button>
                            <Button type="button" size="sm" onClick={() => handleSaveEdit(field.key)} disabled={isSavingEdit}>
                              {isSavingEdit ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                              Save
                            </Button>
                          </div>
                        )}
                      </section>
                    );
                  })}

                  <ReasoningField reasoning={activeIteration.reasoning} />
                  <ReferencesField references={activeIteration.references} filter={referenceFilter} onFilterChange={setReferenceFilter} threadId={thread.thread_id} workletId={activeWorklet.worklet_id} />
                </div>
              </ScrollArea>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => handleDownload('pdf')} disabled={isIterating || isEnhancing}>
                  <Download className="mr-1 h-4 w-4" /> PDF
                </Button>
                <Button onClick={() => handleDownload('pptx')} disabled={isIterating || isEnhancing}>
                  <Download className="mr-1 h-4 w-4" /> PPTX
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={fieldPromptState.open} onOpenChange={(open) => (!open ? closeFieldPrompt() : null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Provide iteration prompt</DialogTitle>
            {fieldPromptState.field && (
              <DialogDescription>
                Field: {FIELD_CONFIGS.find((f) => f.key === fieldPromptState.field)?.label} · Iteration {fieldPromptState.iterationIndex + 1}
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={fieldPromptState.prompt}
              onChange={(event) =>
                setFieldPromptState((prev) => ({ ...prev, prompt: event.target.value }))
              }
              placeholder="Describe how you would like to change this iteration..."
              disabled={isIterating}
              className="min-h-[120px]"
            />
          </div>
            {operationError && operationError.operation === 'iterate' && (
              <div className="rounded border border-destructive/50 bg-destructive/10 p-3 text-sm">
                <p className="text-destructive">{operationError.message}</p>
                <div className="mt-2 flex gap-2">
                  {operationError.retryable && operationError.retryFn && (
                    <Button size="sm" variant="outline" onClick={() => { setOperationError(null); operationError.retryFn!(); }}>
                      Retry
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setOperationError(null)}>Dismiss</Button>
                </div>
              </div>
            )}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={closeFieldPrompt}
              disabled={isIterating}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleFieldPromptSubmit} disabled={isIterating}>
              {isIterating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Pencil className="mr-2 h-4 w-4" />
              )}
              Iterate
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={enhanceDialogOpen} onOpenChange={(open) => {
        if (!open && !isEnhancing) {
          setEnhanceDialogOpen(false);
          setEnhancePrompt('');
        } else if (open) {
          setEnhanceDialogOpen(true);
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Enhance worklet</DialogTitle>
            <DialogDescription>
              Provide instructions to refine the entire worklet iteration.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={enhancePrompt}
              onChange={(event) => setEnhancePrompt(event.target.value)}
              placeholder="Describe how you would like to enhance this worklet..."
              disabled={isEnhancing}
              className="min-h-[140px]"
            />
          </div>
            {operationError && operationError.operation === 'enhance' && (
              <div className="rounded border border-destructive/50 bg-destructive/10 p-3 text-sm">
                <p className="text-destructive">{operationError.message}</p>
                <div className="mt-2 flex gap-2">
                  {operationError.retryable && operationError.retryFn && (
                    <Button size="sm" variant="outline" onClick={() => { setOperationError(null); operationError.retryFn!(); }}>
                      Retry
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setOperationError(null)}>Dismiss</Button>
                </div>
              </div>
            )}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (isEnhancing) return;
                setEnhanceDialogOpen(false);
                setEnhancePrompt('');
              }}
              disabled={isEnhancing}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleEnhanceSubmit} disabled={isEnhancing}>
              {isEnhancing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Pencil className="mr-2 h-4 w-4" />
              )}
              Enhance
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const normalizeWrapText = (input: string) => {
  return (input ?? '')
    .replace(/[\u00A0\u202F\u2060\uFEFF]/g, ' ')
    .replace(/[\u2011]/g, '-');
};

const StringContent = ({ value }: { value: string }) => {
  const safe = normalizeWrapText(value ?? '');
  if (!safe.trim()) {
    return <p className="text-sm text-muted-foreground">No content for this iteration.</p>;
  }
  return <p className="whitespace-pre-wrap leading-relaxed [overflow-wrap:anywhere]">{safe}</p>;
};

const ArrayContent = ({ values }: { values: string[] }) => {
  if (!values || values.length === 0) {
    return <p className="text-sm text-muted-foreground">No entries for this iteration.</p>;
  }
  return (
    <ul className="list-disc space-y-1 pl-4">
      {values.map((value, index) => (
        <li key={`${value}-${index}`} className="[overflow-wrap:anywhere]">
          {normalizeWrapText(value ?? '')}
        </li>
      ))}
    </ul>
  );
};

const MilestonesContent = ({ milestones }: { milestones: Record<string, unknown> }) => {
  const entries = Object.entries(milestones ?? {});
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No milestones for this iteration.</p>;
  }
  return (
    <div className="space-y-2">
      {entries.map(([key, value]) => (
        <div key={key} className="rounded border border-border bg-background p-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {normalizeWrapText(key)}
          </p>
          <pre className="mt-1 whitespace-pre-wrap text-xs [overflow-wrap:anywhere]">
            {typeof value === 'string' ? normalizeWrapText(value) : JSON.stringify(value, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  );
};

const ReasoningField = ({ reasoning }: { reasoning: string }) => {
  const safe = normalizeWrapText(reasoning ?? '');
  const hasContent = safe.trim().length > 0;
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-semibold text-foreground">Reasoning</h4>
      </div>
      <div className="rounded border border-border bg-muted/20 p-3">
        {hasContent ? (
          <p className="whitespace-pre-wrap leading-relaxed [overflow-wrap:anywhere]">{safe}</p>
        ) : (
          <p className="text-sm text-muted-foreground">No reasoning provided for this worklet.</p>
        )}
      </div>
    </section>
  );
};

const BudgetContent = ({ budget }: { budget: Record<string, unknown> }) => {
  if (!budget || Object.keys(budget).length === 0) {
    return <p className="text-sm text-muted-foreground">No budget estimation yet. Click "Generate" to create one.</p>;
  }

  const renderSection = (title: string, data: unknown) => {
    if (!data || typeof data !== 'object') return null;
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) return null;
    return (
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        {entries.map(([k, v]) => (
          <div key={k} className="flex justify-between text-sm">
            <span>{k}</span>
            <span className="font-mono text-muted-foreground">{String(v)}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {renderSection('Infrastructure Costs', budget.infrastructure_costs)}
      {renderSection('Team Costs', budget.team_costs)}
      {renderSection('Tool Costs', budget.tool_costs)}
      {budget.total_estimated && (
        <div className="rounded bg-primary/10 p-2 text-center">
          <p className="text-xs text-muted-foreground">Total Estimated</p>
          <p className="font-semibold text-primary">{String(budget.total_estimated)}</p>
        </div>
      )}
      {Array.isArray(budget.assumptions) && budget.assumptions.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assumptions</p>
          <ul className="list-disc pl-4 text-sm">
            {(budget.assumptions as string[]).map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
};

const RiskAssessmentContent = ({ data }: { data: Record<string, unknown> }) => {
  const risks = Array.isArray(data?.risks) ? data.risks : [];
  if (risks.length === 0) {
    return <p className="text-sm text-muted-foreground">No risk assessment yet. Click "Generate" to create one.</p>;
  }

  const levelColor = (level: string) => {
    switch (level?.toLowerCase()) {
      case 'high': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'medium': return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
      case 'low': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="pb-2 pr-3">Risk</th>
            <th className="pb-2 pr-3">Likelihood</th>
            <th className="pb-2 pr-3">Impact</th>
            <th className="pb-2">Mitigation</th>
          </tr>
        </thead>
        <tbody>
          {risks.map((r: any, i: number) => (
            <tr key={i} className="border-b border-border/50">
              <td className="py-2 pr-3">{r.risk}</td>
              <td className="py-2 pr-3">
                <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${levelColor(r.likelihood)}`}>
                  {r.likelihood}
                </span>
              </td>
              <td className="py-2 pr-3">
                <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${levelColor(r.impact)}`}>
                  {r.impact}
                </span>
              </td>
              <td className="py-2 text-muted-foreground">{r.mitigation}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const TAG_COLORS: Record<string, string> = {
  scholar: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  github: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  google: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  patent: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
};

const QualityStars = ({ score }: { score: number | null | undefined }) => {
  if (score == null) return null;
  const stars = Math.max(1, Math.round(score * 5));
  return (
    <span className="inline-flex gap-0.5" title={`Quality: ${(score * 100).toFixed(0)}%`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={`h-3 w-3 ${i < stars ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`} />
      ))}
    </span>
  );
};

const ReferencesField = ({
  references,
  filter,
  onFilterChange,
  threadId,
  workletId,
}: {
  references: WorkletIteration['references'];
  filter: string;
  onFilterChange: (f: string) => void;
  threadId: string;
  workletId: string;
}) => {
  if (!references || references.length === 0) {
    return null;
  }

  const tags = ['all', ...Array.from(new Set(references.map((r) => r.tag)))];
  const filtered = filter === 'all' ? references : references.filter((r) => r.tag === filter);

  return (
    <section className="space-y-2">
      <h4 className="text-sm font-semibold text-foreground">References</h4>
      <Tabs defaultValue="list" className="w-full">
        <TabsList className="h-8">
          <TabsTrigger value="list" className="text-xs">List</TabsTrigger>
          <TabsTrigger value="graph" className="text-xs">Graph</TabsTrigger>
        </TabsList>
        <TabsContent value="list">
          <div className="flex flex-wrap gap-1 mb-2">
            {tags.map((tag) => (
              <Button
                key={tag}
                type="button"
                variant={filter === tag ? 'default' : 'outline'}
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={() => onFilterChange(tag)}
              >
                {tag === 'all' ? 'All' : tag.charAt(0).toUpperCase() + tag.slice(1)}
              </Button>
            ))}
          </div>
          <div className="space-y-3">
            {filtered.map((reference) => (
              <article
                key={`${reference.link}-${reference.title}`}
                className="rounded border border-border bg-background p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <a
                    href={reference.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-primary hover:underline"
                  >
                    {reference.tag === 'patent' && <ScrollText className="inline mr-1 h-3.5 w-3.5" />}
                    {reference.title}
                  </a>
                  <QualityStars score={reference.quality_score} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {normalizeWrapText(reference.description)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TAG_COLORS[reference.tag] || 'bg-muted text-muted-foreground'}`}>
                    {reference.tag}
                  </span>
                  {reference.citation_count != null && reference.citation_count > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {reference.citation_count} {reference.tag === 'github' ? 'stars' : 'citations'}
                    </span>
                  )}
                  {reference.published_year != null && (
                    <span className="text-[10px] text-muted-foreground">{reference.published_year}</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="graph">
          <ReferenceGraph threadId={threadId} workletId={workletId} />
        </TabsContent>
      </Tabs>
    </section>
  );
};

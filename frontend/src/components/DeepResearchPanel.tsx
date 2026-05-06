import { useState, useEffect, useRef } from 'react';
import { X, ExternalLink, Loader2, AlertCircle, GitBranch, Star, Calendar, User, Building2, GraduationCap, Cpu, FlaskConical, Lightbulb, Target, Download, Sparkles, Eye, FileText, ChevronRight, BookOpen, TrendingUp } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { getSocket } from '@/lib/socket';
import { requestJson, requestBlob } from '@/lib/http';
import { toast } from 'sonner';
import { API_URL } from '../../config';
import type {
  DeepResearchResult,
  EntityExtraction,
  AsIsSynthesis,
  ComparativeAnalysis,
  FutureDirections,
  DetailedProblemStatement,
  ResearchQuestion,
} from '@/types/deep-research';
import type { Reference } from '@/types/thread';

interface DeepResearchPanelProps {
  researchId: string;
  open: boolean;
  onClose: () => void;
  inline?: boolean;
}

export const DeepResearchPanel = ({ researchId, open, onClose, inline = false }: DeepResearchPanelProps) => {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>('running');
  const [progressMessage, setProgressMessage] = useState<string>('Initializing research...');
  const [entities, setEntities] = useState<EntityExtraction | null>(null);
  const [asIs, setAsIs] = useState<AsIsSynthesis | null>(null);
  const [comparative, setComparative] = useState<ComparativeAnalysis | null>(null);
  const [future, setFuture] = useState<FutureDirections | null>(null);
  const [references, setReferences] = useState<Reference[]>([]);
  const [detailedProblems, setDetailedProblems] = useState<Record<string, DetailedProblemStatement> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<'pdf' | 'pptx' | null>(null);
  const cleanupRef = useRef<() => void>(() => {});

  // Fetch existing data on mount
  useEffect(() => {
    if (!researchId || !open) return;

    const fetchExisting = async () => {
      try {
        const data = await requestJson<DeepResearchResult>(
          `${API_URL}/deep-research/${researchId}`
        );
        if (data.entities) setEntities(data.entities);
        if (data.as_is) setAsIs(data.as_is);
        if (data.comparative) setComparative(data.comparative);
        if (data.future) setFuture(data.future);
        if (data.references) setReferences(data.references);
        if (data.detailed_problems) setDetailedProblems(data.detailed_problems);
        setStatus(data.status);
        if (data.status === 'completed') {
          setProgressMessage('');
        } else if (data.status === 'failed') {
          setError('Research failed');
        }
      } catch {
        // Will be populated by socket events
      } finally {
        setLoading(false);
      }
    };
    fetchExisting();
  }, [researchId, open]);

  // Socket listeners
  useEffect(() => {
    if (!researchId || !open) return;

    const socket = getSocket();

    const updateHandler = (data: { message: string }) => {
      setProgressMessage(data.message);
    };

    const sectionHandler = (data: { section: string; data: any }) => {
      switch (data.section) {
        case 'entities':
          setEntities(data.data);
          break;
        case 'as_is':
          setAsIs(data.data);
          break;
        case 'comparative':
          setComparative(data.data);
          break;
        case 'future':
          setFuture(data.data);
          break;
      }
    };

    const completeHandler = () => {
      setStatus('completed');
      setProgressMessage('');
    };

    const failedHandler = (data: { error: string }) => {
      setStatus('failed');
      setError(data.error);
      setProgressMessage('');
    };

    socket.on(`${researchId}/research_update`, updateHandler);
    socket.on(`${researchId}/section_ready`, sectionHandler);
    socket.on(`${researchId}/research_complete`, completeHandler);
    socket.on(`${researchId}/research_failed`, failedHandler);

    cleanupRef.current = () => {
      socket.off(`${researchId}/research_update`, updateHandler);
      socket.off(`${researchId}/section_ready`, sectionHandler);
      socket.off(`${researchId}/research_complete`, completeHandler);
      socket.off(`${researchId}/research_failed`, failedHandler);
    };

    return () => {
      cleanupRef.current();
    };
  }, [researchId, open]);

  const handleDownloadReport = async (type: 'pdf' | 'pptx') => {
    setDownloading(type);
    try {
      const blob = await requestBlob(
        `${API_URL}/deep-research/${researchId}/download/${type}`
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `deep_research_report.${type}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(`Download failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setDownloading(null);
    }
  };

  const handleDetailedProblemGenerated = (index: number, problem: DetailedProblemStatement) => {
    setDetailedProblems((prev) => ({ ...prev, [String(index)]: problem }));
  };

  const header = (
    <div className="flex items-center justify-between p-4 border-b border-border">
      <div className="flex items-center gap-3">
        <FlaskConical className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Deep Research</h2>
        {status === 'running' && (
          <Badge variant="secondary" className="animate-pulse">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            In Progress
          </Badge>
        )}
        {status === 'completed' && (
          <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
            Completed
          </Badge>
        )}
        {status === 'failed' && (
          <Badge variant="destructive">Failed</Badge>
        )}
      </div>
      <div className="flex items-center gap-2">
        {status === 'completed' && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDownloadReport('pdf')}
              disabled={downloading !== null}
            >
              {downloading === 'pdf' ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-1" />
              )}
              PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDownloadReport('pptx')}
              disabled={downloading !== null}
            >
              {downloading === 'pptx' ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-1" />
              )}
              PPTX
            </Button>
          </>
        )}
        {!inline && (
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );

  const body = (
    <div className="p-6 space-y-6">
      {/* Initial loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && (
        <>
          {/* Progress */}
          {status === 'running' && progressMessage && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              {progressMessage}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-3">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Entities */}
          {entities ? (
            <EntitiesSection data={entities} />
          ) : status === 'running' ? (
            <SectionSkeleton title="Extracting entities..." />
          ) : null}

          {/* As-Is */}
          {asIs ? (
            <AsIsSection data={asIs} />
          ) : entities && status === 'running' ? (
            <SectionSkeleton title="Analyzing current state of the art..." />
          ) : null}

          {/* Comparative */}
          {comparative ? (
            <ComparativeSection data={comparative} />
          ) : asIs && status === 'running' ? (
            <SectionSkeleton title="Performing comparative analysis..." />
          ) : null}

          {/* Patents & References (grouped by source) */}
          {references.length > 0 && (
            <ReferencesSection references={references} />
          )}

          {/* Future */}
          {future ? (
            <FutureSection
              data={future}
              researchId={researchId}
              existingDetailedProblems={detailedProblems}
              onDetailedProblemGenerated={handleDetailedProblemGenerated}
            />
          ) : comparative && status === 'running' ? (
            <SectionSkeleton title="Generating future directions..." />
          ) : null}
        </>
      )}
    </div>
  );

  if (inline) {
    return (
      <Card className="border border-border">
        {header}
        {body}
      </Card>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] p-0 gap-0">
        {header}
        <ScrollArea className="max-h-[calc(90vh-60px)]">
          {body}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

// ── Section Components ──────────────────────────────────────────────

const SectionSkeleton = ({ title }: { title: string }) => (
  <Card className="p-4 space-y-3 border-dashed">
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {title}
    </div>
    <Skeleton className="h-4 w-3/4" />
    <Skeleton className="h-4 w-1/2" />
    <Skeleton className="h-4 w-2/3" />
  </Card>
);

const EntitiesSection = ({ data }: { data: EntityExtraction }) => (
  <Card className="p-5 space-y-4">
    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
      Entities Identified
    </h3>
    <div className="space-y-3">
      {data.technologies.length > 0 && (
        <EntityRow icon={<Cpu className="h-4 w-4" />} label="Technologies" items={data.technologies} color="blue" />
      )}
      {data.people.length > 0 && (
        <EntityRow icon={<User className="h-4 w-4" />} label="People" items={data.people} color="purple" />
      )}
      {data.companies.length > 0 && (
        <EntityRow icon={<Building2 className="h-4 w-4" />} label="Companies" items={data.companies} color="green" />
      )}
      {data.institutions.length > 0 && (
        <EntityRow icon={<GraduationCap className="h-4 w-4" />} label="Institutions" items={data.institutions} color="orange" />
      )}
      {data.research_areas.length > 0 && (
        <EntityRow icon={<FlaskConical className="h-4 w-4" />} label="Research Areas" items={data.research_areas} color="red" />
      )}
    </div>
  </Card>
);

const EntityRow = ({ icon, label, items, color }: { icon: React.ReactNode; label: string; items: string[]; color: string }) => {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    purple: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    green: 'bg-green-500/10 text-green-500 border-green-500/20',
    orange: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
    red: 'bg-red-500/10 text-red-500 border-red-500/20',
  };

  return (
    <div className="flex items-start gap-3">
      <div className="flex items-center gap-1.5 min-w-[120px] text-sm text-muted-foreground pt-0.5">
        {icon} {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <Badge key={i} variant="outline" className={colorClasses[color] || ''}>
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
};

const AsIsSection = ({ data }: { data: AsIsSynthesis }) => (
  <Card className="p-5 space-y-5">
    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
      Current State of the Art
    </h3>

    {/* Summary */}
    <p className="text-sm leading-relaxed">{data.summary}</p>

    {/* SOTA Comparison Table */}
    {data.sota_comparison && data.sota_comparison.length > 0 && (
      <>
        <Separator />
        <div className="space-y-2">
          <h4 className="text-sm font-medium flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-primary" /> Head-to-Head Comparison
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left p-2 font-medium">Approach</th>
                  <th className="text-left p-2 font-medium">Actor</th>
                  <th className="text-left p-2 font-medium">Metric</th>
                  <th className="text-left p-2 font-medium">Best</th>
                  <th className="text-left p-2 font-medium">Strength</th>
                  <th className="text-left p-2 font-medium">Limitation</th>
                  <th className="text-left p-2 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {data.sota_comparison.map((s, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="p-2 font-medium">
                      {s.approach}
                      {s.year && <span className="text-muted-foreground ml-1">({s.year})</span>}
                    </td>
                    <td className="p-2 text-muted-foreground">{s.actor || '—'}</td>
                    <td className="p-2 text-muted-foreground">{s.key_metric}</td>
                    <td className="p-2 font-mono text-primary">{s.current_best}</td>
                    <td className="p-2 text-green-500">{s.strengths_one_line}</td>
                    <td className="p-2 text-orange-500">{s.limitations_one_line}</td>
                    <td className="p-2">
                      {s.source && s.source.startsWith('http') ? (
                        <a
                          href={s.source}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-primary inline-flex items-center"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground italic truncate block max-w-[120px]" title={s.source}>
                          {s.source}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>
    )}

    <Separator />

    {/* Key Findings */}
    {data.key_findings.length > 0 && (
      <div className="space-y-2">
        <h4 className="text-sm font-medium">Key Findings</h4>
        <div className="space-y-2">
          {data.key_findings.map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <Target className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div>
                <span>{f.finding}</span>
                {f.source && (
                  <a
                    href={f.source.startsWith('http') ? f.source : undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 text-xs text-muted-foreground hover:text-primary inline-flex items-center"
                  >
                    {f.year && <span className="mr-1">({f.year})</span>}
                    {f.source.startsWith('http') && <ExternalLink className="h-3 w-3" />}
                    {!f.source.startsWith('http') && <span className="italic">{f.source}</span>}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    )}

    <Separator />

    {/* Timeline */}
    {data.timeline.length > 0 && (
      <div className="space-y-2">
        <h4 className="text-sm font-medium">Timeline</h4>
        <div className="space-y-1.5">
          {data.timeline.map((t, i) => (
            <div key={i} className="flex items-start gap-3 text-sm">
              <Badge variant="outline" className="font-mono text-xs shrink-0">{t.year}</Badge>
              <span><strong>{t.actor}</strong>: {t.event}</span>
            </div>
          ))}
        </div>
      </div>
    )}

    <Separator />

    {/* Key Players */}
    {data.key_players.length > 0 && (
      <div className="space-y-2">
        <h4 className="text-sm font-medium">Key Players</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.key_players.map((p, i) => (
            <Card key={i} className="p-3 space-y-1 bg-muted/30">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{p.name}</span>
                {p.link && (
                  <a href={p.link} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-primary" />
                  </a>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{p.role}</p>
              <p className="text-xs">{p.notable_work}</p>
            </Card>
          ))}
        </div>
      </div>
    )}
  </Card>
);

const ComparativeSection = ({ data }: { data: ComparativeAnalysis }) => (
  <Card className="p-5 space-y-5">
    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
      Comparative Analysis
    </h3>

    {/* Comparisons */}
    {data.comparisons.length > 0 && (
      <div className="space-y-3">
        {data.comparisons.map((c, i) => (
          <Card key={i} className="p-4 space-y-2 bg-muted/30">
            <h4 className="text-sm font-medium">{c.entity}</h4>
            <p className="text-xs text-muted-foreground">{c.approach}</p>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <p className="text-xs font-medium text-green-500 mb-1">Strengths</p>
                <ul className="text-xs space-y-0.5">
                  {c.strengths.map((s, j) => (
                    <li key={j} className="flex items-start gap-1">
                      <span className="text-green-500 shrink-0">+</span> {s}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-medium text-red-500 mb-1">Limitations</p>
                <ul className="text-xs space-y-0.5">
                  {c.limitations.map((l, j) => (
                    <li key={j} className="flex items-start gap-1">
                      <span className="text-red-500 shrink-0">-</span> {l}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        ))}
      </div>
    )}

    <Separator />

    {/* Open Source */}
    {data.open_source_landscape.length > 0 && (
      <div className="space-y-2">
        <h4 className="text-sm font-medium">Open Source Landscape</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.open_source_landscape.map((p, i) => (
            <Card key={i} className="p-3 space-y-1 bg-muted/30">
              <div className="flex items-center justify-between">
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium hover:text-primary flex items-center gap-1"
                >
                  <GitBranch className="h-3 w-3" /> {p.name}
                </a>
                {p.stars != null && (
                  <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                    <Star className="h-3 w-3" /> {p.stars}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{p.description}</p>
              {p.last_updated && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> {p.last_updated}
                </p>
              )}
            </Card>
          ))}
        </div>
      </div>
    )}

    <Separator />

    {/* Gaps */}
    {data.gaps.length > 0 && (
      <div className="space-y-2">
        <h4 className="text-sm font-medium">Identified Gaps</h4>
        <ul className="space-y-1.5">
          {data.gaps.map((g, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <AlertCircle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
              {g}
            </li>
          ))}
        </ul>
      </div>
    )}
  </Card>
);

const ReferencesSection = ({ references }: { references: Reference[] }) => {
  const grouped: Record<string, Reference[]> = {};
  for (const ref of references) {
    const tag = (ref.tag || 'web').toLowerCase();
    if (!grouped[tag]) grouped[tag] = [];
    grouped[tag].push(ref);
  }

  const groupOrder = ['patent', 'scholar', 'github', 'web', 'google'];
  const orderedTags = [
    ...groupOrder.filter((t) => grouped[t]),
    ...Object.keys(grouped).filter((t) => !groupOrder.includes(t)),
  ];

  const tagLabels: Record<string, string> = {
    patent: 'Patents',
    scholar: 'Academic Papers',
    github: 'GitHub Repositories',
    web: 'Web References',
    google: 'Web References',
  };

  const tagIcons: Record<string, React.ReactNode> = {
    patent: <BookOpen className="h-4 w-4" />,
    scholar: <GraduationCap className="h-4 w-4" />,
    github: <GitBranch className="h-4 w-4" />,
    web: <ExternalLink className="h-4 w-4" />,
    google: <ExternalLink className="h-4 w-4" />,
  };

  const tagColors: Record<string, string> = {
    patent: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    scholar: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    github: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    web: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
    google: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  };

  return (
    <Card className="p-5 space-y-5">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        References
      </h3>

      {orderedTags.map((tag, idx) => {
        const items = grouped[tag];
        const label = tagLabels[tag] || tag;
        const icon = tagIcons[tag] || <ExternalLink className="h-4 w-4" />;
        const colorCls = tagColors[tag] || 'bg-gray-500/10 text-gray-500 border-gray-500/20';
        return (
          <div key={tag} className="space-y-2">
            {idx > 0 && <Separator className="mb-3" />}
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium flex items-center gap-1.5">
                {icon} {label}
              </h4>
              <Badge variant="outline" className={`${colorCls} text-[10px]`}>
                {items.length}
              </Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {items.slice(0, 12).map((ref, i) => (
                <a
                  key={i}
                  href={ref.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-2.5 rounded-md bg-muted/30 hover:bg-muted/50 border border-border/50 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="space-y-0.5 min-w-0">
                      <p className="text-xs font-medium line-clamp-2">{ref.title}</p>
                      {ref.description && (
                        <p className="text-[11px] text-muted-foreground line-clamp-2">
                          {ref.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        {ref.published_year && <span>{ref.published_year}</span>}
                        {ref.citation_count != null && (
                          <span className="flex items-center gap-0.5">
                            <Star className="h-2.5 w-2.5" /> {ref.citation_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </a>
              ))}
            </div>
            {items.length > 12 && (
              <p className="text-[10px] text-muted-foreground italic">
                +{items.length - 12} more
              </p>
            )}
          </div>
        );
      })}
    </Card>
  );
};

// ── Future Section (stateful — supports detailed problem generation) ──

const FutureSection = ({
  data,
  researchId,
  existingDetailedProblems,
  onDetailedProblemGenerated,
}: {
  data: FutureDirections;
  researchId: string;
  existingDetailedProblems?: Record<string, DetailedProblemStatement> | null;
  onDetailedProblemGenerated: (index: number, problem: DetailedProblemStatement) => void;
}) => {
  const [generating, setGenerating] = useState<number | null>(null);
  const [localDetailed, setLocalDetailed] = useState<Record<string, DetailedProblemStatement>>(
    existingDetailedProblems ?? {}
  );
  const [viewingProblem, setViewingProblem] = useState<DetailedProblemStatement | null>(null);
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);
  const [downloadingDetailed, setDownloadingDetailed] = useState<string | null>(null);

  // Sync from parent when existingDetailedProblems changes
  useEffect(() => {
    if (existingDetailedProblems) {
      setLocalDetailed((prev) => ({ ...prev, ...existingDetailedProblems }));
    }
  }, [existingDetailedProblems]);

  const handleGenerate = async (index: number) => {
    setGenerating(index);
    try {
      const result = await requestJson<DetailedProblemStatement>(
        `${API_URL}/deep-research/${researchId}/generate-detailed-problem`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ problem_index: index }),
        }
      );
      setLocalDetailed((prev) => ({ ...prev, [String(index)]: result }));
      onDetailedProblemGenerated(index, result);
      setViewingProblem(result);
      setViewingIndex(index);
      toast.success('Detailed problem statement generated');
    } catch (err: any) {
      toast.error(`Generation failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setGenerating(null);
    }
  };

  const handleDownloadDetailed = async (idx: string, type: 'pdf' | 'pptx') => {
    setDownloadingDetailed(`${idx}-${type}`);
    try {
      const blob = await requestBlob(
        `${API_URL}/deep-research/${researchId}/detailed-problem/${idx}/download/${type}`
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `detailed_problem_${idx}.${type}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(`Download failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setDownloadingDetailed(null);
    }
  };

  return (
    <>
      <Card className="p-5 space-y-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Future Directions & Problem Statements
        </h3>

        {/* Problem Statements */}
        {data.problem_statements.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Forward-Looking Problem Statements</h4>
            {data.problem_statements.map((p, i) => (
              <Card key={i} className="p-4 space-y-2 bg-muted/30 border-l-4 border-l-primary">
                <h5 className="text-sm font-semibold">{p.title}</h5>
                <p className="text-xs leading-relaxed">{p.description}</p>

                {/* Core Tech + Research Area chips */}
                {((p.core_technologies && p.core_technologies.length > 0) ||
                  (p.research_areas && p.research_areas.length > 0)) && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {p.core_technologies?.map((t, j) => (
                      <Badge key={`t-${j}`} variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-[10px]">
                        <Cpu className="h-2.5 w-2.5 mr-1" /> {t}
                      </Badge>
                    ))}
                    {p.research_areas?.map((r, j) => (
                      <Badge key={`r-${j}`} variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20 text-[10px]">
                        <FlaskConical className="h-2.5 w-2.5 mr-1" /> {r}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 mt-1">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-0.5">Rationale</p>
                    <p className="text-xs">{p.rationale}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-0.5">Potential Impact</p>
                    <p className="text-xs">{p.potential_impact}</p>
                  </div>
                </div>

                {/* Detailed Problem Action Bar */}
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
                  {localDetailed[String(i)] ? (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setViewingProblem(localDetailed[String(i)]);
                          setViewingIndex(i);
                        }}
                      >
                        <Eye className="h-3 w-3 mr-1" /> View Detailed
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownloadDetailed(String(i), 'pdf')}
                        disabled={downloadingDetailed !== null}
                      >
                        {downloadingDetailed === `${i}-pdf` ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Download className="h-3 w-3 mr-1" />
                        )}
                        PDF
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownloadDetailed(String(i), 'pptx')}
                        disabled={downloadingDetailed !== null}
                      >
                        {downloadingDetailed === `${i}-pptx` ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Download className="h-3 w-3 mr-1" />
                        )}
                        PPTX
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleGenerate(i)}
                      disabled={generating !== null}
                    >
                      {generating === i ? (
                        <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Generating...</>
                      ) : (
                        <><Sparkles className="h-3 w-3 mr-1" /> Generate Detailed Problem Statement</>
                      )}
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

        <Separator />

        {/* Opportunities */}
        {data.opportunities.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Opportunities</h4>
            <ul className="space-y-1.5">
              {data.opportunities.map((o, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Lightbulb className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                  {o}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Separator />

        {/* Research Questions */}
        {data.research_questions.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Open Research Questions</h4>
            <div className="space-y-3">
              {data.research_questions.map((q, i) => {
                const isStructured = typeof q !== 'string';
                if (!isStructured) {
                  // Legacy string form
                  return (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <Badge variant="outline" className="font-mono text-[10px] shrink-0">{i + 1}</Badge>
                      <p className="text-sm">{q as string}</p>
                    </div>
                  );
                }
                const rq = q as ResearchQuestion;
                return (
                  <Card key={i} className="p-3 space-y-1.5 bg-muted/30">
                    <div className="flex items-start gap-2">
                      <Badge variant="outline" className="font-mono text-[10px] shrink-0 mt-0.5">{i + 1}</Badge>
                      <p className="text-sm font-medium">{rq.question}</p>
                    </div>
                    {rq.expected_gain && (
                      <div className="flex items-start gap-2 ml-7">
                        <TrendingUp className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
                        <div className="text-xs">
                          <span className="text-muted-foreground">Expected gain: </span>
                          <span>{rq.expected_gain}</span>
                        </div>
                      </div>
                    )}
                    {rq.success_criteria && (
                      <div className="flex items-start gap-2 ml-7">
                        <Target className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                        <div className="text-xs">
                          <span className="text-muted-foreground">Success criteria: </span>
                          <span>{rq.success_criteria}</span>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {/* Detailed Problem Sheet */}
      <DetailedProblemSheet
        problem={viewingProblem}
        problemIndex={viewingIndex}
        researchId={researchId}
        onClose={() => {
          setViewingProblem(null);
          setViewingIndex(null);
        }}
        onDownload={handleDownloadDetailed}
        downloadingDetailed={downloadingDetailed}
      />
    </>
  );
};

// ── Detailed Problem Sheet ──────────────────────────────────────────

const DetailedProblemSheet = ({
  problem,
  problemIndex,
  researchId,
  onClose,
  onDownload,
  downloadingDetailed,
}: {
  problem: DetailedProblemStatement | null;
  problemIndex: number | null;
  researchId: string;
  onClose: () => void;
  onDownload: (idx: string, type: 'pdf' | 'pptx') => void;
  downloadingDetailed: string | null;
}) => {
  if (!problem) return null;

  return (
    <Sheet open={!!problem} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-3xl p-0">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <SheetHeader className="space-y-0">
            <SheetTitle className="text-base">{problem.title}</SheetTitle>
            <SheetDescription>Detailed Problem Statement</SheetDescription>
          </SheetHeader>
          {problemIndex !== null && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onDownload(String(problemIndex), 'pdf')}
                disabled={downloadingDetailed !== null}
              >
                <Download className="h-3 w-3 mr-1" /> PDF
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onDownload(String(problemIndex), 'pptx')}
                disabled={downloadingDetailed !== null}
              >
                <Download className="h-3 w-3 mr-1" /> PPTX
              </Button>
            </div>
          )}
        </div>
        <ScrollArea className="h-[calc(100vh-80px)]">
          <div className="p-6 space-y-6">
            <TextSection title="Executive Summary" content={problem.executive_summary} />
            <TextSection title="Background & Motivation" content={problem.background_and_motivation} />
            <TextSection title="Problem Definition" content={problem.problem_definition} />
            <TextSection title="Current State of the Art" content={problem.current_sota} />
            <TextSection title="Proposed Approach" content={problem.proposed_approach} />
            <TextSection title="Challenge / Use Case" content={problem.challenge_use_case} />

            <BulletSection title="Deliverables" items={problem.deliverables} />
            <BulletSection title="KPIs" items={problem.kpis} />
            <BulletSection title="Prerequisites" items={problem.prerequisites} />

            <TextSection title="Infrastructure Requirements" content={problem.infrastructure_requirements} />
            <TextSection title="Tech Stack" content={problem.tech_stack} />

            {/* Milestones */}
            {problem.milestones && Object.keys(problem.milestones).length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Milestones (6 months)
                </h4>
                <div className="space-y-2">
                  {Object.entries(problem.milestones).map(([key, value]) => (
                    <div key={key} className="flex items-start gap-3">
                      <Badge variant="outline" className="font-mono text-xs shrink-0">{key}</Badge>
                      <p className="text-sm">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Risk Assessment */}
            {problem.risk_assessment && problem.risk_assessment.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Risk Assessment
                </h4>
                <div className="space-y-3">
                  {problem.risk_assessment.map((r, i) => (
                    <Card key={i} className="p-3 space-y-1.5 bg-muted/30">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-sm font-medium">{r.risk}</p>
                          <p className="text-xs"><span className="text-muted-foreground">Impact:</span> {r.impact}</p>
                          <p className="text-xs"><span className="text-muted-foreground">Mitigation:</span> {r.mitigation}</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Budget */}
            {problem.budget_estimation && Object.keys(problem.budget_estimation).length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Budget Estimation
                </h4>
                <div className="space-y-1">
                  {Object.entries(problem.budget_estimation).map(([key, value]) => (
                    <div key={key} className="flex items-start gap-2 text-sm">
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <span><strong>{key}:</strong> {String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <BulletSection title="Key References" items={problem.key_references} />
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

// ── Small Helper Components ─────────────────────────────────────────

const TextSection = ({ title, content }: { title: string; content: string }) => {
  if (!content) return null;
  return (
    <div className="space-y-1.5">
      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{title}</h4>
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
    </div>
  );
};

const BulletSection = ({ title, items }: { title: string; items: string[] }) => {
  if (!items || items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{title}</h4>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <span className="whitespace-pre-wrap">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

import { useCallback, useEffect, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import { Loader2 } from 'lucide-react';
import { API_URL } from '../../config';

interface GraphNode {
  id: string;
  label: string;
  type: string;
  size: number;
  reference?: {
    title: string;
    link: string;
    description: string;
    tag: string;
    citation_count?: number | null;
    published_year?: number | null;
    quality_score?: number | null;
  };
  x?: number;
  y?: number;
}

interface GraphEdge {
  source: string | GraphNode;
  target: string | GraphNode;
  weight: number;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const TAG_COLORS: Record<string, string> = {
  scholar: '#3b82f6',
  github: '#6b7280',
  patent: '#f59e0b',
  web: '#22c55e',
  google: '#22c55e',
  topic: '#8b5cf6',
};

export function ReferenceGraph({
  threadId,
  workletId,
}: {
  threadId: string;
  workletId: string;
}) {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraphMethods | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${API_URL}/thread/${threadId}/worklet/${workletId}/reference-graph`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setGraphData({
          nodes: data.nodes ?? [],
          edges: data.edges ?? [],
        });
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [threadId, workletId]);

  const paintNode = useCallback((node: GraphNode, ctx: CanvasRenderingContext2D) => {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const r = node.size / 3;
    const color = TAG_COLORS[node.type] || '#6b7280';

    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    ctx.font = `${Math.max(2, r * 0.6)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#e5e7eb';
    ctx.fillText(node.label, x, y + r + 1);
  }, []);

  const handleNodeClick = useCallback((node: GraphNode) => {
    if (node.reference?.link) {
      setSelectedNode(node);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading graph...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-destructive">
        Failed to load graph: {error}
      </div>
    );
  }

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
        No graph data available.
      </div>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <div className="rounded border border-border bg-black/80 overflow-hidden" style={{ height: 400 }}>
        <ForceGraph2D
          ref={graphRef as any}
          graphData={{ nodes: graphData.nodes, links: graphData.edges }}
          nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D) => paintNode(node as GraphNode, ctx)}
          nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
            const r = (node as GraphNode).size / 3;
            ctx.beginPath();
            ctx.arc(node.x ?? 0, node.y ?? 0, r + 2, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
          }}
          onNodeClick={(node: any) => handleNodeClick(node as GraphNode)}
          linkWidth={(link: any) => Math.min((link as GraphEdge).weight, 5)}
          linkColor={() => 'rgba(148, 163, 184, 0.3)'}
          backgroundColor="transparent"
          width={containerRef.current?.clientWidth || 600}
          height={400}
          cooldownTicks={80}
        />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-2 text-[10px]">
        {Object.entries(TAG_COLORS).map(([tag, color]) => (
          <span key={tag} className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            {tag.charAt(0).toUpperCase() + tag.slice(1)}
          </span>
        ))}
      </div>

      {/* Selected node detail panel */}
      {selectedNode?.reference && (
        <div className="absolute top-2 right-2 w-64 p-3 rounded border border-border bg-background shadow-lg text-xs space-y-1 z-10">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm truncate">{selectedNode.reference.title}</span>
            <button onClick={() => setSelectedNode(null)} className="text-muted-foreground hover:text-foreground ml-1">
              &times;
            </button>
          </div>
          <p className="text-muted-foreground line-clamp-3">{selectedNode.reference.description}</p>
          <div className="flex gap-2 text-muted-foreground">
            {selectedNode.reference.citation_count != null && (
              <span>{selectedNode.reference.citation_count} {selectedNode.reference.tag === 'github' ? 'stars' : 'citations'}</span>
            )}
            {selectedNode.reference.published_year != null && (
              <span>{selectedNode.reference.published_year}</span>
            )}
          </div>
          <a
            href={selectedNode.reference.link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline block mt-1"
          >
            Open link &rarr;
          </a>
        </div>
      )}
    </div>
  );
}

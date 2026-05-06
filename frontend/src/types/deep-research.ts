import type { Reference } from './thread';

export interface EntityExtraction {
  technologies: string[];
  people: string[];
  companies: string[];
  institutions: string[];
  research_areas: string[];
}

export interface KeyFinding {
  finding: string;
  source: string;
  year?: number | null;
}

export interface TimelineEntry {
  year: number;
  event: string;
  actor: string;
}

export interface KeyPlayer {
  name: string;
  role: string;
  notable_work: string;
  link?: string | null;
}

export interface SotaApproach {
  approach: string;
  actor?: string | null;
  key_metric: string;
  current_best: string;
  strengths_one_line: string;
  limitations_one_line: string;
  source: string;
  year?: number | null;
}

export interface AsIsSynthesis {
  summary: string;
  sota_comparison?: SotaApproach[];
  key_findings: KeyFinding[];
  timeline: TimelineEntry[];
  key_players: KeyPlayer[];
}

export interface Comparison {
  entity: string;
  approach: string;
  strengths: string[];
  limitations: string[];
}

export interface OpenSourceProject {
  name: string;
  url: string;
  description: string;
  stars?: number | null;
  last_updated?: string | null;
}

export interface ComparativeAnalysis {
  comparisons: Comparison[];
  open_source_landscape: OpenSourceProject[];
  gaps: string[];
}

export interface FutureProblem {
  title: string;
  description: string;
  rationale: string;
  potential_impact: string;
  core_technologies?: string[];
  research_areas?: string[];
}

export interface ResearchQuestion {
  question: string;
  expected_gain: string;
  success_criteria: string;
}

export interface FutureDirections {
  problem_statements: FutureProblem[];
  opportunities: string[];
  research_questions: (string | ResearchQuestion)[];
}

export interface RiskItem {
  risk: string;
  impact: string;
  mitigation: string;
}

export interface DetailedProblemStatement {
  title: string;
  executive_summary: string;
  background_and_motivation: string;
  problem_definition: string;
  current_sota: string;
  proposed_approach: string;
  challenge_use_case: string;
  deliverables: string[];
  kpis: string[];
  prerequisites: string[];
  infrastructure_requirements: string;
  tech_stack: string;
  milestones: Record<string, string>;
  risk_assessment: RiskItem[];
  budget_estimation: Record<string, string | number>;
  key_references: string[];
}

export interface DeepResearchResult {
  research_id: string;
  prompt: string;
  created_at: string;
  thread_id?: string | null;
  worklet_id?: string | null;
  status: 'running' | 'completed' | 'failed';
  entities?: EntityExtraction | null;
  as_is?: AsIsSynthesis | null;
  comparative?: ComparativeAnalysis | null;
  future?: FutureDirections | null;
  references?: Reference[];
  detailed_problems?: Record<string, DetailedProblemStatement> | null;
}

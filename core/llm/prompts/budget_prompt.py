from core.models.worklet import Worklet


def build_budget_estimation_prompt(worklet: Worklet) -> str:
    return f"""You are a project cost estimation expert. Based on the following project details, provide a detailed budget estimation.

PROJECT DETAILS:
- Title: {worklet.title}
- Tech Stack: {worklet.tech_stack}
- Infrastructure Requirements: {worklet.infrastructure_requirements}
- Deliverables: {', '.join(worklet.deliverables)}
- Milestones: {worklet.milestones}

Provide a budget estimation as a JSON object with the following structure:
{{
  "infrastructure_costs": {{
    "<item>": "<estimated cost>"
  }},
  "team_costs": {{
    "<role>": "<estimated monthly cost>"
  }},
  "tool_costs": {{
    "<tool/license>": "<estimated cost>"
  }},
  "total_estimated": "<total estimated budget range>",
  "assumptions": ["<assumption 1>", "<assumption 2>"]
}}

Return ONLY valid JSON matching the structure above. Provide realistic estimates based on current market rates. Include 3-5 items per category and 3-5 assumptions.

Your response must be a valid JSON object with the key "updated_value" containing the budget object:
{{"updated_value": <budget_object>}}"""

from core.models.worklet import Worklet


def build_risk_assessment_prompt(worklet: Worklet) -> str:
    return f"""You are a project risk assessment expert. Based on the following project details, identify the top risks and provide mitigation strategies.

PROJECT DETAILS:
- Title: {worklet.title}
- Problem Statement: {worklet.problem_statement}
- Tech Stack: {worklet.tech_stack}
- Infrastructure Requirements: {worklet.infrastructure_requirements}
- Prerequisites: {', '.join(worklet.prerequisites)}
- Deliverables: {', '.join(worklet.deliverables)}
- Milestones: {worklet.milestones}

Provide a risk assessment as a JSON object with the following structure:
{{
  "risks": [
    {{
      "risk": "<description of the risk>",
      "likelihood": "High" | "Medium" | "Low",
      "impact": "High" | "Medium" | "Low",
      "mitigation": "<mitigation strategy>"
    }}
  ]
}}

Identify 5-8 realistic risks covering technical, resource, timeline, and external factors. Be specific to this project.

Your response must be a valid JSON object with the key "updated_value" containing the risk assessment object:
{{"updated_value": <risk_assessment_object>}}"""

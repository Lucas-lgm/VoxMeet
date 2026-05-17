export function buildSummaryPrompt(fullText: string): string {
  return `You are a meeting notes assistant. Generate a structured meeting summary from the following transcript.

Transcript:
${fullText}

Output in JSON format (no markdown wrapping, raw JSON only):
{
  "title": "Meeting title",
  "summary": "Meeting summary (2-3 sentences)",
  "topics": [
    {"title": "Topic title", "discussion": "Discussion content", "conclusion": "Conclusion", "timeRange": "Time range"}
  ],
  "actionItems": [
    {"task": "Action item", "assignee": "Assignee (if any)", "deadline": "Deadline (if any)"}
  ],
  "decisions": ["Decision 1", "Decision 2"],
  "keyMoments": [
    {"time": "Timestamp", "description": "Description of key moment"}
  ]
}

Note: Output in Chinese. Provide objective summary based on transcript. Do not fabricate. Leave empty fields blank.`
}

export function buildSummaryPromptWithSpeakers(fullText: string, segments: Array<{ speaker: string; text: string }>): string {
  let formatted = fullText
  if (segments.length > 0) {
    formatted = segments.map(s => `[${s.speaker}]: ${s.text}`).join('\n')
  }
  return buildSummaryPrompt(formatted)
}

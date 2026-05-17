export function exportToMarkdown(summary: any, title: string, date: string): string {
  const lines: string[] = []
  lines.push(`# ${title}`)
  lines.push(`> ${date}`)
  lines.push('')
  lines.push('## Summary')
  lines.push(summary.summary || summary.title || '')
  lines.push('')

  if (summary.topics?.length) {
    lines.push('## Topics')
    lines.push('')
    for (const t of summary.topics) {
      lines.push(`### ${t.title}`)
      if (t.discussion) lines.push(`- **Discussion:** ${t.discussion}`)
      if (t.conclusion) lines.push(`- **Conclusion:** ${t.conclusion}`)
      if (t.timeRange) lines.push(`- **Time:** ${t.timeRange}`)
      lines.push('')
    }
  }

  if (summary.actionItems?.length) {
    lines.push('## Action Items')
    lines.push('')
    for (const a of summary.actionItems) {
      const assignee = a.assignee ? ` [@${a.assignee}]` : ''
      const deadline = a.deadline ? ` (Deadline: ${a.deadline})` : ''
      lines.push(`- [ ] ${a.task}${assignee}${deadline}`)
    }
    lines.push('')
  }

  if (summary.decisions?.length) {
    lines.push('## Decisions')
    for (const d of summary.decisions) lines.push(`- ${d}`)
    lines.push('')
  }

  if (summary.keyMoments?.length) {
    lines.push('## Key Moments')
    for (const m of summary.keyMoments) {
      lines.push(`- **${m.time}** ${m.description}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

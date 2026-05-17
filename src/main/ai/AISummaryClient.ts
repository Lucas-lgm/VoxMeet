import { createLogger } from '../utils/logger'

const logger = createLogger('AISummary')

interface AISettings {
  provider: string
  apiBaseUrl: string
  apiKey: string
  model: string
}

export class AISummaryClient {
  async generateSummary(fullText: string, segments: Array<{ speaker: string; text: string }>, settings: AISettings): Promise<any> {
    const { buildSummaryPromptWithSpeakers } = require('./PromptTemplates')
    const prompt = buildSummaryPromptWithSpeakers(fullText, segments)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`,
    }

    const body = JSON.stringify({
      model: settings.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    })

    logger.info('Calling AI API', { baseUrl: settings.apiBaseUrl, model: settings.model })

    const response = await fetch(`${settings.apiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body,
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('AI API error', { status: response.status, error: errorText })
      throw new Error(`AI API error (${response.status}): ${errorText}`)
    }

    const data = await response.json() as any
    const content = data.choices?.[0]?.message?.content
    if (!content) throw new Error('AI returned empty response')

    try {
      return JSON.parse(content)
    } catch {
      // If not JSON, return as plain text summary
      return { summary: content, topics: [], actionItems: [], decisions: [], keyMoments: [] }
    }
  }
}

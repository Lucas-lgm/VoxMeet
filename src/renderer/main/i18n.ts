import { createI18n } from 'vue-i18n'
import en from './locales/en.json'
import zh from './locales/zh.json'

const messages = { en, zh }

function detectLocale(): string {
  const stored = localStorage.getItem('locale')
  if (stored === 'en' || stored === 'zh') return stored
  const sysLang = navigator.language?.toLowerCase() || ''
  if (sysLang.startsWith('zh')) return 'zh'
  return 'en'
}

// Custom message compiler that avoids CSP-blocked new Function() calls.
// Handles {var} and {count} style interpolation used by our locale files.
function safeMessageCompiler(message: string): (ctx: { named: (key: string) => string | number | undefined }) => string {
  const tokens: Array<{ type: 'text'; value: string } | { type: 'var'; key: string }> = []
  let lastIndex = 0
  const re = /\{(\w+)\}/g
  let match: RegExpExecArray | null
  while ((match = re.exec(message)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: message.slice(lastIndex, match.index) })
    }
    tokens.push({ type: 'var', key: match[1] })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < message.length) {
    tokens.push({ type: 'text', value: message.slice(lastIndex) })
  }

  return (ctx) => {
    return tokens.map(t => {
      if (t.type === 'text') return t.value
      const val = ctx.named(t.key)
      return val != null ? String(val) : `{${t.key}}`
    }).join('')
  }
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'en',
  messages,
  messageCompiler: (message) => {
    if (typeof message === 'string') {
      return safeMessageCompiler(message)
    }
    return () => ''
  },
})

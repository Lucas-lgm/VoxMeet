import * as fs from 'fs'
import * as path from 'path'

const locales: Record<string, any> = {}
let currentLocale = 'zh'

function loadLocale(locale: string): any {
  try {
    const filePath = path.join(__dirname, '..', 'locales', `${locale}.json`)
    const data = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(data)
  } catch {
    return {}
  }
}

export function setLocale(locale: string): void {
  currentLocale = locale
  if (!locales[locale]) {
    locales[locale] = loadLocale(locale)
  }
}

export function getLocale(): string {
  return currentLocale
}

export function t(key: string): string {
  if (!locales[currentLocale]) {
    locales[currentLocale] = loadLocale(currentLocale)
  }
  const keys = key.split('.')
  let val: any = locales[currentLocale]
  for (const k of keys) {
    if (val == null) return key
    val = val[k]
  }
  return typeof val === 'string' ? val : key
}

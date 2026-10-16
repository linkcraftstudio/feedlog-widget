export type WidgetLanguage = 'en' | 'zh'

export function resolveLocale(input: string | undefined, languages: readonly string[]): WidgetLanguage {
  const candidates = input === undefined || input === 'auto' ? languages : [input]
  for (const candidate of candidates) {
    const language = candidate.toLowerCase().split('-')[0]
    if (language === 'en' || language === 'zh') return language
  }
  return 'en'
}

export const messages = {
  en: {
    feedback: 'Feedback', help: 'Help', close: 'Close feedback', retry: 'Try again',
    loadError: 'Feedback could not be loaded.', hide: 'Hide for now', minimize: 'Minimize button',
    dragTitle: 'Drag to move. Use arrow keys when focused.',
    dragDescription: 'Drag to move, or use arrow keys. Enter opens feedback.',
  },
  zh: {
    feedback: '反馈', help: '帮助', close: '关闭反馈', retry: '重试',
    loadError: '暂时无法加载反馈，请重试。', hide: '暂时隐藏', minimize: '收起按钮',
    dragTitle: '拖动以移动，聚焦后可使用方向键。',
    dragDescription: '拖动或使用方向键移动，按回车键打开反馈。',
  },
} as const

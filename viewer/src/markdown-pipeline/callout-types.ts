export type CalloutVariant =
  | 'info'
  | 'note'
  | 'abstract'
  | 'todo'
  | 'tip'
  | 'success'
  | 'question'
  | 'warning'
  | 'failure'
  | 'danger'
  | 'bug'
  | 'example'
  | 'quote'

const ALIASES: Record<string, CalloutVariant> = {
  note: 'note',
  info: 'info',
  abstract: 'abstract',
  summary: 'abstract',
  tldr: 'abstract',
  todo: 'todo',
  tip: 'tip',
  hint: 'tip',
  important: 'tip',
  success: 'success',
  check: 'success',
  done: 'success',
  question: 'question',
  help: 'question',
  faq: 'question',
  warning: 'warning',
  caution: 'warning',
  attention: 'warning',
  failure: 'failure',
  fail: 'failure',
  missing: 'failure',
  danger: 'danger',
  error: 'danger',
  bug: 'bug',
  example: 'example',
  quote: 'quote',
  cite: 'quote'
}

const DEFAULT_TITLES: Record<CalloutVariant, string> = {
  note: '메모',
  info: '정보',
  abstract: '요약',
  todo: '할 일',
  tip: '팁',
  success: '성공',
  question: '질문',
  warning: '경고',
  failure: '실패',
  danger: '위험',
  bug: '버그',
  example: '예시',
  quote: '인용'
}

export function normalizeCalloutType(raw: string): CalloutVariant {
  return ALIASES[raw.toLowerCase()] ?? 'note'
}

export function defaultCalloutTitle(variant: CalloutVariant): string {
  return DEFAULT_TITLES[variant]
}

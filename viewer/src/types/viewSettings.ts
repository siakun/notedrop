export type Theme = 'day' | 'sepia' | 'night'
export type LayoutMode = 'default' | 'vertical' | 'horizontal' | 'two-pages'
export type PageSize = 'auto' | 'B4' | 'A4' | 'B5' | 'A5'
export type FontKey =
  | 'system'
  | 'arial'
  | 'georgia'
  | 'times'
  | 'trebuchet'
  | 'verdana'
  | 'serif-kr'
  | 'sans-kr'
export type AlignMode = 'left' | 'justify'

export type ViewSettings = {
  theme: Theme
  layout: LayoutMode
  pageSize: PageSize
  marginTop: number
  marginBottom: number
  marginLeft: number
  marginRight: number
  font: FontKey
  fontScale: number
  lineScale: number
  align: AlignMode
}

export const VS_DEFAULTS: ViewSettings = {
  theme: 'night',
  layout: 'default',
  pageSize: 'A4',
  marginTop: 20,
  marginBottom: 20,
  marginLeft: 25,
  marginRight: 25,
  font: 'system',
  fontScale: 1,
  lineScale: 1,
  align: 'left'
}

/**
 * 페이지 mm 크기. auto 는 fit 계산용 ratio 만 사용 (실 크기는 viewport 에 맞춤).
 */
export const PAGE_DIMS: Record<PageSize, { w: number; h: number }> = {
  auto: { w: 210, h: 297 },  // A4 ratio (fit 알고리즘의 ratio 입력으로만 사용)
  B4: { w: 257, h: 364 },
  A4: { w: 210, h: 297 },
  B5: { w: 182, h: 257 },
  A5: { w: 148, h: 210 }
}

export const FONT_STACKS: Record<FontKey, string> = {
  system: 'inherit',
  arial: '"Arial", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
  georgia: '"Georgia", "Apple SD Gothic Neo", "Malgun Gothic", serif',
  times: '"Times New Roman", "Apple SD Gothic Neo", "Malgun Gothic", serif',
  trebuchet:
    '"Trebuchet MS", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
  verdana: '"Verdana", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
  'serif-kr':
    '"Noto Serif KR", "Apple SD Gothic Neo", "Malgun Gothic", serif',
  'sans-kr':
    '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'
}

export const FONT_OPTIONS: { value: FontKey; label: string }[] = [
  { value: 'system', label: '원본 (시스템)' },
  { value: 'sans-kr', label: 'Noto Sans KR' },
  { value: 'serif-kr', label: 'Noto Serif KR' },
  { value: 'arial', label: 'Arial' },
  { value: 'georgia', label: 'Georgia' },
  { value: 'times', label: 'Times New Roman' },
  { value: 'trebuchet', label: 'Trebuchet MS' },
  { value: 'verdana', label: 'Verdana' }
]

export const FONT_STEP = 0.1
export const FONT_MIN = 0.7
export const FONT_MAX = 1.6
export const LINE_STEP = 0.1
export const LINE_MIN = 0.8
export const LINE_MAX = 1.6
export const MARGIN_MIN = 0
export const MARGIN_MAX = 60

export const VS_STORAGE_KEY = 'notedrop:viewSettings'

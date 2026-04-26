export type PageSizeKey = 'A3' | 'A4' | 'A5' | 'B5' | 'B6'

export type PageSizePreset = {
  key: PageSizeKey
  label: string
  width: string
  height: string
  margin: string
  fontSize: string
  lineHeight: string
  codeFontSize: string
}

export const PAGE_SIZES: Record<PageSizeKey, PageSizePreset> = {
  A3: {
    key: 'A3',
    label: 'A3 (297 × 420 mm)',
    width: '297mm',
    height: '420mm',
    margin: '24mm',
    fontSize: '14pt',
    lineHeight: '1.7',
    codeFontSize: '12pt'
  },
  A4: {
    key: 'A4',
    label: 'A4 (210 × 297 mm)',
    width: '210mm',
    height: '297mm',
    margin: '20mm',
    fontSize: '12pt',
    lineHeight: '1.6',
    codeFontSize: '10pt'
  },
  A5: {
    key: 'A5',
    label: 'A5 (148 × 210 mm)',
    width: '148mm',
    height: '210mm',
    margin: '16mm',
    fontSize: '11pt',
    lineHeight: '1.55',
    codeFontSize: '9pt'
  },
  B5: {
    key: 'B5',
    label: 'B5 (176 × 250 mm)',
    width: '176mm',
    height: '250mm',
    margin: '18mm',
    fontSize: '11pt',
    lineHeight: '1.6',
    codeFontSize: '9pt'
  },
  B6: {
    key: 'B6',
    label: 'B6 (125 × 176 mm)',
    width: '125mm',
    height: '176mm',
    margin: '12mm',
    fontSize: '10pt',
    lineHeight: '1.5',
    codeFontSize: '8pt'
  }
}

export const DEFAULT_PAGE_SIZE: PageSizeKey = 'A4'

export function pageSizeCss(preset: PageSizePreset): string {
  return `
    @page {
      size: ${preset.width} ${preset.height};
      margin: ${preset.margin};
    }
    .notedrop-content {
      font-size: ${preset.fontSize};
      line-height: ${preset.lineHeight};
    }
    .notedrop-content pre,
    .notedrop-content code {
      font-size: ${preset.codeFontSize};
    }
  `
}

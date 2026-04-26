'use client'

export default function DownloadPDFButton() {
  return (
    <button
      type="button"
      className="notedrop-download-pdf"
      onClick={() => {
        if (typeof window !== 'undefined') window.print()
      }}
      aria-label="PDF 로 인쇄"
    >
      PDF
    </button>
  )
}

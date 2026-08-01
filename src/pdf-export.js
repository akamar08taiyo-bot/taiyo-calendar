const PAGE_ROWS = 15

function safeFileName(value) {
  return String(value || '居宅カレンダー').replace(/[\\/:*?"<>|]/g, '_')
}

export async function downloadCalendarPdf({ month, officeName, staffName }) {
  const source = document.querySelector('.print-document')
  const table = source?.querySelector('.print-calendar-table')
  const sourceRows = [...(table?.querySelectorAll('tbody tr') || [])]
  if (!source || !table || !sourceRows.length) throw new Error('PDFにするカレンダーデータがありません。')

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
  if (document.fonts?.ready) await document.fonts.ready

  const sandbox = document.createElement('div')
  sandbox.className = 'pdf-export-sandbox'
  sandbox.setAttribute('aria-hidden', 'true')
  document.body.appendChild(sandbox)
  const chunks = Array.from({ length: Math.ceil(sourceRows.length / PAGE_ROWS) }, (_, index) => sourceRows.slice(index * PAGE_ROWS, (index + 1) * PAGE_ROWS))
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 6

  try {
    for (let index = 0; index < chunks.length; index += 1) {
      const page = source.cloneNode(true)
      page.classList.add('pdf-export-document')
      const pageBody = page.querySelector('tbody')
      pageBody.replaceChildren(...chunks[index].map((row) => row.cloneNode(true)))
      if (index < chunks.length - 1) page.querySelector('tfoot')?.remove()
      const title = page.querySelector('.print-document-title h2')
      if (title && chunks.length > 1) title.textContent += `　${index + 1}/${chunks.length}`
      sandbox.replaceChildren(page)

      const canvas = await html2canvas(page, { backgroundColor: '#ffffff', logging: false, scale: 2, useCORS: true })
      const widthRatio = (pageWidth - margin * 2) / canvas.width
      const heightRatio = (pageHeight - margin * 2) / canvas.height
      const ratio = Math.min(widthRatio, heightRatio)
      const imageWidth = canvas.width * ratio
      const imageHeight = canvas.height * ratio
      const x = (pageWidth - imageWidth) / 2
      const y = (pageHeight - imageHeight) / 2
      if (index > 0) pdf.addPage('a4', 'landscape')
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', x, y, imageWidth, imageHeight, undefined, 'FAST')
    }
  } finally {
    sandbox.remove()
  }

  const [year, monthNumber] = month.split('-')
  pdf.save(safeFileName(`${year}年${Number(monthNumber)}月_${officeName}_${staffName}_居宅カレンダー.pdf`))
}

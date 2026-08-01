const weekdays = ['日', '月', '火', '水', '木', '金', '土']

export function daysForMonth(month) {
  const [year, monthNumber] = month.split('-').map(Number)
  const count = new Date(year, monthNumber, 0).getDate()
  return Array.from({ length: count }, (_, index) => {
    const day = index + 1
    const weekday = new Date(year, monthNumber - 1, day).getDay()
    return { day, weekday, label: weekdays[weekday] }
  })
}

export function visitValueLabel(count) {
  return count > 0 ? String(count) : ''
}

export function averageVisitCount(visitTotal, attendanceDays) {
  return attendanceDays > 0 ? Math.round(visitTotal / attendanceDays * 10) / 10 : null
}

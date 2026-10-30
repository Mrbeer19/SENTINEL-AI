import React, { useEffect, useState } from 'react'

export function usePagedRows(rows, filterKey, size = 10) {
  const [page, setPage] = useState(1)
  const pages = Math.max(1, Math.ceil(rows.length / size))
  const current = Math.min(page, pages)
  useEffect(() => { setPage(1) }, [filterKey])
  return { rows: rows.slice((current - 1) * size, current * size), page: current, pages, size, total: rows.length, setPage }
}

export default function TablePagination({ state }) {
  const { page, pages, size, total, setPage } = state
  if (!total) return null
  return <nav className="tablePagination" aria-label="แบ่งหน้ารายการ"><span>แสดง {(page - 1) * size + 1}–{Math.min(page * size, total)} จาก {total} รายการ</span><div><button aria-label="หน้าก่อนหน้า" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button><span aria-live="polite">หน้า <b>{page}</b> / {pages}</span><button aria-label="หน้าถัดไป" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</button></div></nav>
}

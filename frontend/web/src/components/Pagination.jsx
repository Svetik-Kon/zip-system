const PAGE_SIZE_OPTIONS = [15, 30, 50];

export default function Pagination({ total, page, pageSize, onPageChange, onPageSizeChange }) {
  const pageCount = Math.max(Math.ceil(total / pageSize), 1);
  const start = total ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(page * pageSize, total);

  if (total <= PAGE_SIZE_OPTIONS[0]) return null;

  return (
    <div className="pagination">
      <span>{start}-{end} из {total}</span>
      <div className="pagination-controls">
        <button type="button" className="ghost-button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Назад
        </button>
        <span>Страница {page} из {pageCount}</span>
        <button type="button" className="ghost-button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
          Вперед
        </button>
        <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
          {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size} строк</option>)}
        </select>
      </div>
    </div>
  );
}

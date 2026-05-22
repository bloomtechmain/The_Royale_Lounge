import { cn } from '@/utils/cn';
import Spinner from './Spinner';

interface Column<T> {
  key: string;
  header: string;
  render?: (row: T, index: number) => React.ReactNode;
  className?: string;
  headerClass?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  rowKey?: (row: T) => string;
  className?: string;
  // keyboard nav
  focusedIndex?: number;
  onRowKeyDown?: (e: React.KeyboardEvent, index: number) => void;
  setRowRef?: (el: HTMLTableRowElement | null, index: number) => void;
}

export default function Table<T extends Record<string, any>>({
  columns, data, loading, emptyMessage = 'No data found',
  onRowClick, rowKey, className,
  focusedIndex, onRowKeyDown, setRowRef,
}: TableProps<T>) {
  const hasNav = !!(onRowKeyDown && setRowRef);

  return (
    <div className={cn('overflow-x-auto scrollbar-thin', className)}>
      <table className="w-full">
        <thead>
          <tr className="border-b border-charcoal-500">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'text-left py-3 px-4 text-xs font-semibold text-charcoal-200 uppercase tracking-wider',
                  col.headerClass
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="py-16 text-center">
                <div className="flex justify-center"><Spinner size="lg" /></div>
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-16 text-center text-charcoal-200">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, idx) => (
              <tr
                key={rowKey ? rowKey(row) : idx}
                ref={hasNav ? (el) => setRowRef!(el, idx) : undefined}
                tabIndex={hasNav ? 0 : undefined}
                className={cn(
                  'table-row',
                  (onRowClick || hasNav) && 'cursor-pointer',
                  hasNav && focusedIndex === idx && 'ring-1 ring-inset ring-gold-600/60 bg-gold-900/10',
                  hasNav && 'focus:outline-none focus:ring-1 focus:ring-inset focus:ring-gold-500/70 focus:bg-gold-900/10',
                )}
                onClick={() => onRowClick?.(row)}
                onKeyDown={hasNav ? (e) => onRowKeyDown!(e, idx) : undefined}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cn('py-3.5 px-4 text-sm text-charcoal-100', col.className)}>
                    {col.render ? col.render(row, idx) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

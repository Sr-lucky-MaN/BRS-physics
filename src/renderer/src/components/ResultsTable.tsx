import type { Student } from '@core/models'
import type { StudentResult } from '@core/scoring'
import type { Column } from '../format'

interface Props {
  students: Student[]
  results: Record<string, StudentResult>
  columns: Column[]
  selectedId: string | null
  onSelect: (id: string) => void
  periodMarks?: Record<string, string>
  onSetPeriodMark?: (studentId: string) => void
}

export default function ResultsTable({ students, results, columns, selectedId, onSelect, periodMarks = {}, onSetPeriodMark }: Props) {
  return (
    <div className="table-wrap">
      <table className="results">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.header}>{c.header}</th>
            ))}
            <th>Оценка ЭЖ за период</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s) => {
            const r = results[s.id]
            return (
              <tr key={s.id} className={s.id === selectedId ? 'selected' : ''} onClick={() => onSelect(s.id)}>
                {columns.map((c, i) => {
                  const cls = c.kind === 'mark' ? `mark mark-${r.mark ?? 'none'}` : c.kind === 'status' && r.mark == null ? 'warn' : ''
                  return (
                    <td key={c.header} className={`${i === 0 ? 'name' : ''} ${cls}`}>
                      {c.get(s, r)}
                    </td>
                  )
                })}
                <td className="mark">
                  <div className="period-mark-cell">
                    <span>{periodMarks[s.id] ?? '—'}</span>
                    {onSetPeriodMark && (
                      <button
                        type="button"
                        className="icon-button tiny"
                        title={r.mark == null ? 'Нет расчётной отметки' : `Выставить ${r.mark}`}
                        disabled={r.mark == null}
                        onClick={(e) => { e.stopPropagation(); onSetPeriodMark(s.id) }}
                      >✓</button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

import type { Student } from '@core/models'
import type { StudentResult } from '@core/scoring'
import type { Column } from '../format'

interface Props {
  students: Student[]
  results: Record<string, StudentResult>
  columns: Column[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export default function ResultsTable({ students, results, columns, selectedId, onSelect }: Props) {
  return (
    <div className="table-wrap">
      <table className="results">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.header}>{c.header}</th>
            ))}
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
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

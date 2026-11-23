import { useState } from 'react'

export interface MarkCandidate {
  studentId: string
  fullName: string
  current: string
  next: number
}

export interface SkippedStudent {
  studentId: string
  fullName: string
  reason: string
}

interface Props {
  candidates: MarkCandidate[]
  skipped: SkippedStudent[]
  busy: boolean
  onCancel: () => void
  onConfirm: (mode: 'empty' | 'all') => Promise<void>
}

type Mode = 'empty' | 'all'

export default function PeriodMarkDialog({ candidates, skipped, busy, onCancel, onConfirm }: Props) {
  const [mode, setMode] = useState<Mode>('empty')
  const targets = mode === 'empty' ? candidates.filter((c) => !c.current.trim()) : candidates

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel() }}>
      <div className="modal period-dialog" role="dialog" aria-label="Выставление отметок за период">
        <header>
          <strong>Выставление отметки за период</strong>
          <button type="button" onClick={onCancel} disabled={busy} aria-label="Закрыть">×</button>
        </header>
        <p className="muted dialog-intro">Отметка берётся из расчёта БРС. Ученики без расчётной отметки пропускаются.</p>
        <div className="mark-mode">
          <label className="check-label"><input type="radio" checked={mode === 'empty'} onChange={() => setMode('empty')} disabled={busy} /> Только пустые ячейки</label>
          <label className="check-label"><input type="radio" checked={mode === 'all'} onChange={() => setMode('all')} disabled={busy} /> Перезаписать все</label>
        </div>
        <div className="preview-list">
          {targets.length ? (
            <table className="preview-table">
              <thead><tr><th>Ученик</th><th>Сейчас</th><th>Будет</th></tr></thead>
              <tbody>
                {targets.map((c) => (
                  <tr key={c.studentId}>
                    <td>{c.fullName}</td>
                    <td>{c.current.trim() || '—'}</td>
                    <td><b>{c.next}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="muted pad">Все ячейки уже заполнены. Выберите «Перезаписать все».</p>}
        </div>
        <p className="muted dialog-summary">
          К выставлению: <b>{targets.length}</b> из {candidates.length}.
          {skipped.length > 0 && <> Пропущено: <b>{skipped.length}</b> ({skipped.map((s) => s.fullName).join(', ')}).</>}
        </p>
        <div className="modal-actions">
          <button type="button" onClick={onCancel} disabled={busy}>Отмена</button>
          <button type="button" className="primary" onClick={() => void onConfirm(mode)} disabled={busy || !targets.length}>
            {busy ? 'Выставление…' : `Выставить ${targets.length}`}
          </button>
        </div>
      </div>
    </div>
  )
}

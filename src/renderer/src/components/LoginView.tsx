import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { LocalAuthState, Profile, TaskType, UserSession } from '@core/models'

const TYPES: TaskType[] = ['current_work', 'homework', 'lab', 'exam_written', 'exam_oral']
const EJ_LABELS = {
  current_work: 'Текущая работа', lab: 'Лабораторная работа', homework: 'Процент выполнения ДЗ',
  exam_oral: 'Экзамен устный', exam_written: 'Экзамен письменный'
} as const
const LABELS: Record<TaskType, string> = {
  current_work: 'Текущие работы', homework: 'Домашние задания', lab: 'Лабораторные',
  exam_written: 'Контрольные', exam_oral: 'Устные экзамены', ignored: 'Не учитывать'
}
const EMPTY_PROFILE: Profile = {
  id: 'default', name: 'Основной', journalUrl: '',
  homeworkMode: 'percent', labsMinFraction: 0.8, classifierRules: {}
}
const EMPTY_STATE: LocalAuthState = {
  profiles: [EMPTY_PROFILE], selectedProfileId: 'default', credentials: [], rememberMe: false, dontSignOut: false
}

export default function LoginView({ onLogin }: { onLogin: (s: UserSession) => void }) {
  const [state, setState] = useState<LocalAuthState>(EMPTY_STATE)
  const [profileId, setProfileId] = useState('default')
  const [settingsProfileId, setSettingsProfileId] = useState('default')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [account, setAccount] = useState('')
  const [editingCredentialKey, setEditingCredentialKey] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importSourceId, setImportSourceId] = useState('')
  const [importUsernames, setImportUsernames] = useState<string[]>([])
  const [editCredentialForm, setEditCredentialForm] = useState<{ profileId: string; originalUsername: string; username: string; password: string } | null>(null)
  const [editCredentialError, setEditCredentialError] = useState('')
  const [ready, setReady] = useState(false)
  const profile = useMemo(() => state.profiles.find((p) => p.id === profileId) ?? state.profiles[0] ?? EMPTY_PROFILE, [state.profiles, profileId])
  const settingsProfile = useMemo(() => state.profiles.find((p) => p.id === settingsProfileId) ?? state.profiles[0] ?? EMPTY_PROFILE, [state.profiles, settingsProfileId])
  const profileCredentials = useMemo(() => state.credentials.filter((credential) => credential.profileId === profile.id), [state.credentials, profile.id])
  const settingsProfileCredentials = useMemo(() => state.credentials.filter((credential) => credential.profileId === settingsProfile.id), [state.credentials, settingsProfile.id])
  const matchingSavedCredential = useMemo(() => profileCredentials.find((credential) => credential.username === username.trim()), [profileCredentials, username])
  const selectedSavedCredential = useMemo(() => state.credentials.find((credential) => `${credential.profileId}|${credential.username}` === (account || editingCredentialKey)), [state.credentials, account, editingCredentialKey])

  useEffect(() => {
    window.api.getAuthState().then((saved) => {
      const next = saved.profiles.length ? saved : EMPTY_STATE
      setState(next)
      const selected = next.profiles.some((p) => p.id === next.selectedProfileId) ? next.selectedProfileId : next.profiles[0].id
      setProfileId(selected)
      setSettingsProfileId(selected)
      setReady(true)
      if (next.dontSignOut && next.credentials.length) {
        const credentials = next.credentials.find((c) => c.profileId === selected) ?? next.credentials[0]
        if (credentials) {
          setUsername(credentials.username)
          setPassword(credentials.password)
          void signIn(credentials.username, credentials.password, next.profiles.find((p) => p.id === credentials.profileId) ?? next.profiles[0], next)
        } else setBusy(false)
      } else setBusy(false)
    }).catch((e) => { setError(e instanceof Error ? e.message : String(e)); setBusy(false); setReady(true) })
  }, [])

  async function persist(next: LocalAuthState) {
    setState(next)
    try { await window.api.saveAuthState(next) } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  async function signIn(user: string, pass: string, selected: Profile, current: LocalAuthState) {
    setBusy(true)
    setError('')
    const updated: LocalAuthState = { ...current, selectedProfileId: selected.id }
    const originalCredentialKey = selectedSavedCredential ? `${selectedSavedCredential.profileId}|${selectedSavedCredential.username}` : ''
    const isSavedAccount = Boolean((matchingSavedCredential ?? selectedSavedCredential) && selected.id === profile.id)
    if ((isSavedAccount || updated.rememberMe || updated.dontSignOut) && user && pass) {
      const credentials = updated.credentials.filter((c) => {
        const key = `${c.profileId}|${c.username}`
        return key !== originalCredentialKey && !(c.username === user && c.profileId === selected.id)
      })
      credentials.unshift({ username: user, password: pass, profileId: selected.id })
      updated.credentials = credentials
    }
    if (!isSavedAccount && !updated.rememberMe && !updated.dontSignOut) updated.credentials = updated.credentials.filter((c) => !(c.username === user && c.profileId === selected.id))
    await persist(updated)
    try {
      onLogin(await window.api.login(user.trim(), pass, selected))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось войти')
      setBusy(false)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    await signIn(username, password, profile, { ...state, selectedProfileId: profile.id })
  }

  function updateProfile(patch: Partial<Profile>) {
    const profiles = state.profiles.map((p) => p.id === settingsProfile.id ? { ...p, ...patch } : p)
    void persist({ ...state, profiles })
  }

  async function updateState(patch: Partial<LocalAuthState>) { await persist({ ...state, ...patch }) }

  function addProfile() {
    const id = `profile-${Date.now()}`
    const created = { ...EMPTY_PROFILE, id, name: `Профиль ${state.profiles.length + 1}` }
    void persist({ ...state, profiles: [...state.profiles, created] })
    setSettingsProfileId(id)
  }

  function openImport() {
    const source = state.profiles.find((candidate) => candidate.id !== settingsProfile.id)
    setImportSourceId(source?.id ?? '')
    setImportUsernames(source ? getImportableUsernames(source.id) : [])
    setImportOpen(Boolean(source))
  }

  function getImportableUsernames(sourceId: string) {
    const existingUsernames = new Set(settingsProfileCredentials.map((credential) => credential.username))
    return state.credentials
      .filter((credential) => credential.profileId === sourceId && !existingUsernames.has(credential.username))
      .map((credential) => credential.username)
  }

  function changeImportSource(sourceId: string) {
    setImportSourceId(sourceId)
    setImportUsernames(getImportableUsernames(sourceId))
  }

  function importAccounts() {
    if (!importSourceId || importSourceId === settingsProfile.id) return
    const sourceAccounts = state.credentials.filter((credential) => credential.profileId === importSourceId)
    const imported = sourceAccounts
      .filter((credential) => importUsernames.includes(credential.username))
      .map((credential) => ({ ...credential, profileId: settingsProfile.id }))
    if (!imported.length) {
      setError('Выберите хотя бы один аккаунт для импорта')
      return
    }
    void persist({ ...state, credentials: [...state.credentials, ...imported] })
    setImportOpen(false)
    setImportUsernames([])
    setError('')
  }

  function deleteProfile(id: string) {
    if (state.profiles.length <= 1) return
    const target = state.profiles.find((p) => p.id === id)
    if (!target || !window.confirm(`Удалить профиль «${target.name}» и сохранённые аккаунты для него?`)) return
    const profiles = state.profiles.filter((p) => p.id !== id)
    const selected = id === settingsProfile.id ? profiles[0] : settingsProfile
    void persist({
      ...state,
      profiles,
      selectedProfileId: selected.id,
      credentials: state.credentials.filter((c) => c.profileId !== id)
    })
    if (id === settingsProfile.id) setSettingsProfileId(selected.id)
  }

  function chooseAccount(value: string) {
    setAccount(value)
    setEditingCredentialKey('')
    const saved = state.credentials.find((c) => `${c.profileId}|${c.username}` === value)
    if (saved) {
      setUsername(saved.username)
      setPassword(saved.password)
      setProfileId(saved.profileId)
    } else if (!value) { setUsername(''); setPassword('') }
  }

  function chooseProfile(nextProfileId: string) {
    setProfileId(nextProfileId)
    setAccount('')
    setEditingCredentialKey('')
    void updateState({ selectedProfileId: nextProfileId })
  }

  function deleteCredential(profileId: string, savedUsername: string) {
    const savedProfile = state.profiles.find((p) => p.id === profileId)
    if (!window.confirm(`Удалить сохранённый аккаунт «${savedUsername}»${savedProfile ? ` из профиля «${savedProfile.name}»` : ''}?`)) return
    const key = `${profileId}|${savedUsername}`
    void persist({ ...state, credentials: state.credentials.filter((c) => `${c.profileId}|${c.username}` !== key) })
    if (account === key) {
      setAccount('')
      setUsername('')
      setPassword('')
    }
    if (editingCredentialKey === key) setEditingCredentialKey('')
  }

  function editCredential(profileId: string, savedUsername: string) {
    const credential = state.credentials.find((c) => c.profileId === profileId && c.username === savedUsername)
    if (!credential) return
    setEditCredentialError('')
    setEditCredentialForm({ profileId, originalUsername: credential.username, username: credential.username, password: credential.password })
  }

  function saveEditedCredential() {
    if (!editCredentialForm) return
    const username = editCredentialForm.username.trim()
    if (!username || !editCredentialForm.password) {
      setEditCredentialError('Укажите логин и пароль')
      return
    }
    const duplicate = state.credentials.some((credential) => credential.profileId === editCredentialForm.profileId && credential.username === username && credential.username !== editCredentialForm.originalUsername)
    if (duplicate) {
      setEditCredentialError('В этом профиле уже есть аккаунт с таким логином')
      return
    }
    const credentials = state.credentials.map((credential) => credential.profileId === editCredentialForm.profileId && credential.username === editCredentialForm.originalUsername
      ? { ...credential, username, password: editCredentialForm.password }
      : credential)
    void persist({ ...state, credentials })
    const originalKey = `${editCredentialForm.profileId}|${editCredentialForm.originalUsername}`
    if (account === originalKey) setAccount(`${editCredentialForm.profileId}|${username}`)
    setEditCredentialForm(null)
    setEditCredentialError('')
  }

  if (!ready) return <div className="login-wrap"><div className="login-loader"><span className="spinner" />Загрузка настроек…</div></div>

  return (
    <div className="login-wrap">
      <button className="settings-trigger" type="button" onClick={() => setSettingsOpen((v) => !v)} aria-label="Настройки" title="Настройки">⚙</button>
      <form className="login-card" onSubmit={submit}>
        <h1>БРС по физике</h1>
        <label>Профиль подключения
          <select value={profile.id} onChange={(e) => chooseProfile(e.target.value)}>
            {state.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        {profileCredentials.length > 0 && <label>Сохранённый аккаунт
          <select value={account} onChange={(e) => chooseAccount(e.target.value)}>
            <option value="">Выбрать аккаунт…</option>
            {profileCredentials.map((c) => <option key={`${c.profileId}|${c.username}`} value={`${c.profileId}|${c.username}`}>{c.username}</option>)}
          </select>
        </label>}
        <label>Логин
          <input autoFocus value={username} onChange={(e) => { setUsername(e.target.value); setAccount('') }} autoComplete="username" />
        </label>
        <label>Пароль
          <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setAccount('') }} autoComplete="current-password" />
        </label>
        <div className="login-options">
          {!matchingSavedCredential && !selectedSavedCredential && <label className="check-label"><input type="checkbox" checked={state.rememberMe} onChange={(e) => void updateState({ rememberMe: e.target.checked })} /> Запомнить меня</label>}
          <label className="check-label"><input type="checkbox" checked={state.dontSignOut} onChange={(e) => void updateState({ dontSignOut: e.target.checked })} /> Не выходить</label>
        </div>
        {error && <div className="error">{error}</div>}
        <button className="primary" disabled={busy || !username || !password}>
          {busy ? <><span className="spinner spinner-light" />Выполняется вход…</> : 'Войти'}
        </button>
      </form>
      {settingsOpen && <aside className="settings-panel">
        <header><strong>Настройки профилей</strong><span className="grow" /><button type="button" onClick={() => setSettingsOpen(false)} aria-label="Закрыть настройки">×</button></header>
        <div className="settings-actions"><button type="button" onClick={addProfile}>Добавить профиль</button></div>
        <div className="saved-profiles">
          <strong>Сохранённые профили</strong>
          {state.profiles.map((savedProfile) => <div className={`saved-profile${savedProfile.id === settingsProfile.id ? ' selected' : ''}`} key={savedProfile.id}>
            <button className="saved-profile-name" type="button" onClick={() => setSettingsProfileId(savedProfile.id)}>{savedProfile.name || 'Без названия'}<span className="muted">{savedProfile.journalUrl || 'URL не указан'}</span></button>
            <button className="icon-button danger" type="button" onClick={() => deleteProfile(savedProfile.id)} disabled={state.profiles.length <= 1} aria-label={`Удалить профиль ${savedProfile.name}`} title="Удалить профиль">×</button>
          </div>)}
        </div>
        <div className="saved-accounts">
          <div className="saved-accounts-header"><strong>Сохранённые аккаунты</strong><button type="button" onClick={() => importOpen ? setImportOpen(false) : openImport()} disabled={state.profiles.length < 2}>{importOpen ? 'Отмена' : 'Импортировать'}</button></div>
          {importOpen && <div className="import-accounts">
            <strong>Выберите аккаунты из профиля</strong>
            <select value={importSourceId} onChange={(e) => changeImportSource(e.target.value)}>
              {state.profiles.filter((candidate) => candidate.id !== settingsProfile.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
            </select>
            {getImportableUsernames(importSourceId).length > 0 ? <div className="import-account-list">
              {getImportableUsernames(importSourceId).map((savedUsername) => <label className="check-label" key={savedUsername}><input type="checkbox" checked={importUsernames.includes(savedUsername)} onChange={(e) => setImportUsernames((current) => e.target.checked ? [...current, savedUsername] : current.filter((username) => username !== savedUsername))} />{savedUsername}</label>)}
              <button type="button" className="primary" onClick={importAccounts}>Импортировать выбранные</button>
            </div> : <span className="muted">Нет новых аккаунтов для импорта</span>}
          </div>}
          {settingsProfileCredentials.map((credential) => {
            const key = `${credential.profileId}|${credential.username}`
            return <div className="saved-account" key={key}>
              <div><strong>{credential.username}</strong><span className="muted">{state.profiles.find((p) => p.id === credential.profileId)?.name ?? 'Профиль удалён'}</span></div>
              <button className="icon-button" type="button" onClick={() => editCredential(credential.profileId, credential.username)} aria-label={`Изменить аккаунт ${credential.username}`} title="Изменить сохранённый аккаунт">✎</button>
              <button className="icon-button danger" type="button" onClick={() => deleteCredential(credential.profileId, credential.username)} aria-label={`Удалить аккаунт ${credential.username}`} title="Удалить сохранённый аккаунт">×</button>
            </div>
          })}
          {settingsProfileCredentials.length === 0 && !importOpen && <span className="muted">Нет сохранённых аккаунтов</span>}
        </div>
        <label>Название профиля<input value={settingsProfile.name} onChange={(e) => updateProfile({ name: e.target.value })} /></label>
        <label>URL журнала<input type="url" placeholder="https://journal.example" value={settingsProfile.journalUrl} onChange={(e) => updateProfile({ journalUrl: e.target.value })} /></label>
        <label className="check-label"><input type="checkbox" checked={settingsProfile.allowSelfSignedCertificates === true} onChange={(e) => updateProfile({ allowSelfSignedCertificates: e.target.checked })} /> Принимать самоподписанные сертификаты (небезопасно)</label>
        <label>Режим домашних заданий<select value={settingsProfile.homeworkMode} onChange={(e) => updateProfile({ homeworkMode: e.target.value as Profile['homeworkMode'] })}><option value="percent">Оценка в процентах</option><option value="ten_point">10-балльная шкала</option><option value="binary">Выполнено / не выполнено</option></select></label>
        <label>Минимальная доля лабораторных<input type="number" min="0" max="1" step="0.05" value={settingsProfile.labsMinFraction} onChange={(e) => updateProfile({ labsMinFraction: Number(e.target.value) })} /></label>
        <div className="rule-list"><strong>Ключевые слова в описаниях</strong>{TYPES.map((type) => <label key={type}>{LABELS[type]}<input placeholder="контрольная работа, кр" value={(settingsProfile.classifierRules[type] ?? []).join(', ')} onChange={(e) => updateProfile({ classifierRules: { ...settingsProfile.classifierRules, [type]: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) } })} /></label>)}</div>
        <div className="rule-list"><strong>Тексты видов оценки в ЭЖ</strong>{(Object.keys(EJ_LABELS) as (keyof typeof EJ_LABELS)[]).map((type) => <label key={type}>{LABELS[type]}<input value={settingsProfile.journalTypeLabels?.[type] ?? EJ_LABELS[type]} onChange={(e) => updateProfile({ journalTypeLabels: { ...settingsProfile.journalTypeLabels, [type]: e.target.value } })} /></label>)}</div>
      </aside>}
      {editCredentialForm && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setEditCredentialForm(null) }}>
        <form className="modal" onSubmit={(e) => { e.preventDefault(); saveEditedCredential() }}>
          <header><strong>Изменить сохранённый аккаунт</strong><button type="button" onClick={() => setEditCredentialForm(null)} aria-label="Закрыть">×</button></header>
          <label>Логин<input autoFocus value={editCredentialForm.username} onChange={(e) => setEditCredentialForm({ ...editCredentialForm, username: e.target.value })} autoComplete="username" /></label>
          <label>Пароль<input type="password" value={editCredentialForm.password} onChange={(e) => setEditCredentialForm({ ...editCredentialForm, password: e.target.value })} autoComplete="new-password" /></label>
          {editCredentialError && <div className="error modal-error">{editCredentialError}</div>}
          <div className="modal-actions"><button type="button" onClick={() => setEditCredentialForm(null)}>Отмена</button><button className="primary" type="submit">Сохранить</button></div>
        </form>
      </div>}
    </div>
  )
}

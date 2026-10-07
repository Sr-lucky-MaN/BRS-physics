# БРС по физике — Electron + React

Desktop app (Windows / Linux) that shows student marks and calculates BRS final marks per quarter
(grades 8-9) and semester (grades 10-11) according to the physics department spec.

Stack: Electron · React 19 · TypeScript · Vite (electron-vite) · electron-builder · Vitest.

```
src/core/       scoring rules + description classifier   (pure TS, unit-tested, used by the UI)
src/main/       Electron main process: journal provider, local storage, config, IPC
  providers/    types.ts (interface) · journal.ts (YOUR CODE) · mock.ts (demo data)
src/preload/    exposes window.api to the UI (contextIsolation on, no node in the renderer)
src/renderer/   React UI
```

## Run
```bash
npm install
npm run dev          # hot-reload dev mode. Demo login: teacher / teacher (mock journal)
npm test             # unit tests (scoring, classifier, formatting)
npm run typecheck
```
On Linux, if `npm install` skipped the Electron binary, run `node node_modules/electron/install.js`.

## Connect the real journal — the only part you must write
Open `src/main/providers/journal.ts` and implement `login`, `getClasses`, `getPeriods`, `getStudents`,
`getLessons`, `getEntries` (the interface and what each must return is in `src/main/providers/types.ts`).
It runs in Node (main process), so `fetch`, cookies, `fs` etc. are available. Throw `AuthError("text")`
for a wrong password - the text is shown on the login screen. Then set `"provider": "journal"` in `config.json`
(settings you need, e.g. the base URL, go in `"providerOptions"` and arrive in the constructor).

Data model: a **Lesson** is a journal date + description. An **Entry** is what one student has on one lesson
(a mark and/or an "Н"; `excused: true` for green ones). `getLessons` must return ALL physics lessons in the period,
also those without marks - the count is the denominator of the absence percentage. Dates are `'YYYY-MM-DD'` strings.

Alternative: `"provider": "C:\\path\\my-provider.js"` loads a plain CommonJS file exporting a class.

## How task types are detected (`src/core/classifier.ts`)
Regexes (case-insensitive, unicode) are matched against the lesson description, first match wins:

| type | matches e.g. |
|---|---|
| Итоговая контрольная (10-11, 25 pts) | "Итоговая контрольная семестровая работа" |
| Устный экзамен (10-11, 15 pts) | "Устный экзамен" |
| Лабораторная | "Лабораторная работа №3", "ЛР 2", "л/р" |
| Домашнее задание | "Домашнее задание", "ДЗ", "д/з" |
| Текущая работа | "Самостоятельная", "Контрольная", "КР", "СР", "Коллоквиум", "Зачёт" |

Override per type in `config.json`: `"classifierRules": { "homework": ["домашн", "на дом"] }` (replaces that type's defaults).
JS `\b` does not work with Cyrillic - use `(?<![\p{L}\p{N}])слово(?![\p{L}\p{N}])` instead.
Unrecognised lessons are highlighted orange in the "Записи журнала" tab, where the teacher can choose the type by hand
(saved locally per class and lesson).

## Rules implemented (`src/core/scoring.ts`)
* Current works: average of all marks x 3, rounded half-up (max 30).
* Homework: mean % -> >=90: 15, 80-89: 13, 70-79: 10, 60-69: 7, 51-59: 5, <=50: 0.
* Labs (10-11): if done >= 4/5 of the labs: average x 3/2 rounded (max 15), otherwise 0.
* Exams (10-11): points are read directly from the journal (written 25 + oral 15).
* Absences without a good reason (% of all lessons): >20% and <=30%: -5; >30%: -10. Green "Н" is ignored.
* Bonus points: entered by the teacher in the app (checklist from the spec + free-form rows).
* 8-9: 42+ -> 5, 33-41 -> 4, 24-32 -> 3, <=23 -> 2.
* 10-11: attested if total >= 53 AND current >= 32 AND final >= 21; if total >= 53 but one part is too low the status is
  "Пересдача: ..." and no mark is shown. Marks: 90+ -> 5, 75-89 -> 4, 53-74 -> 3, below -> 2.

### Assumptions to confirm with the department (all easy to change)
1. **Homework %**: how the journal stores it. `homeworkMode` in `config.json`: `percent` (mark = %), `ten_point`
   (10 -> 100%), `binary` (any mark = done). Missing homework on a date where others have marks counts as 0%; a lesson typed
   as homework/lab/work that nobody has a mark for yet is treated as "not checked yet" and skipped.
2. **"4/5 labs"** = done >= 80% of the labs held (`labsMinFraction`).
3. "Текущая успеваемость" (>=32) = works + homework + labs + absence penalty; "итоговая аттестация" (>=21) = exams.
   Bonus points count only toward the total.
4. Final-stage olympiad bonus (15/10/8) is the same for 8-9 and 10-11, as written in the spec.
5. Homework % gaps between brackets (e.g. 50.5%) -> 5 points.

## Config & data locations
`config.json` is read from: `$BRS_CONFIG`, then `<userData>/config.json` (survives updates), then the copy shipped with
the app (`resources/config.json`). `<userData>` = `%APPDATA%\БРС по физике` on Windows, `~/.config/БРС по физике` on Linux.
Bonus points and type overrides are stored in `brs-data.json` in the same folder (kept on uninstall and update).
Never put journal passwords in `config.json` - it ships inside the installer.

## Build installers
```bash
npm run dist:win      # NSIS installer (.exe)  -> release/
npm run dist:linux    # AppImage + .deb        -> release/
```
Build Windows installers on Windows (or in CI), Linux ones on Linux; build on an older distro (e.g. Ubuntu 22.04) for the
widest compatibility. Windows installs per user (no admin rights). Unsigned `.exe` files may show a SmartScreen prompt
("more info -> run anyway") unless you buy a code-signing certificate.
On Ubuntu 24.04+ an AppImage may need `--no-sandbox` because of AppArmor's user-namespace restriction; the `.deb` avoids this.
A GitHub Actions matrix (`windows-latest`, `ubuntu-22.04`) running `npm ci && npm run dist:<os>` automates both.

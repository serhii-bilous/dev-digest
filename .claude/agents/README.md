# Агенти проєкту DevDigest

Цей файл описує кастомних субагентів, визначених у `.claude/agents/`, та
джерела інформації, якими кожен з них користується під час роботи.

## Огляд

| Агент | Файл | Модель | Права | Призначення |
|---|---|---|---|---|
| `planner` | `planner.md` | sonnet | Read, Grep, Glob, Skill | Планування — розбиває задачу на кроки, нічого не редагує |
| `implementor` | `implementor.md` | sonnet | Read, Write, Edit, Bash, Grep, Glob, Skill | Виконання одного вже описаного кроку плану (backend або frontend) |
| `researcher` | `researcher.md` | sonnet | Read, Grep, Glob, WebSearch, WebFetch | Пошук і зведення інформації — про проєкт або в інтернеті, без правок коду |
| `test-writer` | `test-writer.md` | sonnet | Read, Write, Edit, Bash, Grep, Glob, Skill | Пише/доповнює тести — UI (`client/`, react-testing-library) і backend (`server/`, `reviewer-core/`, Vitest) |
| `architecture-reviewer` | `architecture-reviewer.md` | sonnet | Read, Grep, Glob, Bash (тільки read-only git), Skill | Архітектурне рев'ю вже написаного коду — layering, Dependency Rule; без правок коду |

Усі пʼять агентів читають відповідь мовою запиту та не виконують `git commit`,
`git push` чи інші дії поза власним мандатом.

---

## `planner`

**Роль:** read-only агент планування. Викликається перед будь-якою нетривіальною
реалізацією, особливо перед запуском кількох паралельних `implementor`.

**Джерела, які використовує:**
- `<модуль>/specs/` → `<модуль>/docs/` → `<модуль>/INSIGHTS.md` → вихідний код —
  саме в такому порядку, за конвенцією з кореневого `CLAUDE.md`.
- Кореневі `INSIGHTS.md` і `README.md` — для рішень, що зачіпають кілька пакетів.
- Таблиця "Where things live" з `CLAUDE.md` — стартова карта модулів, але
  перевіряється наживо через `Glob`/`Read`, а не береться на віру.
- `.claude/skills/` — каталог навичок проєкту; для кожного кроку плану підбирає
  відповідний skill замість власного винаходу правил (`onion-architecture`,
  `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design`,
  `next-best-practices`, `react-best-practices`, `react-testing-library`, `zod`,
  `typescript-expert`, `security`, `mermaid-diagram`, `pr-self-review`,
  `engineering-insights`).
- Явно ігнорує `server/clones/**` (клоновані репозиторії) і `**/src/vendor/**`
  (провендорений код) як джерела для плану.
- Якщо питання зовнішнє (бібліотека, best practice) — не гуглить сам, а
  позначає це як відкрите питання для `researcher`.

**Не використовує:** Bash, Write, Edit — суто read-only.

---

## `implementor`

**Роль:** виконавець одного конкретного кроку плану (як правило, отриманого від
`planner`). Може запускатись паралельно кількома інстансами одночасно.

**Джерела, які використовує:**
- Той самий порядок ґрунтування, що й у `planner`: `<модуль>/specs/` →
  `<модуль>/docs/` → `<модуль>/INSIGHTS.md` → джерельний код. Якщо крок плану
  вже цитує `INSIGHTS.md`, довіряє цитаті й повторно файл не читає (щоб N
  паралельних інстансів не платили за повторне читання).
- `.claude/skills/`, викликаються через `Skill`-тул **до** написання коду,
  за доменом модуля:
  - **Backend** (`server/src/modules/**`, `server/src/adapters/**`,
    `server/src/db/**`, `reviewer-core/**`): `onion-architecture` (завжди
    першим), `fastify-best-practices`, `drizzle-orm-patterns`,
    `postgresql-table-design`, `zod` (якщо чіпається `@devdigest/shared`).
  - **Frontend** (`client/src/app/**`, `client/src/components/**`):
    `next-best-practices`, `react-best-practices`, `react-testing-library`,
    `zod`.
  - **Обидві сторони:** `typescript-expert`, `security`.
- Команди верифікації з `CLAUDE.md` (таблиця Commands) — `pnpm typecheck`/`pnpm
  test` для `server/`/`client/`, `npm run typecheck`/`npm test` для
  `reviewer-core/`, `e2e/README.md` для e2e-потоків.
- Ніколи не читає й не редагує `server/clones/**` і `**/src/vendor/**`
  (крім свідомої зміни контракту в `vendor/shared`, якщо це прямо вимагає крок).
- Не викликає сам `pr-self-review` і крок "запис" з `engineering-insights` —
  це ворота, які виконує сесія, що викликала агента, після приземлення всіх
  паралельних кроків.

---

## `researcher`

**Роль:** read-only пошук і зведення інформації — про сам проєкт або
зовнішньої (документація бібліотек, best practices, порівняння).

**Джерела, які використовує:**
- **Проєктне дослідження:** той самий порядок, що й у решти агентів —
  `<модуль>/specs/` → `<модуль>/docs/` → `<модуль>/INSIGHTS.md` → вихідний код,
  через `Read`/`Grep`/`Glob`. Пропускає `server/clones/**`,
  `**/node_modules/**`, `**/src/vendor/**`, якщо явно не попросили туди
  зазирнути.
- **Зовнішнє дослідження:** `WebSearch`/`WebFetch` — документація, поведінка
  фреймворків, порівняння, актуальні дані. Ліміт — приблизно 3–6
  пошуків/читань на запит, без відкритого нарощування обсягу.
- Перед пошуком завжди проганяє запит через "інтерв'ю"-крок (чи достатньо
  конкретна тема, обсяг, тип очікуваної відповіді, чи є подвійне трактування) —
  і за потреби ставить до 3 уточнювальних питань, перш ніж почати шукати.
- Кожен факт у відповіді супроводжується джерелом (шлях+рядок для проєкту,
  URL+дата для вебу); якщо нічого не знайдено — прямо каже "не знайдено",
  а не здогадується.

---

## `test-writer`

**Роль:** пише і доповнює тести для вже написаного коду — і UI (`client/`),
і backend (`server/`, `reviewer-core/`) — не редагуючи сам код продукту.

**Джерела, які використовує:**
- Спочатку формулює очікувану поведінку (happy path + edge cases) з
  формулювання задачі/`specs/`/acceptance criteria — **до** читання
  реалізації. Ніколи не пише assert під те, що поточний код зараз повертає,
  якщо це розходиться з очікуванням; розбіжність звітує як знахідку, а не
  тихо підлаштовує тест під баг.
- **Frontend** (`client/**`): скіл `react-testing-library` — обов'язково
  перед першим написаним тестом.
- **Backend** (`server/**`, `reviewer-core/**`): корінний `TESTING.md` —
  hermetic за замовчуванням, `*.it.test.ts` для DB-backed (testcontainers).
- Той самий порядок ґрунтування, що й у решти агентів: `<модуль>/specs/` →
  `<модуль>/docs/` → `<модуль>/INSIGHTS.md` → джерельний код.
- Перед звітом про завершення завжди запускає відповідну команду пакета
  (`pnpm test`/`npm test`) і санітарно перевіряє, що написаний тест здатен
  впасти (не є тавтологією).

**Не викликає сам:** `pr-self-review`, запис-половину `engineering-insights`
— це ворота сесії, що викликала агента.

---

## `architecture-reviewer`

**Роль:** read-only архітектурне рев'ю вже написаного коду (модуль, перелік
файлів або diff-текст) проти проєктних скілів — layering, Dependency Rule,
type-level дизайн. Не пише і не редагує код, не гейтить PR, не перевіряє
покриття вимог плану.

**Джерела, які використовує:**
- **Backend**: скіл `onion-architecture` — завжди першим, без винятків
  (Dependency Rule, чи не витікають persistence/framework типи через межі
  шарів, чи конструюються адаптери лише в `platform/container.ts`); скіл
  `fastify-best-practices`, якщо змінено `routes.ts`/plugin.
- **Frontend**: скіли `next-best-practices`, `react-best-practices`.
- **Обидві сторони**: скіл `typescript-expert` для нетривіального
  типового дизайну.
- Кожна знахідка — у структурованому форматі `Location → Layer → Reasoning
  → Finding → Confidence`, причому Reasoning завжди йде перед Finding
  (документований прийом проти false positives).
- Явно консервативний scope: лише архітектурні порушення, не стилістика,
  не security, не test coverage, не requirements-coverage (те й інше —
  зона `pr-self-review`/`plan-verifier`).

**Права:** `Bash` дозволений виключно для read-only git-інспекції (`git
diff`, `git log`, `git show`, `git status`), коли задача не дала явного
переліку файлів/diff — ніколи для запису чи будь-якої іншої дії. Ніколи
`Edit`/`Write`.

---

## Спільні правила для всіх пʼяти

- Порядок ґрунтування — з кореневого `CLAUDE.md`: `specs/` → `docs/` →
  `INSIGHTS.md` → код.
- `.claude/skills/` — єдине джерело правди для доменних конвенцій
  (архітектура, Fastify, Drizzle, Next.js/React, Zod, TypeScript, безпека);
  агенти посилаються на навички за назвою, а не вигадують власні правила.
- Заборонені зони для читання/редагування: `server/clones/**` (клоновані
  репозиторії користувачів, у `.gitignore`) та `**/src/vendor/**` (провендорений
  код), крім свідомої зміни контракту в `vendor/shared`.
- Жоден з пʼяти агентів не робить `git commit`/`git push`, не відкриває PR і не
  запускає деструктивні операції (наприклад, `docker compose down -v`).

# Визуализация и сравнение алгоритмов сортировки

## Описание проекта

Веб-приложение для визуализации и сравнения различных алгоритмов сортировки массивов. Состоит из:
- **backend** (Node.js + Express + Sequelize + PostgreSQL): API для сортировки, хранения сессий и шагов, статистики.
- **frontend** (HTML/CSS/JS): современный сайт для взаимодействия с пользователем и визуализации сортировки.

В качестве базы данных используется PostgreSQL. Все параметры подключения и настройки задаются через файл `.env` в папке `backend` (этот файл должен быть добавлен в `.gitignore`).

---

## Быстрый старт

### 1. Клонируйте репозиторий

```bash
git clone <адрес_репозитория>
cd <папка_проекта>
```

### 2. Создайте базу данных PostgreSQL

- Установите PostgreSQL, если ещё не установлен.
- Создайте базу данных (по умолчанию `sort_db`).
- Создайте пользователя и задайте пароль.
- Выполните SQL-скрипт для создания таблиц и индексов (см. ниже).

### 3. Настройте переменные окружения

В папке `backend` создайте файл `.env` по примеру ниже (не добавляйте его в репозиторий!):

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sort_db
DB_USER=postgres
DB_PASSWORD=ваш_пароль
PORT=5050
NODE_ENV=development
JWT_SECRET=your-super-secret-jwt-key-here
SESSION_SECRET=your-session-secret-here
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=10
MAX_ARRAY_SIZE=1000
MAX_ARRAY_VALUE=10000
MIN_ARRAY_VALUE=-10000
LOG_LEVEL=info
CLEANUP_INTERVAL_HOURS=24
MAX_SESSION_AGE_HOURS=24
```

### 4. Установите зависимости backend

```bash
cd backend
npm install
```

### 5. Проведите миграции (если требуется)

```bash
npm run db:migrate
```

### 6. Запустите backend

```bash
npm run dev
```
или для production:
```bash
npm start
```

### 7. Настройте frontend

Фронтенд — это статический сайт. Его можно открыть напрямую через браузер:
```bash
cd ../frontend
# Откройте index.html в браузере
```
или развернуть на любом статическом сервере.

### 8. Проверьте работу

- Backend по умолчанию доступен на `http://localhost:5050`
- Frontend — открывайте `frontend/index.html` в браузере.

---

## SQL-скрипт для создания структуры БД

```sql
CREATE TABLE public."Sessions" (
    id integer NOT NULL,
    "sessionId" uuid NOT NULL,
    "originalArray" integer[] NOT NULL,
    "sortedArray" integer[] NOT NULL,
    "totalSteps" integer NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);

ALTER TABLE ONLY public."Sessions"
    ADD CONSTRAINT "Sessions_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Sessions"
    ADD CONSTRAINT "Sessions_sessionId_key" UNIQUE ("sessionId");

CREATE TABLE public."Steps" (
    id integer NOT NULL,
    "sessionId" uuid NOT NULL,
    "stepNumber" integer NOT NULL,
    "arrayState" integer[] NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);

ALTER TABLE ONLY public."Steps"
    ADD CONSTRAINT "Steps_pkey" PRIMARY KEY (id);

CREATE TABLE public.algorithm_performance (
    id integer NOT NULL,
    "algorithmType" character varying(255) NOT NULL,
    "arraySize" integer NOT NULL,
    "executionTime" integer NOT NULL,
    "stepCount" integer NOT NULL,
    date date NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);

ALTER TABLE ONLY public.algorithm_performance
    ADD CONSTRAINT algorithm_performance_pkey PRIMARY KEY (id);

CREATE TABLE public.sessions (
    id integer NOT NULL,
    "sessionId" uuid NOT NULL,
    "originalArray" integer[] NOT NULL,
    "sortedArray" integer[] NOT NULL,
    "totalSteps" integer NOT NULL,
    "algorithmType" character varying(255) DEFAULT 'bubble'::character varying NOT NULL,
    "executionTime" integer,
    "clientInfo" jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT "sessions_sessionId_key" UNIQUE ("sessionId");

CREATE TABLE public.steps (
    id integer NOT NULL,
    "sessionId" uuid NOT NULL,
    "stepNumber" integer NOT NULL,
    "arrayState" integer[] NOT NULL,
    "swapIndices" integer[],
    "comparisonCount" integer DEFAULT 0,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);

ALTER TABLE ONLY public.steps
    ADD CONSTRAINT steps_pkey PRIMARY KEY (id);

CREATE INDEX idx_sessions_sessionid ON public."Sessions" USING btree ("sessionId");
CREATE INDEX idx_steps_sessionid ON public."Steps" USING btree ("sessionId");
CREATE INDEX idx_steps_stepnumber ON public."Steps" USING btree ("stepNumber");
CREATE INDEX sessions_algorithm_type ON public.sessions USING btree ("algorithmType");
CREATE INDEX sessions_created_at ON public.sessions USING btree ("createdAt");
CREATE INDEX sessions_session_id ON public.sessions USING btree ("sessionId");
CREATE INDEX steps_session_id_step_number ON public.steps USING btree ("sessionId", "stepNumber");
CREATE INDEX algorithm_performance_algorithm_type_array_size ON public.algorithm_performance USING btree ("algorithmType", "arraySize");
CREATE INDEX algorithm_performance_date ON public.algorithm_performance USING btree (date);

ALTER TABLE ONLY public."Steps"
    ADD CONSTRAINT "Steps_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public."Sessions"("sessionId") ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.steps
    ADD CONSTRAINT "steps_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public.sessions("sessionId") ON UPDATE CASCADE ON DELETE CASCADE;
```

---

## Важно
- Файл `.env` не должен попадать в репозиторий, добавьте его в `.gitignore`.
- Все личные данные (пароли, секреты) храните только в `.env`.

---

## Зависимости
- Node.js >= 16
- npm >= 8
- PostgreSQL >= 12

---

## Краткая структура БД
- **sessions** — информация о сессиях сортировки
- **steps** — пошаговые состояния массива
- **algorithm_performance** — статистика по производительности алгоритмов

---

Если нужно добавить описание API или что-то ещё — дайте знать!

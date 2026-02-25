-- ── v3: Exercises & Results ────────────────────────────────────

-- Generated exercise sets, one per text
create table if not exists public.exercises (
  id         uuid primary key default gen_random_uuid(),
  text_id    uuid not null references public.texts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  questions  jsonb not null default '[]',
  -- questions shape:
  -- [{ id, type: 'mc'|'fill'|'translate', prompt, options?: string[], answer, hint? }]
  created_at timestamptz not null default now(),
  unique (text_id, user_id)
);
alter table public.exercises enable row level security;
create policy "Users manage own exercises"
  on public.exercises for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Each completed attempt at an exercise set
create table if not exists public.exercise_results (
  id          uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  text_id     uuid not null references public.texts(id) on delete cascade,
  level       text not null,
  answers     jsonb not null default '{}', -- { questionId: userAnswer }
  grading     jsonb not null default '{}', -- { questionId: { correct, score, feedback } }
  score       numeric(5,2) not null default 0, -- 0-100
  completed_at timestamptz not null default now()
);
alter table public.exercise_results enable row level security;
create policy "Users manage own results"
  on public.exercise_results for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists results_user_time on public.exercise_results(user_id, completed_at desc);
create index if not exists results_text on public.exercise_results(text_id);

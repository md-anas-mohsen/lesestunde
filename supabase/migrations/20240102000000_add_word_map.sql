-- ── v2: Add word_map to texts table ───────────────────────────
-- Maps each dictionary-form vocabulary word to the surface form(s)
-- that actually appear in the generated passage body.
-- e.g. {"anrufen": "rufe an", "aufstehen": "stehe auf"}
-- This enables correct highlighting of separable verbs and inflected forms.

alter table public.texts
  add column if not exists word_map jsonb not null default '{}';

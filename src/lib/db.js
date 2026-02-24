// ── Supabase data access layer ────────────────────────────────
// All functions throw on error so callers can catch + show UI messages.

import { supabase } from './supabase.js'

// ── Auth ──────────────────────────────────────────────────────

export function onAuthChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null)
  })
  return () => subscription.unsubscribe()
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + window.location.pathname,
    },
  })
  if (error) throw error
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

// ── API Settings ──────────────────────────────────────────────

export async function loadApiSettings(userId) {
  const { data, error } = await supabase
    .from('api_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data  // null if not set yet
}

export async function saveApiSettings(userId, settings) {
  // { provider, base_url, model, api_key }
  const { error } = await supabase
    .from('api_settings')
    .upsert({ user_id: userId, ...settings }, { onConflict: 'user_id' })
  if (error) throw error
}

// ── Words ─────────────────────────────────────────────────────

export async function loadWords(userId) {
  const { data, error } = await supabase
    .from('words')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function addWords(userId, wordStrings) {
  // wordStrings: string[]
  // Insert only new words (ignore conflicts on (user_id, word))
  const rows = wordStrings.map(w => ({ user_id: userId, word: w }))
  const { data, error } = await supabase
    .from('words')
    .upsert(rows, { onConflict: 'user_id,word', ignoreDuplicates: true })
    .select()
  if (error) throw error
  return data ?? []
}

export async function updateWordDefinition(wordId, def) {
  // def: { translation, pos, example_de, example_en }
  const { error } = await supabase
    .from('words')
    .update(def)
    .eq('id', wordId)
  if (error) throw error
}

export async function deleteWord(wordId) {
  const { error } = await supabase.from('words').delete().eq('id', wordId)
  if (error) throw error
}

export async function clearAllWords(userId) {
  const { error } = await supabase.from('words').delete().eq('user_id', userId)
  if (error) throw error
}

// ── Texts (corpus) ────────────────────────────────────────────

export async function loadTexts(userId) {
  const { data, error } = await supabase
    .from('texts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function saveText(userId, { title, body, level, words_input, words_used, word_map = {} }) {
  const { data, error } = await supabase
    .from('texts')
    .insert({ user_id: userId, title, body, level, words_input, words_used, word_map })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteText(textId) {
  const { error } = await supabase.from('texts').delete().eq('id', textId)
  if (error) throw error
}

export async function deleteAllTexts(userId) {
  const { error } = await supabase.from('texts').delete().eq('user_id', userId)
  if (error) throw error
}

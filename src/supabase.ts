import { createClient } from '@supabase/supabase-js';

// La clé publishable est publique ; les règles RLS protègent les données.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://htvomoyphxpdbmgrscia.supabase.co';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_0tIY59P-cRZERh-WJMTOfA_GWd9j6s4';
export const supabase = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

import { supabase } from './supabase';
import type { CloudBackend } from './cloudStorage';

export function createBackend(userId: string): CloudBackend {
  return {
    async read() {
      const { data, error } = await supabase.from('openworld_documents').select('document_key,payload,revision').eq('user_id', userId);
      if (error) throw error;
      return data;
    },
    async insert(key, payload) {
      const { data, error } = await supabase.from('openworld_documents').insert({ user_id: userId, document_key: key, payload, revision: 1 }).select('revision').maybeSingle();
      if (error?.code === '23505') return null;
      if (error) throw error;
      return data?.revision ?? null;
    },
    async update(key, payload, revision) {
      const { data, error } = await supabase.from('openworld_documents').update({ payload, revision: revision + 1, updated_at: new Date().toISOString() }).eq('user_id', userId).eq('document_key', key).eq('revision', revision).select('revision').maybeSingle();
      if (error) throw error;
      return data?.revision ?? null;
    },
  };
}

import { supabase } from './supabase';

export type Plan = 'free' | 'pro';
/** Nombre de parcours enregistrés autorisés au plan gratuit (aussi appliqué côté serveur par un trigger SQL). */
export const FREE_SAVED_LIMIT = 3;

export function canSaveMore(plan: Plan, savedCount: number, isNew: boolean): boolean {
  return plan === 'pro' || !isNew || savedCount < FREE_SAVED_LIMIT;
}

export async function loadPlan(userId: string): Promise<Plan> {
  try {
    const { data, error } = await supabase.from('openworld_subscriptions').select('plan,status,current_period_end').eq('user_id', userId).maybeSingle();
    if (error || !data) return 'free';
    const active = data.status === 'active' || data.status === 'trialing';
    const valid = !data.current_period_end || new Date(data.current_period_end).getTime() > Date.now();
    return data.plan === 'pro' && active && valid ? 'pro' : 'free';
  } catch { return 'free'; }
}

/** Ouvre le paiement Stripe via la fonction Edge `create-checkout`. */
export async function startCheckout(): Promise<string> {
  const { data, error } = await supabase.functions.invoke('create-checkout', { body: { returnUrl: window.location.href.split('#')[0] } });
  if (error || !data?.url || typeof data.url !== 'string') throw new Error('Le paiement n’est pas encore disponible. Réessayez plus tard.');
  return data.url;
}

export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.rpc('openworld_delete_account');
  if (error) throw error;
}

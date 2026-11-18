// Fonction Edge Supabase : reçoit les événements Stripe et met à jour le plan de l'utilisateur.
// Déployer avec --no-verify-jwt (Stripe n'envoie pas de JWT Supabase). Secrets : STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
import Stripe from 'npm:stripe@17';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

async function sync(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  const { data } = await admin.from('openworld_subscriptions').select('user_id').eq('stripe_customer_id', customerId).maybeSingle();
  const userId = data?.user_id ?? subscription.metadata?.user_id;
  if (!userId) return;
  const active = subscription.status === 'active' || subscription.status === 'trialing';
  const end = subscription.items.data[0]?.current_period_end ?? null;
  await admin.from('openworld_subscriptions').upsert({
    user_id: userId, plan: active ? 'pro' : 'free', status: subscription.status, stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id, current_period_end: end ? new Date(end * 1000).toISOString() : null, updated_at: new Date().toISOString(),
  });
}

Deno.serve(async req => {
  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('missing signature', { status: 400 });
  let event: Stripe.Event;
  try { event = await stripe.webhooks.constructEventAsync(await req.text(), signature, Deno.env.get('STRIPE_WEBHOOK_SECRET')!); }
  catch { return new Response('invalid signature', { status: 400 }); }
  if (event.type.startsWith('customer.subscription.')) await sync(event.data.object as Stripe.Subscription);
  return new Response('ok');
});

// Fonction Edge Supabase : crée une session Stripe Checkout pour le plan Pro.
// Secrets requis : STRIPE_SECRET_KEY, STRIPE_PRICE_ID, SITE_URL (+ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fournis par Supabase).
import Stripe from 'npm:stripe@17';
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': Deno.env.get('SITE_URL') ?? '', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info', 'Vary': 'Origin' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const siteUrl = Deno.env.get('SITE_URL');
  if (!siteUrl) return json({ error: 'not_configured' }, 500);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  const { data: auth } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  const user = auth.user;
  if (!user?.email) return json({ error: 'unauthorized' }, 401);

  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);
  const { data: existing } = await admin.from('openworld_subscriptions').select('stripe_customer_id').eq('user_id', user.id).maybeSingle();
  let customer = existing?.stripe_customer_id as string | undefined;
  if (!customer) {
    customer = (await stripe.customers.create({ email: user.email, metadata: { user_id: user.id } })).id;
    await admin.from('openworld_subscriptions').upsert({ user_id: user.id, stripe_customer_id: customer });
  }
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription', customer, client_reference_id: user.id,
    line_items: [{ price: Deno.env.get('STRIPE_PRICE_ID')!, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${siteUrl}?paiement=ok`, cancel_url: `${siteUrl}?paiement=annule`,
    subscription_data: { metadata: { user_id: user.id } },
  });
  return json({ url: session.url });
});

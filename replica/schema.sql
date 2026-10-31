-- Schéma Postgres (Supabase). Première migration.
-- Conventions : uuid, timestamptz en UTC, montants en centimes + devise,
-- RLS activée partout. Les écritures sensibles (crédits, statut des opérations,
-- liens éditeur, stats) passent par le service role (worker / routes serveur),
-- jamais par le client.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- utilitaire
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ------------------------------------------------------------------ profils
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  epic_account_id text unique,                 -- login Epic (should)
  locale text not null default 'fr' check (locale in ('fr','en')),
  plan text not null default 'free'
    check (plan in ('free','starter','pro','studio')),
  billing_period text check (billing_period in ('month','year')),
  stripe_customer_id text unique,
  referral_code text not null unique default substr(encode(gen_random_bytes(6),'hex'),1,8),
  referred_by uuid references profiles(id) on delete set null,
  preferred_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on profiles (referred_by);
create trigger profiles_updated before update on profiles
  for each row execute function set_updated_at();

-- Limites par formule : une seule source de vérité.
create table plan_limits (
  plan text primary key check (plan in ('free','starter','pro','studio')),
  monthly_credits int not null,
  max_projects int not null,
  stats_island_cap int,                        -- null = tout le catalogue
  frontier_models boolean not null,
  byok boolean not null,
  models_3d boolean not null,
  ideas_and_analysis boolean not null
);
insert into plan_limits values
  ('free',    0,     1,   100,  false, false, false, false),
  ('starter', 1600,  5,   500,  false, false, false, false),
  ('pro',     7500,  25,  null, true,  true,  true,  true),
  ('studio',  20000, 100, null, true,  true,  true,  true);

-- ------------------------------------------------------------- abonnements
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  stripe_subscription_id text not null unique,
  plan text not null check (plan in ('starter','pro','studio')),
  billing_period text not null check (billing_period in ('month','year')),
  status text not null check (status in
    ('trialing','active','past_due','canceled','incomplete','incomplete_expired','unpaid','paused')),
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on subscriptions (user_id, status);
create trigger subscriptions_updated before update on subscriptions
  for each row execute function set_updated_at();

-- Idempotence des webhooks Stripe : un event traité une seule fois.
create table stripe_events (
  id text primary key,                          -- evt_...
  type text not null,
  processed_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ crédits
-- Deux poches : la dotation mensuelle (remise à niveau à chaque période)
-- et les crédits bonus/achetés (n'expirent pas). On dépense la dotation d'abord.
create table wallets (
  user_id uuid primary key references profiles(id) on delete cascade,
  monthly_balance int not null default 0 check (monthly_balance >= 0),
  bonus_balance int not null default 0 check (bonus_balance >= 0),
  reserved int not null default 0 check (reserved >= 0),  -- réservé pour une étape en cours
  updated_at timestamptz not null default now()
);

create table credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  delta int not null,                           -- + crédit, - débit
  pocket text not null check (pocket in ('monthly','bonus')),
  reason text not null check (reason in
    ('monthly_grant','monthly_reset','purchase','referral','social_bonus',
     'build','chat','thumbnail','model3d','idea','analysis','refund','admin')),
  ref_type text,                                -- 'operation','thumbnail',... pour l'audit
  ref_id uuid,
  idempotency_key text unique,                  -- ex : 'grant:<invoice_id>'
  created_at timestamptz not null default now()
);
create index on credit_ledger (user_id, created_at desc);

-- Débit atomique : verrouille le wallet, refuse si solde insuffisant.
create or replace function spend_credits(
  p_user uuid, p_amount int, p_reason text, p_ref_type text, p_ref_id uuid, p_key text
) returns boolean language plpgsql security definer set search_path = public as $$
declare w wallets; from_monthly int; from_bonus int;
begin
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if p_key is not null and exists (select 1 from credit_ledger where idempotency_key = p_key) then
    return true;                                -- déjà débité
  end if;
  select * into w from wallets where user_id = p_user for update;
  if not found or w.monthly_balance + w.bonus_balance < p_amount then return false; end if;
  from_monthly := least(w.monthly_balance, p_amount);
  from_bonus := p_amount - from_monthly;
  update wallets set monthly_balance = monthly_balance - from_monthly,
                     bonus_balance = bonus_balance - from_bonus, updated_at = now()
   where user_id = p_user;
  if from_monthly > 0 then
    insert into credit_ledger (user_id, delta, pocket, reason, ref_type, ref_id, idempotency_key)
    values (p_user, -from_monthly, 'monthly', p_reason, p_ref_type, p_ref_id, p_key);
  end if;
  if from_bonus > 0 then
    insert into credit_ledger (user_id, delta, pocket, reason, ref_type, ref_id, idempotency_key)
    values (p_user, -from_bonus, 'bonus', p_reason, p_ref_type, p_ref_id,
            case when from_monthly > 0 then p_key || ':bonus' else p_key end);
  end if;
  return true;
end $$;
revoke all on function spend_credits from public, anon, authenticated;

-- Clé API personnelle (Pro+). Chiffrée côté serveur (Supabase Vault / clé KMS),
-- jamais renvoyée au client : on n'expose que les 4 derniers caractères.
create table user_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  provider text not null check (provider in ('anthropic')),
  ciphertext bytea not null,
  last4 text not null,
  created_at timestamptz not null default now(),
  unique (user_id, provider)
);

-- ----------------------------------------------------------------- projets
create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('island','thumbnail','model3d')),
  name text not null check (length(name) between 1 and 120),
  island_code text check (island_code ~ '^\d{4}-\d{4}-\d{4}$'),  -- une fois publiée
  cover_url text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on projects (user_id, updated_at desc) where archived_at is null;
create trigger projects_updated before update on projects
  for each row execute function set_updated_at();

-- Limite de projets par formule, appliquée en base (pas seulement dans l'UI).
create or replace function enforce_project_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare cap int; n int;
begin
  select pl.max_projects into cap from profiles p join plan_limits pl on pl.plan = p.plan
   where p.id = new.user_id;
  select count(*) into n from projects where user_id = new.user_id and archived_at is null;
  if n >= cap then raise exception 'project_limit_reached' using errcode = 'P0001'; end if;
  return new;
end $$;
create trigger projects_limit before insert on projects
  for each row execute function enforce_project_limit();

-- ---------------------------------------------------------- chat et builds
create table messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null check (role in ('user','assistant','system_note')),
  content text not null,
  model text,
  credits_spent int not null default 0,
  created_at timestamptz not null default now()
);
create index on messages (project_id, created_at);

create table build_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  source_message_id uuid references messages(id) on delete set null,
  steps jsonb not null,                         -- [{idx,title,detail,status}]
  status text not null default 'proposed' check (status in
    ('proposed','approved','running','waiting_approval','done','failed','cancelled')),
  model text not null,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on build_plans (project_id, created_at desc);
-- Un seul build actif par projet.
create unique index one_running_plan_per_project on build_plans (project_id)
  where status in ('approved','running','waiting_approval');
create trigger build_plans_updated before update on build_plans
  for each row execute function set_updated_at();

-- Chaque appel d'outil MCP passé (ou à passer) dans l'éditeur.
create table operations (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references build_plans(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  step_idx int not null,
  seq int not null,
  tool text not null,                           -- nom exact de l'outil MCP UEFN
  is_write boolean not null,                    -- les écritures attendent un accord
  args jsonb not null,
  preview jsonb,                                -- diff Verse, devices/propriétés touchés
  undo jsonb,                                   -- ce qu'il faut rejouer pour annuler
  status text not null default 'pending' check (status in
    ('pending','awaiting_approval','approved','rejected','sent','succeeded','failed','undone')),
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (plan_id, seq)
);
create index on operations (plan_id, seq);
create index on operations (user_id, status) where status in ('awaiting_approval','sent');

-- ---------------------------------------------------------- pont éditeur
create table editor_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  machine_name text not null,
  bridge_version text not null,
  token_hash bytea not null unique,             -- sha256 du jeton longue durée du pont
  status text not null default 'offline' check (status in ('online','offline')),
  mcp_reachable boolean not null default false, -- le pont voit-il 127.0.0.1:<port>/mcp ?
  uefn_project text,
  tools jsonb,                                  -- dernier tools/list remonté
  is_active boolean not null default false,     -- celui qui reçoit les constructions
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index on editor_links (user_id);
-- « Un seul éditeur à la fois » : au plus un lien actif par utilisateur.
create unique index one_active_editor on editor_links (user_id)
  where is_active and revoked_at is null;

create table pairing_codes (
  code text primary key check (code ~ '^[A-Z0-9]{8}$'),
  user_id uuid not null references profiles(id) on delete cascade,
  expires_at timestamptz not null,              -- 10 minutes
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index on pairing_codes (user_id);

-- ------------------------------------------------------ miniatures et 3D
create table thumbnails (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  parent_id uuid references thumbnails(id) on delete set null,
  prompt text not null,
  source_image_path text,
  image_path text,                              -- bucket privé « thumbnails »
  width int, height int,
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  provider_job_id text,
  credits_spent int not null default 0,
  created_at timestamptz not null default now()
);
create index on thumbnails (project_id, created_at desc);

create table models_3d (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  parent_id uuid references models_3d(id) on delete set null,
  prompt text,
  source_image_path text,
  style text not null default 'cartoon' check (style in ('cartoon','lowpoly','realistic','pixel')),
  glb_path text, fbx_path text, preview_path text,
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  provider_job_id text,
  credits_spent int not null default 0,
  created_at timestamptz not null default now(),
  constraint prompt_or_image check (prompt is not null or source_image_path is not null)
);
create index on models_3d (project_id, created_at desc);

-- -------------------------------------------- stats d'îles (Fortnite Data API)
create table islands (
  code text primary key check (code ~ '^\d{4}-\d{4}-\d{4}$'),
  title text not null,
  creator_code text,
  category text,
  created_in text,
  tags text[] not null default '{}',
  latest_peak_ccu int,                          -- dénormalisé pour trier vite
  latest_metrics_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index on islands using gin (tags);
create index on islands (latest_peak_ccu desc nulls last);
create index on islands (creator_code);

create table island_metrics (
  island_code text not null references islands(code) on delete cascade,
  interval text not null check (interval in ('10m','1h','1d')),
  bucket_start timestamptz not null,
  peak_ccu int, unique_players int, plays int, minutes_played bigint,
  minutes_per_player numeric, favorites int, recommends int,
  retention_d1 numeric, retention_d7 numeric,
  primary key (island_code, interval, bucket_start)
);
create index on island_metrics (interval, bucket_start desc);

-- Agrégat par tag, recalculé par un job (évite de scanner les métriques à chaque vue).
create table tag_trends (
  tag text not null,
  day date not null,
  island_count int not null,
  total_peak_ccu bigint not null,
  change_7d numeric,
  primary key (tag, day)
);

-- ------------------------------------------------------ idées et analyses
create table ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('generated','analysis')),
  title text not null,
  pitch text not null,
  tags text[] not null default '{}',
  score int check (score between 0 and 100),
  strengths jsonb, risks jsonb, recommendations jsonb,
  evidence jsonb,                               -- îles et tendances citées
  sent_to_project_id uuid references projects(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on ideas (user_id, created_at desc);

-- --------------------------------------------------------------- croissance
create table social_bonus_claims (
  user_id uuid not null references profiles(id) on delete cascade,
  network text not null check (network in ('discord','tiktok','instagram')),
  handle text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, network)
);

create table referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references profiles(id) on delete cascade,
  referred_id uuid not null unique references profiles(id) on delete cascade,
  stripe_invoice_id text not null unique,
  credits int not null,
  created_at timestamptz not null default now()
);
create index on referral_rewards (referrer_id);

create table creator_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  email text not null,
  platforms jsonb not null,                     -- [{network, handle, followers}]
  motivation text,
  status text not null default 'new' check (status in ('new','contacted','accepted','rejected')),
  created_at timestamptz not null default now()
);

create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  email text not null,
  subject text not null,
  body text not null,
  status text not null default 'open' check (status in ('open','answered','closed')),
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------------- RLS
alter table profiles enable row level security;
alter table plan_limits enable row level security;
alter table subscriptions enable row level security;
alter table stripe_events enable row level security;
alter table wallets enable row level security;
alter table credit_ledger enable row level security;
alter table user_api_keys enable row level security;
alter table projects enable row level security;
alter table messages enable row level security;
alter table build_plans enable row level security;
alter table operations enable row level security;
alter table editor_links enable row level security;
alter table pairing_codes enable row level security;
alter table thumbnails enable row level security;
alter table models_3d enable row level security;
alter table islands enable row level security;
alter table island_metrics enable row level security;
alter table tag_trends enable row level security;
alter table ideas enable row level security;
alter table social_bonus_claims enable row level security;
alter table referral_rewards enable row level security;
alter table creator_applications enable row level security;
alter table support_tickets enable row level security;

-- Lecture de ses propres lignes. Aucune policy = aucun accès client
-- (stripe_events, user_api_keys, pairing_codes : service role uniquement).
create policy own_profile_read on profiles for select using (id = auth.uid());
create policy own_profile_update on profiles for update using (id = auth.uid())
  with check (id = auth.uid());   -- plan / stripe_customer_id protégés par un trigger côté serveur ou des colonnes GRANT
create policy limits_read on plan_limits for select using (true);
create policy own_subs on subscriptions for select using (user_id = auth.uid());
create policy own_wallet on wallets for select using (user_id = auth.uid());
create policy own_ledger on credit_ledger for select using (user_id = auth.uid());

create policy own_projects_read on projects for select using (user_id = auth.uid());
create policy own_projects_write on projects for insert with check (user_id = auth.uid());
create policy own_projects_update on projects for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy own_messages_read on messages for select using (user_id = auth.uid());
create policy own_plans_read on build_plans for select using (user_id = auth.uid());
create policy own_ops_read on operations for select using (user_id = auth.uid());
create policy own_links_read on editor_links for select using (user_id = auth.uid());
create policy own_thumbs_read on thumbnails for select using (user_id = auth.uid());
create policy own_models_read on models_3d for select using (user_id = auth.uid());
create policy own_ideas_read on ideas for select using (user_id = auth.uid());
create policy own_social_read on social_bonus_claims for select using (user_id = auth.uid());
create policy own_referrals_read on referral_rewards for select using (referrer_id = auth.uid());

-- Stats : lisibles par tout utilisateur connecté (le plafond par formule est
-- appliqué dans la route serveur, pas en RLS, pour garder la requête simple).
create policy stats_islands on islands for select to authenticated using (true);
create policy stats_metrics on island_metrics for select to authenticated using (true);
create policy stats_tags on tag_trends for select to authenticated using (true);

-- Colonnes sensibles du profil : le client ne peut modifier que ces champs.
revoke update on profiles from authenticated;
grant update (display_name, locale, preferred_model) on profiles to authenticated;

-- Création auto du profil et du wallet à l'inscription.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name) values (new.id, new.raw_user_meta_data->>'name');
  insert into wallets (user_id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Realtime : le navigateur suit plans, opérations et liens éditeur en direct.
alter publication supabase_realtime add table build_plans, operations, editor_links, thumbnails, models_3d;

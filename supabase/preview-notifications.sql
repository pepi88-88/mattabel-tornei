create table if not exists public.preview_notification_contacts(player_id text primary key, phone text not null default '');
create table if not exists public.preview_notification_checks(tournament_id text not null, player_id text not null, contacted boolean not null default false, primary key(tournament_id,player_id));
create table if not exists public.preview_notification_teams(tournament_id text not null, registration_id text not null, status text not null check(status in ('pending','present','absent')), primary key(tournament_id,registration_id));
alter table public.preview_notification_contacts enable row level security;
alter table public.preview_notification_checks enable row level security;
alter table public.preview_notification_teams enable row level security;
revoke all on public.preview_notification_contacts,public.preview_notification_checks,public.preview_notification_teams from anon,authenticated;
grant select,insert,update,delete on public.preview_notification_contacts,public.preview_notification_checks,public.preview_notification_teams to service_role;

create table if not exists public.preview_push_subscriptions(id text primary key, endpoint text not null,p256dh text not null,auth text not null,origin text not null);
create index if not exists preview_push_subscriptions_origin_idx on public.preview_push_subscriptions(origin);
create table if not exists public.preview_push_history(id bigint generated always as identity primary key,origin text not null,message text not null,sent integer not null,failed integer not null,created_at timestamptz not null default now());
alter table public.preview_push_subscriptions enable row level security;
alter table public.preview_push_history enable row level security;
revoke all on public.preview_push_subscriptions,public.preview_push_history from anon,authenticated;
grant select,insert,update,delete on public.preview_push_subscriptions,public.preview_push_history to service_role;
grant usage,select on sequence public.preview_push_history_id_seq to service_role;

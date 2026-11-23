create table if not exists public.preview_notification_contacts(player_id text primary key, phone text not null default '');
create table if not exists public.preview_notification_checks(tournament_id text not null, player_id text not null, contacted boolean not null default false, primary key(tournament_id,player_id));
create table if not exists public.preview_notification_teams(tournament_id text not null, registration_id text not null, status text not null check(status in ('pending','present','absent')), primary key(tournament_id,registration_id));
alter table public.preview_notification_contacts enable row level security;
alter table public.preview_notification_checks enable row level security;
alter table public.preview_notification_teams enable row level security;
revoke all on public.preview_notification_contacts,public.preview_notification_checks,public.preview_notification_teams from anon,authenticated;
grant select,insert,update,delete on public.preview_notification_contacts,public.preview_notification_checks,public.preview_notification_teams to service_role;

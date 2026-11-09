-- Os valores são pontos de demonstração, guardados em centavos inteiros.
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('rider', 'driver')),
  balance_cents integer not null default 10000 check (balance_cents between 0 and 50000),
  created_at timestamptz not null default now()
);
create table public.rides (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.profiles(id),
  driver_id uuid references public.profiles(id),
  origin text not null check (char_length(origin) between 3 and 120),
  destination text not null check (char_length(destination) between 3 and 120),
  fare_cents integer not null check (fare_cents > 0),
  status text not null default 'pending' check (status in ('pending','accepted','in_progress','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rides_queue_idx on public.rides(status, created_at desc);
create index rides_rider_idx on public.rides(rider_id, created_at desc);
create index rides_driver_idx on public.rides(driver_id, created_at desc);
create table public.wallet_ledger (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id),
  ride_id uuid references public.rides(id),
  amount_cents integer not null,
  reason text not null check (reason in ('initial','credit','ride','refund')),
  created_at timestamptz not null default now(),
  unique (ride_id, reason)
);
create table public.rate_limit_windows (
  key text primary key,
  count integer not null,
  expires_at timestamptz not null
);
alter table public.profiles enable row level security;
alter table public.rides enable row level security;
alter table public.wallet_ledger enable row level security;
alter table public.rate_limit_windows enable row level security;
revoke all on public.profiles, public.rides, public.wallet_ledger, public.rate_limit_windows from public, anon, authenticated;
grant all on public.profiles, public.rides, public.wallet_ledger, public.rate_limit_windows to service_role;
grant usage, select on sequence public.wallet_ledger_id_seq to service_role;

create function public.consume_rate_limit(p_key text, p_limit integer, p_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into rate_limit_windows as w (key, count, expires_at)
    values (p_key, 1, now() + make_interval(secs => p_seconds))
    on conflict (key) do update set
      count = case when w.expires_at <= now() then 1 else w.count + 1 end,
      expires_at = case when w.expires_at <= now() then now() + make_interval(secs => p_seconds) else w.expires_at end
    returning count into n;
  return n <= p_limit;
end $$;

create function public.create_demo_profile(p_name text, p_email text, p_hash text, p_role text)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare profile public.profiles;
begin
  insert into profiles(name,email,password_hash,role) values(p_name,p_email,p_hash,p_role) returning * into profile;
  insert into wallet_ledger(profile_id,amount_cents,reason) values(profile.id,profile.balance_cents,'initial');
  return profile;
end $$;

create function public.credit_demo_wallet(p_user uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare balance integer; added integer; reserved integer;
begin
  select balance_cents into balance from profiles where id=p_user and role='rider' for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  select coalesce(sum(fare_cents),0) into reserved from rides where rider_id=p_user and status in ('pending','accepted');
  added := least(5000, 50000-balance-reserved);
  if added <= 0 then raise exception 'BALANCE_CAP'; end if;
  update profiles set balance_cents=balance_cents+added where id=p_user returning balance_cents into balance;
  insert into wallet_ledger(profile_id,amount_cents,reason) values(p_user,added,'credit');
  return balance;
end $$;

create function public.create_demo_ride(p_user uuid, p_origin text, p_destination text)
returns public.rides language plpgsql security definer set search_path = public as $$
declare balance integer; ride public.rides;
begin
  select balance_cents into balance from profiles where id=p_user and role='rider' for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  if balance < 1800 then raise exception 'INSUFFICIENT_DEMO_BALANCE'; end if;
  if exists(select 1 from rides where rider_id=p_user and status in ('pending','accepted','in_progress')) then raise exception 'ACTIVE_RIDE_EXISTS'; end if;
  insert into rides(rider_id,origin,destination,fare_cents) values(p_user,p_origin,p_destination,1800) returning * into ride;
  update profiles set balance_cents=balance_cents-1800 where id=p_user;
  insert into wallet_ledger(profile_id,ride_id,amount_cents,reason) values(p_user,ride.id,-1800,'ride');
  return ride;
end $$;

create function public.transition_demo_ride(p_user uuid, p_ride uuid, p_action text)
returns public.rides language plpgsql security definer set search_path = public as $$
declare ride public.rides; role_name text; next_status text;
begin
  -- Serializa aceites concorrentes do mesmo motorista em corridas diferentes.
  select role into role_name from profiles where id=p_user for update;
  select * into ride from rides where id=p_ride for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_action='accept' and role_name='driver' and ride.status='pending' then
    if exists(select 1 from rides where driver_id=p_user and status in ('accepted','in_progress')) then raise exception 'ACTIVE_RIDE_EXISTS'; end if;
    ride.driver_id := p_user; next_status := 'accepted';
  elsif p_action='start' and ride.driver_id=p_user and ride.status='accepted' then next_status := 'in_progress';
  elsif p_action='complete' and ride.driver_id=p_user and ride.status='in_progress' then next_status := 'completed';
  elsif p_action='cancel' and ride.rider_id=p_user and ride.status in ('pending','accepted') then
    next_status := 'cancelled';
    update profiles set balance_cents=balance_cents+ride.fare_cents where id=ride.rider_id;
    insert into wallet_ledger(profile_id,ride_id,amount_cents,reason) values(ride.rider_id,ride.id,ride.fare_cents,'refund');
  else raise exception 'INVALID_TRANSITION'; end if;
  update rides set status=next_status,driver_id=ride.driver_id,updated_at=now() where id=ride.id returning * into ride;
  return ride;
end $$;
revoke all on function public.consume_rate_limit(text,integer,integer), public.create_demo_profile(text,text,text,text), public.credit_demo_wallet(uuid), public.create_demo_ride(uuid,text,text), public.transition_demo_ride(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text,integer,integer), public.create_demo_profile(text,text,text,text), public.credit_demo_wallet(uuid), public.create_demo_ride(uuid,text,text), public.transition_demo_ride(uuid,uuid,text) to service_role;

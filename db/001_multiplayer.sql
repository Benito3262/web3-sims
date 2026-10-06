-- Web3 Sims multiplayer schema. Private schema `w3s` (not exposed by the REST API);
-- the only entry point is public.w3s_api(secret, op, token, args, ip), called by the Vercel function.
create schema if not exists w3s;
revoke all on schema w3s from public;
do $$ begin
  execute 'revoke all on schema w3s from anon';
  execute 'revoke all on schema w3s from authenticated';
exception when others then null; end $$;

create table if not exists w3s.config (k text primary key, v text not null);
create table if not exists w3s.users (
  id bigserial primary key,
  handle text not null,
  name text not null default '',
  pw_hash text not null,
  profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  signup_ip text,
  banned boolean not null default false
);
create unique index if not exists users_handle_l on w3s.users (lower(handle));
create index if not exists users_seen on w3s.users (last_seen desc);
create table if not exists w3s.sessions (
  token_hash text primary key,
  user_id bigint not null references w3s.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists sessions_user on w3s.sessions (user_id);
create table if not exists w3s.follows (
  follower bigint not null references w3s.users(id) on delete cascade,
  followee bigint not null references w3s.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followee)
);
create index if not exists follows_followee on w3s.follows (followee);
create table if not exists w3s.posts (
  id bigserial primary key,
  user_id bigint not null references w3s.users(id) on delete cascade,
  text text not null,
  kind text not null default 'post',
  paid text,
  sym text,
  reply_to bigint references w3s.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  likes int not null default 0,
  reposts int not null default 0,
  replies int not null default 0,
  hidden boolean not null default false
);
create index if not exists posts_user on w3s.posts (user_id, id desc);
create index if not exists posts_reply on w3s.posts (reply_to, id);
create index if not exists posts_top on w3s.posts (id desc) where reply_to is null;
create table if not exists w3s.likes (user_id bigint not null references w3s.users(id) on delete cascade, post_id bigint not null references w3s.posts(id) on delete cascade, created_at timestamptz not null default now(), primary key (user_id, post_id));
create table if not exists w3s.reposts (user_id bigint not null references w3s.users(id) on delete cascade, post_id bigint not null references w3s.posts(id) on delete cascade, created_at timestamptz not null default now(), primary key (user_id, post_id));
create table if not exists w3s.dms (
  id bigserial primary key,
  from_id bigint not null references w3s.users(id) on delete cascade,
  to_id bigint not null references w3s.users(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists dms_to on w3s.dms (to_id, id);
create index if not exists dms_from on w3s.dms (from_id, id);
create table if not exists w3s.notifs (
  id bigserial primary key,
  user_id bigint not null references w3s.users(id) on delete cascade,
  kind text not null,
  actor_id bigint references w3s.users(id) on delete cascade,
  post_id bigint,
  text text,
  created_at timestamptz not null default now()
);
create index if not exists notifs_user on w3s.notifs (user_id, id);
create table if not exists w3s.blocks (blocker bigint not null references w3s.users(id) on delete cascade, blocked bigint not null references w3s.users(id) on delete cascade, created_at timestamptz not null default now(), primary key (blocker, blocked));
create table if not exists w3s.reports (id bigserial primary key, reporter bigint references w3s.users(id) on delete set null, target bigint references w3s.users(id) on delete cascade, post_id bigint, dm_id bigint, reason text, created_at timestamptz not null default now());
create table if not exists w3s.login_fail (handle_l text not null, ip text, at timestamptz not null default now());
create index if not exists login_fail_h on w3s.login_fail (handle_l, at);

alter table w3s.config enable row level security;
alter table w3s.users enable row level security;
alter table w3s.sessions enable row level security;
alter table w3s.follows enable row level security;
alter table w3s.posts enable row level security;
alter table w3s.likes enable row level security;
alter table w3s.reposts enable row level security;
alter table w3s.dms enable row level security;
alter table w3s.notifs enable row level security;
alter table w3s.blocks enable row level security;
alter table w3s.reports enable row level security;
alter table w3s.login_fail enable row level security;

-- ---------- helpers ----------
create or replace function w3s.clean(t text, maxlen int) returns text language sql immutable as $$
  select left(btrim(regexp_replace(replace(replace(coalesce(t, ''), '<', '‹'), '>', '›'), '[\x01-\x08\x0B-\x1F\x7F]', '', 'g')), maxlen)
$$;
create or replace function w3s.uid(p_token text) returns bigint language plpgsql security definer set search_path = w3s, extensions, pg_temp as $$
declare u bigint;
begin
  if p_token is null or length(p_token) < 20 then return null; end if;
  select s.user_id into u from w3s.sessions s join w3s.users us on us.id = s.user_id
   where s.token_hash = encode(digest(p_token, 'sha256'), 'hex') and s.expires_at > now() and not us.banned;
  if u is not null then update w3s.users set last_seen = now() where id = u and last_seen < now() - interval '10 seconds'; end if;
  return u;
end $$;
create or replace function w3s.blocked_between(a bigint, b bigint) returns boolean language sql stable as $$
  select exists (select 1 from w3s.blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a))
$$;
create or replace function w3s.ujson(u w3s.users, viewer bigint) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', u.id, 'handle', u.handle, 'name', u.name, 'profile', u.profile,
    'online', u.last_seen > now() - interval '90 seconds',
    'last_seen', u.last_seen,
    'followers', (select count(*) from w3s.follows f where f.followee = u.id),
    'following', (select count(*) from w3s.follows f where f.follower = u.id),
    'you_follow', exists (select 1 from w3s.follows f where f.follower = viewer and f.followee = u.id),
    'follows_you', exists (select 1 from w3s.follows f where f.follower = u.id and f.followee = viewer),
    'blocked', exists (select 1 from w3s.blocks b where b.blocker = viewer and b.blocked = u.id),
    'me', u.id = viewer)
$$;
create or replace function w3s.notify(p_user bigint, p_kind text, p_actor bigint, p_post bigint, p_text text) returns void language sql as $$
  insert into w3s.notifs (user_id, kind, actor_id, post_id, text)
  select p_user, p_kind, p_actor, p_post, left(p_text, 160)
  where p_user <> p_actor and not w3s.blocked_between(p_user, p_actor)
$$;
create or replace function w3s.new_session(u bigint) returns text language plpgsql as $$
declare tok text := encode(gen_random_bytes(32), 'hex');
begin
  insert into w3s.sessions (token_hash, user_id, expires_at) values (encode(digest(tok, 'sha256'), 'hex'), u, now() + interval '30 days');
  delete from w3s.sessions where user_id = u and expires_at < now();
  return tok;
end $$;
create or replace function w3s.clean_profile(p jsonb) returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'title', w3s.clean(p->>'title', 40),
    'careers', case when jsonb_typeof(p->'careers') = 'array' then (select coalesce(jsonb_agg(w3s.clean(x, 12)), '[]'::jsonb) from (select jsonb_array_elements_text(p->'careers') x limit 3) c) else null end,
    'followers', case when jsonb_typeof(p->'followers') = 'number' then least(greatest((p->>'followers')::numeric, 0), 1e9) else null end,
    'rep', case when jsonb_typeof(p->'rep') = 'number' then least(greatest((p->>'rep')::numeric, 0), 100) else null end,
    'nw', case when jsonb_typeof(p->'nw') = 'number' then least(greatest((p->>'nw')::numeric, -1e6), 1e9) else null end,
    'day', case when jsonb_typeof(p->'day') = 'number' then least(greatest((p->>'day')::numeric, 0), 1e6) else null end,
    'color', case when (p->>'color') ~ '^#[0-9a-fA-F]{3,8}$' then p->>'color' else null end,
    'hat', w3s.clean(p->>'hat', 12),
    'home', w3s.clean(p->>'home', 30),
    'scene', case when (p->>'scene') ~ '^[a-z0-9_]{1,12}$' then p->>'scene' else null end,
    'x', case when jsonb_typeof(p->'x') = 'number' then least(greatest((p->>'x')::numeric, 0), 60) else null end,
    'y', case when jsonb_typeof(p->'y') = 'number' then least(greatest((p->>'y')::numeric, 0), 60) else null end
  ))
$$;
create or replace function w3s.post_json(p w3s.posts, viewer bigint, nreplies int) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', p.id, 'text', p.text, 'kind', p.kind, 'paid', p.paid, 'sym', p.sym, 'reply_to', p.reply_to,
    'created_at', p.created_at, 'likes', p.likes, 'reposts', p.reposts, 'replies', p.replies,
    'liked', exists (select 1 from w3s.likes l where l.user_id = viewer and l.post_id = p.id),
    'reposted', exists (select 1 from w3s.reposts r where r.user_id = viewer and r.post_id = p.id),
    'author', (select jsonb_build_object('id', u.id, 'handle', u.handle, 'name', u.name, 'title', u.profile->>'title', 'color', u.profile->>'color', 'online', u.last_seen > now() - interval '90 seconds') from w3s.users u where u.id = p.user_id),
    'thread', case when nreplies > 0 then (
      select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'handle', ru.handle, 'name', ru.name, 'text', r.text, 'created_at', r.created_at) order by r.id), '[]'::jsonb)
      from (select * from w3s.posts r2 where r2.reply_to = p.id and not r2.hidden and not w3s.blocked_between(r2.user_id, viewer) order by r2.id desc limit nreplies) r
      join w3s.users ru on ru.id = r.user_id) else '[]'::jsonb end)
$$;

-- ---------- operations ----------
create or replace function w3s.op_signup(a jsonb, p_ip text) returns jsonb language plpgsql as $$
declare h text := btrim(coalesce(a->>'handle', '')); pw text := coalesce(a->>'password', ''); u w3s.users;
begin
  if h !~ '^[A-Za-z0-9_]{3,15}$' then raise exception 'bad_handle'; end if;
  if lower(h) in ('admin', 'root', 'ctsim', 'support', 'mod', 'moderator', 'system', 'web3sims', 'trex_official',
    'wagmi_wendy', 'tunde_dev', 'onchain_oracle', 'chad_alpha', 'moonmktg', 'jpegjimmy', 'degen_dave', 'anon_frog', 'kemi_builds', 'lola_bd', 'zara_nft', 'femi_codes', 'kofi_trades') then raise exception 'handle_reserved'; end if;
  if length(pw) < 6 or length(pw) > 72 then raise exception 'bad_password'; end if;
  if (select count(*) from w3s.users where signup_ip = p_ip and created_at > now() - interval '1 hour') >= 5 then raise exception 'rate_limited'; end if;
  if (select count(*) from w3s.users where created_at > now() - interval '1 minute') >= 30 then raise exception 'rate_limited'; end if;
  if exists (select 1 from w3s.users where lower(handle) = lower(h)) then raise exception 'handle_taken'; end if;
  insert into w3s.users (handle, name, pw_hash, profile, signup_ip)
  values (h, coalesce(nullif(w3s.clean(a->>'name', 30), ''), h), crypt(pw, gen_salt('bf', 10)), w3s.clean_profile(coalesce(a->'profile', '{}'::jsonb)), p_ip)
  returning * into u;
  return jsonb_build_object('ok', true, 'token', w3s.new_session(u.id), 'me', w3s.ujson(u, u.id));
exception when unique_violation then raise exception 'handle_taken';
end $$;

create or replace function w3s.op_login(a jsonb, p_ip text) returns jsonb language plpgsql as $$
declare h text := lower(btrim(coalesce(a->>'handle', ''))); pw text := coalesce(a->>'password', ''); u w3s.users;
begin
  if (select count(*) from w3s.login_fail where handle_l = h and at > now() - interval '10 minutes') >= 8 then raise exception 'too_many_attempts'; end if;
  if (select count(*) from w3s.login_fail where login_fail.ip = p_ip and at > now() - interval '10 minutes') >= 30 then raise exception 'too_many_attempts'; end if;
  select * into u from w3s.users where lower(handle) = h;
  if u.id is null or u.pw_hash <> crypt(pw, u.pw_hash) then
    insert into w3s.login_fail (handle_l, ip) values (h, p_ip);
    return jsonb_build_object('ok', false, 'error', 'bad_login');
  end if;
  if u.banned then raise exception 'banned'; end if;
  update w3s.users set last_seen = now() where id = u.id;
  return jsonb_build_object('ok', true, 'token', w3s.new_session(u.id), 'me', w3s.ujson(u, u.id));
end $$;

create or replace function w3s.op_profile(uid bigint, a jsonb) returns jsonb language plpgsql as $$
declare u w3s.users;
begin
  update w3s.users set profile = profile || w3s.clean_profile(coalesce(a->'profile', '{}'::jsonb)),
    name = coalesce(nullif(w3s.clean(a->>'name', 30), ''), name), last_seen = now()
  where id = uid returning * into u;
  return jsonb_build_object('ok', true, 'me', w3s.ujson(u, uid));
end $$;

create or replace function w3s.find_user(h text) returns bigint language sql stable as $$
  select id from w3s.users where lower(handle) = lower(btrim(coalesce(h, ''))) and not banned
$$;

create or replace function w3s.op_directory(uid bigint, a jsonb) returns jsonb language sql stable as $$
  select jsonb_build_object('ok', true, 'online', (select count(*) from w3s.users where last_seen > now() - interval '90 seconds'),
    'total', (select count(*) from w3s.users where not banned),
    'users', coalesce((select jsonb_agg(w3s.ujson(u, uid) order by (u.last_seen > now() - interval '90 seconds') desc, u.last_seen desc)
      from w3s.users u where u.id in (select u2.id from w3s.users u2 where not u2.banned and (coalesce(a->>'q', '') = '' or u2.handle ilike '%' || replace(replace(a->>'q', '%', ''), '_', '\_') || '%' or u2.name ilike '%' || replace(a->>'q', '%', '') || '%')
            order by (u2.last_seen > now() - interval '90 seconds') desc, u2.last_seen desc limit 60)), '[]'::jsonb))
$$;

create or replace function w3s.op_user(uid bigint, a jsonb) returns jsonb language plpgsql stable as $$
declare t bigint := w3s.find_user(a->>'handle'); u w3s.users;
begin
  if t is null then raise exception 'no_user'; end if;
  select * into u from w3s.users where id = t;
  return jsonb_build_object('ok', true, 'user', w3s.ujson(u, uid),
    'posts', coalesce((select jsonb_agg(w3s.post_json(p, uid, 2) order by p.id desc) from w3s.posts p where p.id in (select p2.id from w3s.posts p2 where p2.user_id = t and p2.reply_to is null and not p2.hidden order by p2.id desc limit 10)), '[]'::jsonb));
end $$;

create or replace function w3s.op_follow(uid bigint, a jsonb) returns jsonb language plpgsql as $$
declare t bigint := w3s.find_user(a->>'handle'); n int;
begin
  if t is null then raise exception 'no_user'; end if;
  if t = uid then raise exception 'self'; end if;
  if coalesce((a->>'on')::boolean, true) then
    if w3s.blocked_between(uid, t) then raise exception 'blocked'; end if;
    insert into w3s.follows (follower, followee) values (uid, t) on conflict do nothing;
    get diagnostics n = row_count;
    if n > 0 then perform w3s.notify(t, 'follow', uid, null, 'followed you'); end if;
  else
    delete from w3s.follows where follower = uid and followee = t;
  end if;
  return jsonb_build_object('ok', true, 'user', (select w3s.ujson(u, uid) from w3s.users u where u.id = t));
end $$;

create or replace function w3s.op_post(uid bigint, a jsonb) returns jsonb language plpgsql as $$
declare txt text := w3s.clean(a->>'text', 280); par w3s.posts; p w3s.posts; m text; mu bigint; k int := 0;
begin
  if length(txt) < 1 then raise exception 'empty'; end if;
  if (select count(*) from w3s.posts where user_id = uid and created_at > now() - interval '1 minute') >= 6 then raise exception 'slow_down'; end if;
  if (select count(*) from w3s.posts where user_id = uid and created_at > now() - interval '1 day') >= 400 then raise exception 'slow_down'; end if;
  if (a->>'reply_to') is not null then
    select * into par from w3s.posts where id = (a->>'reply_to')::bigint and not hidden;
    if par.id is null then raise exception 'no_post'; end if;
    if w3s.blocked_between(uid, par.user_id) then raise exception 'blocked'; end if;
  end if;
  insert into w3s.posts (user_id, text, kind, paid, sym, reply_to)
  values (uid, txt, coalesce(nullif(w3s.clean(a->>'kind', 16), ''), 'post'), nullif(w3s.clean(a->>'paid', 40), ''), nullif(w3s.clean(a->>'sym', 12), ''), par.id)
  returning * into p;
  if par.id is not null then
    update w3s.posts set replies = replies + 1 where id = par.id;
    perform w3s.notify(par.user_id, 'reply', uid, par.id, txt);
  end if;
  for m in select distinct (regexp_matches(txt, '@([A-Za-z0-9_]{3,15})', 'g'))[1] loop
    k := k + 1; exit when k > 5;
    mu := w3s.find_user(m);
    if mu is not null and mu <> coalesce(par.user_id, -1) then perform w3s.notify(mu, 'mention', uid, p.id, txt); end if;
  end loop;
  return jsonb_build_object('ok', true, 'post', w3s.post_json(p, uid, 0));
end $$;

create or replace function w3s.op_feed(uid bigint, a jsonb) returns jsonb language sql stable as $$
  select jsonb_build_object('ok', true, 'posts', coalesce((
    select jsonb_agg(w3s.post_json(p, uid, 3) order by p.id desc) from w3s.posts p where p.id in (
      select p.id from w3s.posts p
      where p.reply_to is null and not p.hidden
        and (coalesce((a->>'all')::boolean, false) or p.user_id = uid or p.user_id in (select followee from w3s.follows where follower = uid))
        and not w3s.blocked_between(p.user_id, uid)
        and ((a->>'before') is null or p.id < (a->>'before')::bigint)
        and ((a->>'ids') is null or p.id in (select jsonb_array_elements_text(a->'ids')::bigint))
      order by p.id desc limit least(coalesce((a->>'limit')::int, 40), 60))), '[]'::jsonb))
$$;

create or replace function w3s.op_like(uid bigint, a jsonb) returns jsonb language plpgsql as $$
declare p w3s.posts; n int;
begin
  select * into p from w3s.posts where id = (a->>'id')::bigint and not hidden;
  if p.id is null then raise exception 'no_post'; end if;
  if coalesce((a->>'on')::boolean, true) then
    insert into w3s.likes (user_id, post_id) values (uid, p.id) on conflict do nothing; get diagnostics n = row_count;
    if n > 0 then update w3s.posts set likes = likes + 1 where id = p.id returning * into p; perform w3s.notify(p.user_id, 'like', uid, p.id, left(p.text, 80)); end if;
  else
    delete from w3s.likes where user_id = uid and post_id = p.id; get diagnostics n = row_count;
    if n > 0 then update w3s.posts set likes = greatest(likes - 1, 0) where id = p.id returning * into p; end if;
  end if;
  return jsonb_build_object('ok', true, 'post', w3s.post_json(p, uid, 0));
end $$;

create or replace function w3s.op_repost(uid bigint, a jsonb) returns jsonb language plpgsql as $$
declare p w3s.posts; n int;
begin
  select * into p from w3s.posts where id = (a->>'id')::bigint and not hidden;
  if p.id is null then raise exception 'no_post'; end if;
  if coalesce((a->>'on')::boolean, true) then
    insert into w3s.reposts (user_id, post_id) values (uid, p.id) on conflict do nothing; get diagnostics n = row_count;
    if n > 0 then update w3s.posts set reposts = reposts + 1 where id = p.id returning * into p; perform w3s.notify(p.user_id, 'repost', uid, p.id, left(p.text, 80)); end if;
  else
    delete from w3s.reposts where user_id = uid and post_id = p.id; get diagnostics n = row_count;
    if n > 0 then update w3s.posts set reposts = greatest(reposts - 1, 0) where id = p.id returning * into p; end if;
  end if;
  return jsonb_build_object('ok', true, 'post', w3s.post_json(p, uid, 0));
end $$;

create or replace function w3s.dm_json(d w3s.dms) returns jsonb language sql stable as $$
  select jsonb_build_object('id', d.id, 'from', (select handle from w3s.users where id = d.from_id), 'to', (select handle from w3s.users where id = d.to_id), 'text', d.text, 'created_at', d.created_at, 'read', d.read_at is not null)
$$;

create or replace function w3s.op_dm_send(uid bigint, a jsonb) returns jsonb language plpgsql as $$
declare t bigint := w3s.find_user(a->>'handle'); txt text := w3s.clean(a->>'text', 500); d w3s.dms;
begin
  if t is null then raise exception 'no_user'; end if;
  if t = uid then raise exception 'self'; end if;
  if length(txt) < 1 then raise exception 'empty'; end if;
  if w3s.blocked_between(uid, t) then raise exception 'blocked'; end if;
  if (select count(*) from w3s.dms where from_id = uid and created_at > now() - interval '1 minute') >= 20 then raise exception 'slow_down'; end if;
  if (select count(*) from w3s.dms where from_id = uid and created_at > now() - interval '1 day') >= 1000 then raise exception 'slow_down'; end if;
  insert into w3s.dms (from_id, to_id, text) values (uid, t, txt) returning * into d;
  return jsonb_build_object('ok', true, 'dm', w3s.dm_json(d));
end $$;

create or replace function w3s.op_dm_thread(uid bigint, a jsonb) returns jsonb language plpgsql as $$
declare t bigint := w3s.find_user(a->>'handle');
begin
  if t is null then raise exception 'no_user'; end if;
  update w3s.dms set read_at = now() where to_id = uid and from_id = t and read_at is null;
  return jsonb_build_object('ok', true, 'user', (select w3s.ujson(u, uid) from w3s.users u where u.id = t), 'dms', coalesce((
    select jsonb_agg(w3s.dm_json(d) order by d.id) from w3s.dms d where d.id in (
      select d2.id from w3s.dms d2 where ((d2.from_id = uid and d2.to_id = t) or (d2.from_id = t and d2.to_id = uid))
        and ((a->>'after') is null or d2.id > (a->>'after')::bigint)
      order by d2.id desc limit 100)), '[]'::jsonb));
end $$;

create or replace function w3s.op_dm_threads(uid bigint) returns jsonb language sql stable as $$
  select jsonb_build_object('ok', true, 'threads', coalesce((
    select jsonb_agg(x order by (x->>'last_id')::bigint desc) from (
      select jsonb_build_object('handle', u.handle, 'name', u.name, 'online', u.last_seen > now() - interval '90 seconds',
        'last_id', m.id, 'last', m.text, 'last_from_me', m.from_id = uid, 'created_at', m.created_at,
        'unread', (select count(*) from w3s.dms d2 where d2.to_id = uid and d2.from_id = u.id and d2.read_at is null)) x
      from (select distinct on (other) id, other, text, from_id, created_at from (
              select d.*, case when d.from_id = uid then d.to_id else d.from_id end other from w3s.dms d where d.from_id = uid or d.to_id = uid) z
            order by other, id desc) m
      join w3s.users u on u.id = m.other
      where not w3s.blocked_between(uid, u.id)
      limit 50) q), '[]'::jsonb))
$$;

create or replace function w3s.op_poll(uid bigint, a jsonb) returns jsonb language plpgsql as $$
declare sn bigint := coalesce((a->>'since_notif')::bigint, 0); sd bigint := coalesce((a->>'since_dm')::bigint, 0); me w3s.users;
begin
  if a ? 'presence' then
    update w3s.users set profile = profile || w3s.clean_profile(a->'presence'), last_seen = now() where id = uid;
  end if;
  select * into me from w3s.users where id = uid;
  return jsonb_build_object('ok', true,
    'me', w3s.ujson(me, uid),
    'notifs', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'post_id', n.post_id, 'text', n.text, 'created_at', n.created_at, 'from', u.handle) order by n.id)
       from (select * from w3s.notifs n where n.user_id = uid and n.id > sn order by n.id desc limit 30) n left join w3s.users u on u.id = n.actor_id), '[]'::jsonb),
    'max_notif', coalesce((select max(id) from w3s.notifs where user_id = uid), 0),
    'dms', coalesce((select jsonb_agg(w3s.dm_json(d) order by d.id) from w3s.dms d where d.id in (select d2.id from w3s.dms d2 where d2.to_id = uid and d2.id > sd and not w3s.blocked_between(uid, d2.from_id) order by d2.id desc limit 50)), '[]'::jsonb),
    'max_dm', coalesce((select max(id) from w3s.dms where to_id = uid), 0),
    'unread_dms', (select count(*) from w3s.dms d where d.to_id = uid and d.read_at is null and not w3s.blocked_between(uid, d.from_id)),
    'online_count', (select count(*) from w3s.users where last_seen > now() - interval '90 seconds'),
    'online', coalesce((select jsonb_agg(jsonb_build_object('handle', u.handle, 'name', u.name, 'scene', u.profile->>'scene', 'x', u.profile->'x', 'y', u.profile->'y', 'color', u.profile->>'color', 'hat', u.profile->>'hat', 'title', u.profile->>'title'))
       from (select * from w3s.users u where u.id <> uid and not u.banned and u.last_seen > now() - interval '90 seconds' and not w3s.blocked_between(uid, u.id) order by u.last_seen desc limit 40) u), '[]'::jsonb));
end $$;

create or replace function w3s.op_block(uid bigint, a jsonb) returns jsonb language plpgsql as $$
declare t bigint := w3s.find_user(a->>'handle');
begin
  if t is null then raise exception 'no_user'; end if;
  if t = uid then raise exception 'self'; end if;
  if coalesce((a->>'on')::boolean, true) then
    insert into w3s.blocks (blocker, blocked) values (uid, t) on conflict do nothing;
    delete from w3s.follows where (follower = uid and followee = t) or (follower = t and followee = uid);
  else
    delete from w3s.blocks where blocker = uid and blocked = t;
  end if;
  return jsonb_build_object('ok', true, 'user', (select w3s.ujson(u, uid) from w3s.users u where u.id = t));
end $$;

create or replace function w3s.op_report(uid bigint, a jsonb) returns jsonb language plpgsql as $$
declare t bigint := w3s.find_user(a->>'handle'); pid bigint := (a->>'post_id')::bigint; n int;
begin
  if t is null and pid is null then raise exception 'no_user'; end if;
  if (select count(*) from w3s.reports where reporter = uid and created_at > now() - interval '1 hour') >= 20 then raise exception 'slow_down'; end if;
  if t is null then select user_id into t from w3s.posts where id = pid; end if;
  insert into w3s.reports (reporter, target, post_id, dm_id, reason) values (uid, t, pid, (a->>'dm_id')::bigint, w3s.clean(a->>'reason', 200));
  if pid is not null then
    select count(distinct reporter) into n from w3s.reports where post_id = pid;
    if n >= 3 then update w3s.posts set hidden = true where id = pid; end if;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- single public entry point ----------
create or replace function public.w3s_api(p_secret text, p_op text, p_token text default null, p_args jsonb default '{}'::jsonb, p_ip text default '')
returns jsonb language plpgsql security definer set search_path = w3s, extensions, pg_temp as $$
declare uid bigint; a jsonb := coalesce(p_args, '{}'::jsonb);
begin
  if p_secret is null or p_secret <> coalesce((select v from w3s.config where k = 'api_secret'), '') then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if length(a::text) > 8000 then return jsonb_build_object('ok', false, 'error', 'too_big'); end if;
  begin
    if p_op = 'signup' then return w3s.op_signup(a, left(coalesce(p_ip, ''), 64)); end if;
    if p_op = 'login' then return w3s.op_login(a, left(coalesce(p_ip, ''), 64)); end if;
    if p_op = 'handle_free' then return jsonb_build_object('ok', true, 'free', w3s.find_user(a->>'handle') is null and coalesce(a->>'handle', '') ~ '^[A-Za-z0-9_]{3,15}$'); end if;
    if p_op = 'stats' then return jsonb_build_object('ok', true, 'online', (select count(*) from w3s.users where last_seen > now() - interval '90 seconds'), 'total', (select count(*) from w3s.users)); end if;
    uid := w3s.uid(p_token);
    if uid is null then return jsonb_build_object('ok', false, 'error', 'auth'); end if;
    case p_op
      when 'logout' then delete from w3s.sessions where token_hash = encode(digest(p_token, 'sha256'), 'hex'); return jsonb_build_object('ok', true);
      when 'me' then return jsonb_build_object('ok', true, 'me', (select w3s.ujson(u, uid) from w3s.users u where u.id = uid));
      when 'profile' then return w3s.op_profile(uid, a);
      when 'directory' then return w3s.op_directory(uid, a);
      when 'user' then return w3s.op_user(uid, a);
      when 'follow' then return w3s.op_follow(uid, a);
      when 'post' then return w3s.op_post(uid, a);
      when 'feed' then return w3s.op_feed(uid, a);
      when 'like' then return w3s.op_like(uid, a);
      when 'repost' then return w3s.op_repost(uid, a);
      when 'dm_send' then return w3s.op_dm_send(uid, a);
      when 'dm_thread' then return w3s.op_dm_thread(uid, a);
      when 'dm_threads' then return w3s.op_dm_threads(uid);
      when 'poll' then return w3s.op_poll(uid, a);
      when 'block' then return w3s.op_block(uid, a);
      when 'report' then return w3s.op_report(uid, a);
      else return jsonb_build_object('ok', false, 'error', 'bad_op');
    end case;
  exception when others then
    return jsonb_build_object('ok', false, 'error', case when SQLSTATE = 'P0001' then SQLERRM else 'server_error' end);
  end;
end $$;

revoke all on function public.w3s_api(text, text, text, jsonb, text) from public;
do $$ begin execute 'revoke all on function public.w3s_api(text, text, text, jsonb, text) from authenticated'; exception when others then null; end $$;
grant execute on function public.w3s_api(text, text, text, jsonb, text) to anon;

revoke all on all functions in schema w3s from public;
do $$ begin execute 'revoke all on all functions in schema w3s from anon'; execute 'revoke all on all functions in schema w3s from authenticated'; exception when others then null; end $$;

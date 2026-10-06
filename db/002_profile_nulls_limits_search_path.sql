-- Applied after 001: profile fields dropped when empty, signup limit 10/IP/hour,
-- and search_path pinned on every w3s function (Supabase advisor fix).

CREATE OR REPLACE FUNCTION w3s.clean_profile(p jsonb)
 RETURNS jsonb LANGUAGE sql IMMUTABLE
AS $function$
  select jsonb_strip_nulls(jsonb_build_object(
    'title', nullif(w3s.clean(p->>'title', 40), ''),
    'careers', case when jsonb_typeof(p->'careers') = 'array' then (select coalesce(jsonb_agg(w3s.clean(x, 12)), '[]'::jsonb) from (select jsonb_array_elements_text(p->'careers') x limit 3) c) else null end,
    'followers', case when jsonb_typeof(p->'followers') = 'number' then least(greatest((p->>'followers')::numeric, 0), 1e9) else null end,
    'rep', case when jsonb_typeof(p->'rep') = 'number' then least(greatest((p->>'rep')::numeric, 0), 100) else null end,
    'nw', case when jsonb_typeof(p->'nw') = 'number' then least(greatest((p->>'nw')::numeric, -1e6), 1e9) else null end,
    'day', case when jsonb_typeof(p->'day') = 'number' then least(greatest((p->>'day')::numeric, 0), 1e6) else null end,
    'color', case when (p->>'color') ~ '^#[0-9a-fA-F]{3,8}$' then p->>'color' else null end,
    'hat', nullif(w3s.clean(p->>'hat', 12), ''),
    'home', nullif(w3s.clean(p->>'home', 30), ''),
    'scene', case when (p->>'scene') ~ '^[a-z0-9_]{1,12}$' then p->>'scene' else null end,
    'x', case when jsonb_typeof(p->'x') = 'number' then least(greatest((p->>'x')::numeric, 0), 60) else null end,
    'y', case when jsonb_typeof(p->'y') = 'number' then least(greatest((p->>'y')::numeric, 0), 60) else null end
  ))
$function$;

CREATE OR REPLACE FUNCTION w3s.op_signup(a jsonb, p_ip text)
 RETURNS jsonb LANGUAGE plpgsql
AS $function$
declare h text := btrim(coalesce(a->>'handle', '')); pw text := coalesce(a->>'password', ''); u w3s.users;
begin
  if h !~ '^[A-Za-z0-9_]{3,15}$' then raise exception 'bad_handle'; end if;
  if lower(h) in ('admin', 'root', 'ctsim', 'support', 'mod', 'moderator', 'system', 'web3sims', 'trex_official',
    'wagmi_wendy', 'tunde_dev', 'onchain_oracle', 'chad_alpha', 'moonmktg', 'jpegjimmy', 'degen_dave', 'anon_frog', 'kemi_builds', 'lola_bd', 'zara_nft', 'femi_codes', 'kofi_trades') then raise exception 'handle_reserved'; end if;
  if length(pw) < 6 or length(pw) > 72 then raise exception 'bad_password'; end if;
  if (select count(*) from w3s.users where signup_ip = p_ip and created_at > now() - interval '1 hour') >= 10 then raise exception 'rate_limited'; end if;
  if (select count(*) from w3s.users where created_at > now() - interval '1 minute') >= 30 then raise exception 'rate_limited'; end if;
  if exists (select 1 from w3s.users where lower(handle) = lower(h)) then raise exception 'handle_taken'; end if;
  insert into w3s.users (handle, name, pw_hash, profile, signup_ip)
  values (h, coalesce(nullif(w3s.clean(a->>'name', 30), ''), h), crypt(pw, gen_salt('bf', 10)), w3s.clean_profile(coalesce(a->'profile', '{}'::jsonb)), p_ip)
  returning * into u;
  return jsonb_build_object('ok', true, 'token', w3s.new_session(u.id), 'me', w3s.ujson(u, u.id));
exception when unique_violation then raise exception 'handle_taken';
end $function$;

-- Pin search_path on all w3s functions and the public entry point.
DO $$
declare r record;
begin
  for r in select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'w3s' or (n.nspname = 'public' and p.proname = 'w3s_api') loop
    execute format('alter function %s set search_path = w3s, extensions, pg_temp', r.f);
  end loop;
end $$;

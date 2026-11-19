begin;
create schema if not exists sidequest_private;
revoke all on schema sidequest_private from public, anon, authenticated;
grant usage on schema sidequest_private to authenticated;
create table if not exists public.sidequest_members (
 user_id uuid primary key references auth.users(id) on delete cascade
);
create table if not exists public.sidequest_boards (
 user_id uuid primary key references auth.users(id) on delete cascade,
 payload jsonb not null check (jsonb_typeof(payload)='object' and octet_length(payload::text)<=8000000),
 revision bigint not null check (revision>0),
 updated_at timestamptz not null default now()
);
alter table public.sidequest_members enable row level security;
alter table public.sidequest_boards enable row level security;
revoke all on public.sidequest_members, public.sidequest_boards from public, anon, authenticated;
grant select on public.sidequest_members to authenticated;
drop policy if exists member_self on public.sidequest_members;
create policy member_self on public.sidequest_members for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists deny_direct_board_access on public.sidequest_boards;
create policy deny_direct_board_access on public.sidequest_boards as restrictive for all to anon, authenticated using (false) with check (false);
-- Board reads/writes are only exposed through these functions. No direct table grants.
create or replace function sidequest_private.sidequest_read() returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid(); saved_row public.sidequest_boards;
begin
 if uid is null or not exists(select 1 from public.sidequest_members where user_id=uid) then
  raise insufficient_privilege using message='Sidequest membership required';
 end if;
 select * into saved_row from public.sidequest_boards where user_id=uid;
 if not found then return jsonb_build_object('data',null,'revision',0); end if;
 return jsonb_build_object('data',saved_row.payload,'revision',saved_row.revision);
end $$;
create or replace function sidequest_private.sidequest_save(expected_revision bigint, board jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid(); next_revision bigint;
begin
 if uid is null or not exists(select 1 from public.sidequest_members where user_id=uid) then
  raise insufficient_privilege using message='Sidequest membership required';
 end if;
 if expected_revision is null or expected_revision<0 or expected_revision>=9007199254740991 or board is null
 or jsonb_typeof(board) is distinct from 'object' or octet_length(board::text)>8000000
 or jsonb_typeof(board->'tasks') is distinct from 'array'
 or jsonb_typeof(board->'ideas') is distinct from 'array'
 or jsonb_typeof(board->'movies') is distinct from 'array'
 or jsonb_typeof(board->'settings') is distinct from 'object' then
  raise invalid_parameter_value using message='Invalid board';
 end if;
 board := board #- '{settings,tmdbKey}';
 if expected_revision=0 then
  insert into public.sidequest_boards(user_id,payload,revision) values(uid,board,1)
  on conflict(user_id) do nothing returning revision into next_revision;
 else
  update public.sidequest_boards set payload=board,revision=revision+1,updated_at=now()
  where user_id=uid and revision=expected_revision returning revision into next_revision;
 end if;
 if next_revision is null then return jsonb_build_object('conflict',true); end if;
 return jsonb_build_object('revision',next_revision);
end $$;
revoke all on function sidequest_private.sidequest_read() from public,anon,authenticated;
revoke all on function sidequest_private.sidequest_save(bigint,jsonb) from public,anon,authenticated;
grant execute on function sidequest_private.sidequest_read() to authenticated;
grant execute on function sidequest_private.sidequest_save(bigint,jsonb) to authenticated;
create or replace function public.sidequest_read() returns jsonb
language sql security invoker set search_path='' as $$ select sidequest_private.sidequest_read() $$;
create or replace function public.sidequest_save(expected_revision bigint, board jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select sidequest_private.sidequest_save(expected_revision,board) $$;
revoke all on function public.sidequest_read(),public.sidequest_save(bigint,jsonb) from public,anon,authenticated;
grant execute on function public.sidequest_read(),public.sidequest_save(bigint,jsonb) to authenticated;
commit;

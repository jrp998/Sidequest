-- Run only after 001. All fixture data is rolled back, including on an error.
begin;
insert into auth.users(id,email) values
 ('11111111-1111-4111-8111-111111111111','sidequest-test-one@example.invalid'),
 ('22222222-2222-4222-8222-222222222222','sidequest-test-two@example.invalid'),
 ('33333333-3333-4333-8333-333333333333','sidequest-test-nonmember@example.invalid');
insert into public.sidequest_members(user_id) values
 ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$
declare b jsonb := '{"tasks":[],"ideas":[],"movies":[],"settings":{}}'; r jsonb;
begin
 r:=public.sidequest_read(); if (r->>'revision')::int<>0 then raise exception 'Expected empty board'; end if;
 r:=public.sidequest_save(0,b); if (r->>'revision')::int<>1 then raise exception 'Initial save failed'; end if;
 r:=public.sidequest_save(0,b); if r->>'conflict'<>'true' then raise exception 'Stale create accepted'; end if;
 r:=public.sidequest_save(1,b); if (r->>'revision')::int<>2 then raise exception 'Update failed'; end if;
 r:=public.sidequest_save(1,b); if r->>'conflict'<>'true' then raise exception 'Stale update accepted'; end if;
 begin
  perform * from public.sidequest_boards;
  raise exception 'Direct board access allowed';
 exception when insufficient_privilege then null; end;
 if (select count(*) from public.sidequest_members)<>1 then raise exception 'Membership isolation failed'; end if;
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ begin
 if (public.sidequest_read()->>'revision')::int<>0 then raise exception 'Cross-account data leak'; end if;
end $$;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
do $$ begin
 begin perform public.sidequest_read(); raise exception 'Nonmember read allowed'; exception when insufficient_privilege then null; end;
 begin perform public.sidequest_save(0,'{"tasks":[],"ideas":[],"movies":[],"settings":{}}'); raise exception 'Nonmember write allowed'; exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
 begin perform public.sidequest_read(); raise exception 'Anonymous read allowed'; exception when insufficient_privilege then null; end;
 begin perform public.sidequest_save(0,'{"tasks":[],"ideas":[],"movies":[],"settings":{}}'); raise exception 'Anonymous write allowed'; exception when insufficient_privilege then null; end;
end $$;
rollback;

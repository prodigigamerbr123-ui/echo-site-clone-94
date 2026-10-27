-- Execute only in the isolated restored database. All fixtures roll back.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF has_table_privilege('authenticated','public.evaluations','INSERT') OR
    has_table_privilege('authenticated','public.evaluations','DELETE') OR
    has_column_privilege('authenticated','public.evaluations','status','UPDATE') OR
    has_column_privilege('authenticated','public.students','last_evaluation_date','UPDATE') THEN
   RAISE EXCEPTION 'Restricted writes still granted';
 END IF;
 IF NOT has_column_privilege('authenticated','public.evaluations','notes','UPDATE') THEN
   RAISE EXCEPTION 'Notes permission missing';
 END IF;
 IF has_function_privilege('authenticated','public.mutate_evaluation_internal_tx(text,uuid,uuid,timestamptz,text,jsonb,boolean)','EXECUTE') THEN
   RAISE EXCEPTION 'Internal RPC exposed';
 END IF;
END $$;
SELECT set_config('request.jwt.claim.sub',user_id::text,true),
 set_config('request.jwt.claim.role','authenticated',true),
 set_config('request.jwt.claims',json_build_object('sub',user_id,'role','authenticated')::text,true)
FROM public.staff_members WHERE role='admin' AND active \gset
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF public.current_staff_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Admin role missing'; END IF;
END $$;
INSERT INTO public.students(id,name,phone) VALUES ('00000000-0000-4000-8000-000000000090','Staging security fixture','43999999999');
SELECT public.mutate_evaluation_tx('create','00000000-0000-4000-8000-000000000091','00000000-0000-4000-8000-000000000090',now()+interval '90 days','Staging','[]'::jsonb,true) IS NOT NULL AS create_ok;
SELECT public.mutate_evaluation_tx('cancel','00000000-0000-4000-8000-000000000091') IS NOT NULL AS cancel_ok;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM evaluations WHERE id='00000000-0000-4000-8000-000000000091' AND status='cancelled') THEN RAISE EXCEPTION 'Cancel failed'; END IF;
 BEGIN
   UPDATE public.students SET last_evaluation_date=current_date WHERE id='00000000-0000-4000-8000-000000000090';
   RAISE EXCEPTION 'Unauthorized summary update succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000099',true),set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000099","role":"authenticated"}',true) \gset
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.students) THEN RAISE EXCEPTION 'Unassigned user can read students'; END IF;
 BEGIN
   PERFORM public.mutate_evaluation_tx('cancel','00000000-0000-4000-8000-000000000091');
   RAISE EXCEPTION 'Unassigned user can mutate evaluations';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'STAGING_SECURITY_CHECKS_OK' AS result;

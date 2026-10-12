BEGIN;

-- Staff assignments are managed by administrators; a login alone grants no data access.
CREATE TABLE public.staff_members (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'recepcao', 'avaliador')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER staff_members_updated_at BEFORE UPDATE ON public.staff_members
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_members FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_members TO authenticated;
GRANT ALL ON public.staff_members TO service_role;

-- SECURITY DEFINER only resolves the caller's own role. Never accepts a user id.
CREATE FUNCTION public.current_staff_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT role FROM public.staff_members
  WHERE user_id = (SELECT auth.uid()) AND active = true
$$;
REVOKE ALL ON FUNCTION public.current_staff_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_staff_role() TO authenticated, service_role;

CREATE FUNCTION public.has_staff_role(_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE((SELECT role = ANY(_roles) FROM public.staff_members
    WHERE user_id = (SELECT auth.uid()) AND active = true), false)
$$;
REVOKE ALL ON FUNCTION public.has_staff_role(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_staff_role(text[]) TO authenticated, service_role;

CREATE POLICY staff_read_self_or_admin ON public.staff_members FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) OR (SELECT public.has_staff_role(ARRAY['admin'])));
CREATE POLICY staff_insert_admin ON public.staff_members FOR INSERT TO authenticated
WITH CHECK ((SELECT public.has_staff_role(ARRAY['admin'])));
CREATE POLICY staff_update_admin ON public.staff_members FOR UPDATE TO authenticated
USING ((SELECT public.has_staff_role(ARRAY['admin']))) WITH CHECK ((SELECT public.has_staff_role(ARRAY['admin'])));
CREATE POLICY staff_delete_admin ON public.staff_members FOR DELETE TO authenticated
USING ((SELECT public.has_staff_role(ARRAY['admin'])));

-- Never allow removal or demotion of the final active administrator.
CREATE FUNCTION public.guard_last_active_admin()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.role = 'admin' AND OLD.active AND
    (TG_OP = 'DELETE' OR NEW.role <> 'admin' OR NOT NEW.active) THEN
    PERFORM pg_advisory_xact_lock(hashtext('workout:staff-administrator'));
    IF NOT EXISTS (SELECT 1 FROM public.staff_members
      WHERE user_id <> OLD.user_id AND role = 'admin' AND active) THEN
      RAISE EXCEPTION 'Não é possível remover o último administrador ativo'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_last_active_admin BEFORE UPDATE OR DELETE ON public.staff_members
FOR EACH ROW EXECUTE FUNCTION public.guard_last_active_admin();

-- Bootstrap exclusively the already-existing account; abort if missing/ambiguous.
DO $$
DECLARE _admin_id uuid; _count integer;
BEGIN
  SELECT count(*), (array_agg(id))[1] INTO _count, _admin_id FROM auth.users
  WHERE lower(email) = 'admin@admin.com';
  IF _count <> 1 THEN
    RAISE EXCEPTION 'Admin bootstrap cancelled: expected exactly one existing admin account, found %', _count;
  END IF;
  INSERT INTO public.staff_members(user_id, role) VALUES (_admin_id, 'admin');
END $$;

-- Old conversations had no owner. Attribute them to the existing administrator.
ALTER TABLE public.ai_conversations ADD COLUMN owner_id uuid REFERENCES auth.users(id);
UPDATE public.ai_conversations SET owner_id = (
  SELECT user_id FROM public.staff_members WHERE role = 'admin' LIMIT 1
);
ALTER TABLE public.ai_conversations ALTER COLUMN owner_id SET DEFAULT auth.uid();
ALTER TABLE public.ai_conversations ALTER COLUMN owner_id SET NOT NULL;
CREATE INDEX idx_ai_conversations_owner ON public.ai_conversations(owner_id, updated_at DESC);

-- Remove ALL legacy permissive policies before installing a role matrix.
DO $$
DECLARE _table text; _policy record;
BEGIN
  FOREACH _table IN ARRAY ARRAY[
    'students','evaluations','messages','scheduled_messages','predefined_messages',
    'automation_settings','app_settings','ai_conversations','ai_messages'
  ] LOOP
    FOR _policy IN SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = _table LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', _policy.policyname, _table);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', _table);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', _table);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', _table);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', _table);
  END LOOP;
END $$;

-- All staff can see the student directory and evaluation schedule.
CREATE POLICY students_read ON public.students FOR SELECT TO authenticated
USING ((SELECT public.has_staff_role(ARRAY['admin','recepcao','avaliador'])));
CREATE POLICY students_create ON public.students FOR INSERT TO authenticated
WITH CHECK ((SELECT public.has_staff_role(ARRAY['admin','recepcao'])));
CREATE POLICY students_edit ON public.students FOR UPDATE TO authenticated
USING ((SELECT public.has_staff_role(ARRAY['admin','recepcao'])))
WITH CHECK ((SELECT public.has_staff_role(ARRAY['admin','recepcao'])));
CREATE POLICY students_delete ON public.students FOR DELETE TO authenticated
USING ((SELECT public.has_staff_role(ARRAY['admin'])));

-- Evaluation summary fields are maintained by the transactional RPC, not by
-- arbitrary REST updates. Future optional student fields remain editable.
REVOKE UPDATE ON public.students FROM authenticated;
DO $$
DECLARE _columns text;
BEGIN
  SELECT string_agg(format('%I', attname), ',') INTO _columns
  FROM pg_attribute
  WHERE attrelid = 'public.students'::regclass AND attnum > 0 AND NOT attisdropped
    AND attname NOT IN ('id','had_evaluation','last_evaluation_date','created_at','updated_at');
  EXECUTE 'GRANT UPDATE (' || _columns || ') ON public.students TO authenticated';
END $$;

CREATE POLICY evaluations_read ON public.evaluations FOR SELECT TO authenticated
USING ((SELECT public.has_staff_role(ARRAY['admin','recepcao','avaliador'])));
-- REST clients may edit notes, but appointment changes must go through the
-- atomic RPC so scheduling conflicts, reminders and student summaries agree.
REVOKE ALL ON public.evaluations FROM authenticated;
GRANT SELECT, UPDATE (notes) ON public.evaluations TO authenticated;
CREATE POLICY evaluations_edit ON public.evaluations FOR UPDATE TO authenticated
USING ((SELECT public.has_staff_role(ARRAY['admin','recepcao','avaliador'])))
WITH CHECK ((SELECT public.has_staff_role(ARRAY['admin','recepcao','avaliador'])));

CREATE POLICY messages_read ON public.messages FOR SELECT TO authenticated
USING ((SELECT public.has_staff_role(ARRAY['admin','recepcao'])));
-- Delivery history is written only by the privileged queue worker.

CREATE POLICY queue_read ON public.scheduled_messages FOR SELECT TO authenticated
USING ((SELECT public.has_staff_role(ARRAY['admin','recepcao'])) OR
  ((SELECT public.has_staff_role(ARRAY['avaliador'])) AND evaluation_id IS NOT NULL));
CREATE POLICY queue_create ON public.scheduled_messages FOR INSERT TO authenticated
WITH CHECK ((SELECT public.has_staff_role(ARRAY['admin','recepcao'])) OR
  ((SELECT public.has_staff_role(ARRAY['avaliador'])) AND evaluation_id IS NOT NULL AND
   message_type IN ('evaluation_confirmation','evaluation_reminder_1d','evaluation_reminder_day',
                    'evaluation_followup','evaluation_reschedule')));
CREATE POLICY queue_edit ON public.scheduled_messages FOR UPDATE TO authenticated
USING ((SELECT public.has_staff_role(ARRAY['admin','recepcao'])) OR
  ((SELECT public.has_staff_role(ARRAY['avaliador'])) AND evaluation_id IS NOT NULL))
WITH CHECK ((SELECT public.has_staff_role(ARRAY['admin','recepcao'])) OR
  ((SELECT public.has_staff_role(ARRAY['avaliador'])) AND evaluation_id IS NOT NULL AND
   message_type IN ('evaluation_confirmation','evaluation_reminder_1d','evaluation_reminder_day',
                    'evaluation_followup','evaluation_reschedule')));
CREATE POLICY queue_delete ON public.scheduled_messages FOR DELETE TO authenticated
USING ((SELECT public.has_staff_role(ARRAY['admin'])));

-- Interactive users may enqueue, reschedule, retry or cancel, but cannot forge
-- delivered/processing states or worker timestamps via the REST API.
CREATE FUNCTION public.guard_interactive_queue_state()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF auth.role() <> 'authenticated' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' OR NEW.sent_at IS NOT NULL OR
       NEW.dispatch_started_at IS NOT NULL OR NEW.retry_count <> 0 OR
       NEW.failure_reason IS NOT NULL THEN
      RAISE EXCEPTION 'Estado inicial de mensagem inválido' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF OLD.status NOT IN ('pending','failed','processing') OR
       NEW.status NOT IN ('pending','cancelled') OR
       (OLD.status = 'processing' AND NEW.status <> 'cancelled') OR
       NEW.dispatch_started_at IS DISTINCT FROM OLD.dispatch_started_at OR
       NEW.sent_at IS DISTINCT FROM OLD.sent_at OR
       NEW.retry_count NOT IN (0, OLD.retry_count) THEN
      RAISE EXCEPTION 'Apenas a fila de envio pode confirmar entregas' USING ERRCODE = '42501';
    END IF;
    -- Editing/retrying a message must never rewrite its origin or bypass the
    -- worker's expiry and source checks. The UI may change the recipient only
    -- for a manual message that has no evaluation attached.
    IF NEW.id IS DISTINCT FROM OLD.id OR
       NEW.created_at IS DISTINCT FROM OLD.created_at OR
       NEW.message_type IS DISTINCT FROM OLD.message_type OR
       NEW.evaluation_id IS DISTINCT FROM OLD.evaluation_id OR
       (OLD.evaluation_id IS NOT NULL AND NEW.student_id IS DISTINCT FROM OLD.student_id) OR
       NEW.recurrence_parent_id IS DISTINCT FROM OLD.recurrence_parent_id OR
       NEW.recurrence_interval_days IS DISTINCT FROM OLD.recurrence_interval_days OR
       NEW.recurrence_count IS DISTINCT FROM OLD.recurrence_count OR
       NEW.expires_at IS DISTINCT FROM OLD.expires_at OR
       NEW.source_scheduled_at IS DISTINCT FROM OLD.source_scheduled_at OR
       NEW.source_payment_due_date IS DISTINCT FROM OLD.source_payment_due_date THEN
      RAISE EXCEPTION 'Origem ou validade da mensagem não pode ser alterada' USING ERRCODE = '42501';
    END IF;
    IF NEW.status = 'pending' AND NEW.scheduled_for <= clock_timestamp() THEN
      RAISE EXCEPTION 'O agendamento deve ser futuro' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_interactive_queue_state BEFORE INSERT OR UPDATE ON public.scheduled_messages
FOR EACH ROW EXECUTE FUNCTION public.guard_interactive_queue_state();

CREATE POLICY templates_read ON public.predefined_messages FOR SELECT TO authenticated
USING ((SELECT public.has_staff_role(ARRAY['admin','recepcao','avaliador'])));
CREATE POLICY templates_write ON public.predefined_messages FOR ALL TO authenticated
USING ((SELECT public.has_staff_role(ARRAY['admin','recepcao'])))
WITH CHECK ((SELECT public.has_staff_role(ARRAY['admin','recepcao'])));

CREATE POLICY automation_read ON public.automation_settings FOR SELECT TO authenticated
USING ((SELECT public.has_staff_role(ARRAY['admin','recepcao','avaliador'])));
CREATE POLICY automation_write ON public.automation_settings FOR ALL TO authenticated
USING ((SELECT public.has_staff_role(ARRAY['admin'])))
WITH CHECK ((SELECT public.has_staff_role(ARRAY['admin'])));
CREATE POLICY settings_read ON public.app_settings FOR SELECT TO authenticated
USING ((SELECT public.has_staff_role(ARRAY['admin','recepcao','avaliador'])));
CREATE POLICY settings_write ON public.app_settings FOR ALL TO authenticated
USING ((SELECT public.has_staff_role(ARRAY['admin'])))
WITH CHECK ((SELECT public.has_staff_role(ARRAY['admin'])));

-- AI history is private to the staff member who created it.
CREATE POLICY conversation_read ON public.ai_conversations FOR SELECT TO authenticated
USING (owner_id = (SELECT auth.uid()) AND (SELECT public.has_staff_role(ARRAY['admin','recepcao'])));
CREATE POLICY conversation_create ON public.ai_conversations FOR INSERT TO authenticated
WITH CHECK (owner_id = (SELECT auth.uid()) AND (SELECT public.has_staff_role(ARRAY['admin','recepcao'])));
CREATE POLICY conversation_edit ON public.ai_conversations FOR UPDATE TO authenticated
USING (owner_id = (SELECT auth.uid()) AND (SELECT public.has_staff_role(ARRAY['admin','recepcao'])))
WITH CHECK (owner_id = (SELECT auth.uid()) AND (SELECT public.has_staff_role(ARRAY['admin','recepcao'])));
CREATE POLICY conversation_delete ON public.ai_conversations FOR DELETE TO authenticated
USING (owner_id = (SELECT auth.uid()) AND (SELECT public.has_staff_role(ARRAY['admin','recepcao'])));
CREATE POLICY ai_messages_read ON public.ai_messages FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id));
CREATE POLICY ai_messages_create ON public.ai_messages FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id));
CREATE POLICY ai_messages_edit ON public.ai_messages FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id))
WITH CHECK (EXISTS (SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id));
CREATE POLICY ai_messages_delete ON public.ai_messages FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id));

-- Keep the original validated transaction as an internal invoker function.
-- It inherits the privileged wrapper's effective role, while callers cannot
-- execute it directly to bypass the staff membership check.
ALTER FUNCTION public.mutate_evaluation_tx(text,uuid,uuid,timestamptz,text,jsonb,boolean)
  RENAME TO mutate_evaluation_internal_tx;
REVOKE ALL ON FUNCTION public.mutate_evaluation_internal_tx(text,uuid,uuid,timestamptz,text,jsonb,boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_evaluation_internal_tx(text,uuid,uuid,timestamptz,text,jsonb,boolean)
  TO service_role;

CREATE FUNCTION public.mutate_evaluation_tx(
  _action text, _evaluation_id uuid, _student_id uuid DEFAULT NULL,
  _scheduled_at timestamptz DEFAULT NULL, _notes text DEFAULT NULL,
  _messages jsonb DEFAULT '[]', _allow_conflict boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND
    (auth.role() IS DISTINCT FROM 'authenticated' OR
     NOT public.has_staff_role(ARRAY['admin','recepcao','avaliador'])) THEN
    RAISE EXCEPTION 'Profissional sem permissão para alterar avaliações'
      USING ERRCODE = '42501';
  END IF;
  RETURN public.mutate_evaluation_internal_tx(
    _action, _evaluation_id, _student_id, _scheduled_at, _notes, _messages, _allow_conflict
  );
END $$;

-- Retain restricted RPC grants for staff and privileged automation.
REVOKE ALL ON FUNCTION public.complete_evaluation_tx(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_evaluation_tx(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.mutate_evaluation_tx(text,uuid,uuid,timestamptz,text,jsonb,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mutate_evaluation_tx(text,uuid,uuid,timestamptz,text,jsonb,boolean)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.cancel_scheduled_messages_tx(uuid[],boolean) FROM PUBLIC, anon;

COMMIT;

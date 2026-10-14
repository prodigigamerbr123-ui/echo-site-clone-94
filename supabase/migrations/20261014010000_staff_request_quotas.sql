-- Fixed-size buckets: at most two rows per staff account and operation.
CREATE TABLE public.staff_request_quotas (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation text NOT NULL,
  window_seconds integer NOT NULL CHECK (window_seconds IN (600,86400)),
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  PRIMARY KEY (user_id, operation, window_seconds)
);
ALTER TABLE public.staff_request_quotas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_request_quotas FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.staff_request_quotas TO service_role;

-- Zero permits the request; positive values are the seconds before retry.
-- Limits and account identity cannot be supplied or increased by the caller.
CREATE FUNCTION public.consume_staff_request_quota(_operation text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _user uuid := auth.uid();
  _now timestamptz := statement_timestamp();
  _short_limit integer;
  _day_limit integer;
  _seconds integer;
  _limit integer;
  _start timestamptz;
  _count integer;
BEGIN
  IF _user IS NULL OR NOT public.has_staff_role(ARRAY['admin','recepcao']) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  CASE _operation
    WHEN 'ai-assistant' THEN _short_limit := 20; _day_limit := 200;
    WHEN 'daily-briefing' THEN _short_limit := 10; _day_limit := 100;
    WHEN 'ai-database-actions' THEN _short_limit := 60; _day_limit := 1000;
    WHEN 'send-whatsapp' THEN _short_limit := 30; _day_limit := 1000;
    ELSE RAISE EXCEPTION 'Operação inválida' USING ERRCODE = '22023';
  END CASE;
  FOREACH _seconds IN ARRAY ARRAY[600,86400] LOOP
    _limit := CASE WHEN _seconds=600 THEN _short_limit ELSE _day_limit END;
    _start := to_timestamp(floor(extract(epoch FROM _now)/_seconds)*_seconds);
    _count := NULL;
    INSERT INTO public.staff_request_quotas AS q
      (user_id,operation,window_seconds,window_started_at,request_count)
    VALUES (_user,_operation,_seconds,_start,1)
    ON CONFLICT (user_id,operation,window_seconds) DO UPDATE SET
      window_started_at = EXCLUDED.window_started_at,
      request_count = CASE WHEN q.window_started_at<>EXCLUDED.window_started_at
        THEN 1 ELSE q.request_count+1 END
    WHERE q.window_started_at<>EXCLUDED.window_started_at OR q.request_count<_limit
    RETURNING request_count INTO _count;
    IF _count IS NULL THEN
      RETURN greatest(1,ceil(extract(epoch FROM (_start+make_interval(secs=>_seconds)-_now)))::integer);
    END IF;
  END LOOP;
  RETURN 0;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_staff_request_quota(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_staff_request_quota(text) TO authenticated;

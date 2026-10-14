-- Additive rollout: migrate all callers before removing direct INSERT privileges.
CREATE TABLE public.message_enqueue_requests (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  payload jsonb NOT NULL,
  queued integer NOT NULL CHECK (queued >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,request_id)
);
ALTER TABLE public.message_enqueue_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.message_enqueue_requests FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.message_enqueue_requests TO service_role;

CREATE FUNCTION public.enqueue_messages_tx(_request_id uuid, _student_ids uuid[], _content text, _schedule jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE
  _user uuid := auth.uid();
  _now timestamptz := statement_timestamp();
  _ids uuid[];
  _payload jsonb;
  _previous public.message_enqueue_requests%ROWTYPE;
  _kind text := _schedule->>'kind';
  _dates jsonb := '[]'::jsonb;
  _date_text text;
  _time_text text;
  _base timestamptz;
  _days integer;
  _count integer;
  _interval jsonb;
  _entry jsonb;
  _student record;
  _root uuid;
  _series boolean := false;
  _final text;
  _type text;
  _queued integer := 0;
  _index integer := 0;
  _span integer := 0;
  _retry integer;
BEGIN
  IF _user IS NULL OR NOT public.has_staff_role(ARRAY['admin','recepcao']) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501';
  END IF;
  IF _request_id IS NULL OR _student_ids IS NULL OR cardinality(_student_ids) NOT BETWEEN 1 AND 500
     OR array_position(_student_ids,NULL) IS NOT NULL OR _content IS NULL
     OR char_length(btrim(_content)) NOT BETWEEN 1 AND 1000
     OR jsonb_typeof(_schedule) IS DISTINCT FROM 'object' OR octet_length(_schedule::text)>16384 THEN
    RAISE EXCEPTION 'Informe uma mensagem de até 1000 caracteres e de 1 a 500 alunos' USING ERRCODE='22023';
  END IF;
  SELECT array_agg(id ORDER BY id) INTO _ids FROM (SELECT DISTINCT unnest(_student_ids) id) s;
  IF cardinality(_ids) <> cardinality(_student_ids) THEN
    RAISE EXCEPTION 'Há alunos repetidos na seleção' USING ERRCODE='22023';
  END IF;
  _payload := jsonb_build_object('student_ids',_ids,'content',btrim(_content),'schedule',_schedule);
  -- Serialize identical request IDs across HTTP retries and concurrent connections.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_user::text||':'||_request_id::text,0));
  SELECT * INTO _previous FROM public.message_enqueue_requests WHERE user_id=_user AND request_id=_request_id;
  IF FOUND THEN
    IF _previous.payload <> _payload THEN
      RAISE EXCEPTION 'Identificador já utilizado para outro envio' USING ERRCODE='22023';
    END IF;
    RETURN jsonb_build_object('request_id',_request_id,'queued',_previous.queued,'replayed',true);
  END IF;
  IF (SELECT count(*) FROM public.students WHERE id=ANY(_ids)) <> cardinality(_ids) THEN
    RAISE EXCEPTION 'Aluno não encontrado' USING ERRCODE='22023';
  END IF;

  IF _kind='now' THEN
    _span := CASE WHEN cardinality(_ids)<=5 THEN 0 WHEN cardinality(_ids)<=20 THEN least(30,cardinality(_ids)*2)
      WHEN cardinality(_ids)<=100 THEN 60 ELSE ceil(cardinality(_ids)*0.6)::int END;
    _dates := jsonb_build_array(jsonb_build_object('at',_now+interval '1 minute','type','manual'));
  ELSIF _kind='at' THEN
    IF coalesce(_schedule->>'scheduled_for','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$' THEN
      RAISE EXCEPTION 'Data com fuso horário obrigatória' USING ERRCODE='22023';
    END IF;
    _base := (_schedule->>'scheduled_for')::timestamptz;
    _type := coalesce(_schedule->>'message_type','manual');
    IF _base<=_now OR _type NOT IN ('manual','welcome','reengagement') THEN
      RAISE EXCEPTION 'Data futura ou tipo de mensagem inválido' USING ERRCODE='22023';
    END IF;
    _dates := jsonb_build_array(jsonb_build_object('at',_base,'type',_type));
  ELSIF _kind IN ('quick','custom') THEN
    _time_text := _schedule->>'time';
    IF coalesce(_time_text,'') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      RAISE EXCEPTION 'Horário inválido' USING ERRCODE='22023';
    END IF;
    IF _kind='quick' THEN
      IF coalesce(_schedule->>'when','') NOT IN ('today','later')
        OR jsonb_typeof(_schedule->'repeat') IS DISTINCT FROM 'boolean'
        OR jsonb_typeof(_schedule->'days') IS DISTINCT FROM 'object'
        OR jsonb_typeof(_schedule->'days'->'days7') IS DISTINCT FROM 'boolean'
        OR jsonb_typeof(_schedule->'days'->'days21') IS DISTINCT FROM 'boolean'
        OR jsonb_typeof(_schedule->'days'->'days45') IS DISTINCT FROM 'boolean' THEN
        RAISE EXCEPTION 'Opções de agendamento inválidas' USING ERRCODE='22023';
      END IF;
      _base := (((_now AT TIME ZONE 'America/Sao_Paulo')::date)::text||' '||_time_text)::timestamp AT TIME ZONE 'America/Sao_Paulo';
      IF _schedule->>'when'='today' THEN
        IF _base<=_now THEN RAISE EXCEPTION 'O horário de hoje já passou' USING ERRCODE='22023'; END IF;
        _dates := _dates || jsonb_build_array(jsonb_build_object('at',_base,'type','manual'));
      END IF;
      IF _schedule->>'when'='later' OR (_schedule->>'repeat')::boolean THEN
        FOREACH _days IN ARRAY ARRAY[7,21,45] LOOP
          IF (_schedule->'days'->>('days'||_days))::boolean THEN
            _dates := _dates || jsonb_build_array(jsonb_build_object('at',_base+make_interval(days=>_days),'type',_days||'_day_followup'));
          END IF;
        END LOOP;
      END IF;
    ELSE
      _date_text := _schedule->>'date';
      IF coalesce(_date_text,'') !~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$' THEN
        RAISE EXCEPTION 'Data inválida' USING ERRCODE='22023';
      END IF;
      _base := (_date_text||' '||_time_text)::timestamp AT TIME ZONE 'America/Sao_Paulo';
      IF _base<=_now THEN RAISE EXCEPTION 'Data deve ser futura' USING ERRCODE='22023'; END IF;
      IF jsonb_typeof(_schedule->'intervals') IS DISTINCT FROM 'array' OR jsonb_array_length(_schedule->'intervals')>20 THEN
        RAISE EXCEPTION 'Intervalos inválidos (máximo 20)' USING ERRCODE='22023';
      END IF;
      _series := jsonb_array_length(_schedule->'intervals')>0;
      _dates := jsonb_build_array(jsonb_build_object('at',_base,'type','manual'));
      FOR _interval IN SELECT value FROM jsonb_array_elements(_schedule->'intervals') LOOP
        IF jsonb_typeof(_interval->'days') IS DISTINCT FROM 'number' OR jsonb_typeof(_interval->'count') IS DISTINCT FROM 'number'
          OR (_interval->>'days') !~ '^[0-9]{1,3}$' OR (_interval->>'count') !~ '^[0-9]{1,2}$' THEN
          RAISE EXCEPTION 'Intervalos devem ser números inteiros' USING ERRCODE='22023';
        END IF;
        _days := (_interval->>'days')::int; _count := (_interval->>'count')::int;
        IF _days NOT BETWEEN 1 AND 365 OR _count NOT BETWEEN 1 AND 52 THEN
          RAISE EXCEPTION 'Use intervalos de 1 a 365 dias e de 1 a 52 repetições' USING ERRCODE='22023';
        END IF;
        SELECT _dates || jsonb_agg(jsonb_build_object('at',_base+make_interval(days=>i*_days),'type','recurring','days',_days))
          INTO _dates FROM generate_series(1,_count) i;
      END LOOP;
      SELECT jsonb_agg(entry ORDER BY entry->>'at') INTO _dates FROM (
        SELECT DISTINCT ON (value->>'at') value AS entry FROM jsonb_array_elements(_dates)
          ORDER BY value->>'at',(value->>'days')::int NULLS FIRST
      ) unique_dates;
      IF jsonb_array_length(_dates)>105 THEN RAISE EXCEPTION 'Uma série permite até 104 repetições' USING ERRCODE='22023'; END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'Tipo de agendamento inválido' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(_dates)=0 OR jsonb_array_length(_dates)*cardinality(_ids)>5000 THEN
    RAISE EXCEPTION 'Selecione pelo menos uma data; máximo 5000 mensagens por lote' USING ERRCODE='22023';
  END IF;
  _retry := public.consume_staff_request_quota('send-whatsapp');
  IF _retry>0 THEN RAISE EXCEPTION 'Limite de envios atingido. Aguarde e tente novamente.' USING ERRCODE='PT429', DETAIL=_retry::text; END IF;
  FOR _student IN SELECT id,name FROM public.students WHERE id=ANY(_ids) ORDER BY id FOR KEY SHARE LOOP
    _root := gen_random_uuid();
    -- Escape replacement backslashes: names are literal data, never regex substitutions.
    _final := regexp_replace(btrim(_content),'\{nome\}',replace(_student.name,chr(92),chr(92)||chr(92)),'gi');
    IF char_length(_final)>1000 THEN RAISE EXCEPTION 'A mensagem personalizada ultrapassa 1000 caracteres' USING ERRCODE='22023'; END IF;
    FOR _entry IN SELECT value FROM jsonb_array_elements(_dates) LOOP
      _type := _entry->>'type';
      IF _type IN ('welcome','reengagement') THEN
        PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_student.id::text||':'||_type,1));
        IF EXISTS(SELECT 1 FROM public.scheduled_messages WHERE student_id=_student.id AND message_type=_type AND status IN ('pending','processing')) THEN CONTINUE; END IF;
      END IF;
      _base := (_entry->>'at')::timestamptz;
      IF _kind='now' THEN
        _base := _base + make_interval(secs=>floor(random()*120)::int + CASE WHEN _span>0 THEN floor(_span*60.0*_index/(cardinality(_ids)-1))::int ELSE 0 END);
      END IF;
      INSERT INTO public.scheduled_messages(id,student_id,content,scheduled_for,message_type,status,recurrence_parent_id,recurrence_count,recurrence_interval_days)
        VALUES (CASE WHEN _series AND _type='manual' THEN _root ELSE gen_random_uuid() END,_student.id,_final,_base,_type,'pending',
          CASE WHEN _series THEN _root ELSE NULL END,1,(_entry->>'days')::int);
      _queued := _queued+1;
    END LOOP;
    _index := _index+1;
  END LOOP;
  INSERT INTO public.message_enqueue_requests(user_id,request_id,payload,queued) VALUES(_user,_request_id,_payload,_queued);
  RETURN jsonb_build_object('request_id',_request_id,'queued',_queued,'replayed',false);
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_messages_tx(uuid,uuid[],text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.enqueue_messages_tx(uuid,uuid[],text,jsonb) TO authenticated;

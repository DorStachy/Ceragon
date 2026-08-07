SELECT 'QA::A9::' || count(*)::text AS r
  FROM pg_tables WHERE schemaname='public' AND tablename LIKE '\_w5\_test\_%';
SELECT 'QA::A9N::' || coalesce(string_agg(tablename, ','), 'none') AS r
  FROM pg_tables WHERE schemaname='public' AND tablename LIKE '\_w5\_test\_%';
SELECT 'QA::A12::' || count(*)::text
    || '|' || (count(*) FILTER (WHERE (metadata->>'redactedPreview') LIKE '%AKIA%'))::text
    || '|' || (count(*) FILTER (WHERE (metadata->>'redactedPreview') ~ 'C:\\Users\\[A-Za-z]'))::text
    || '|' || (count(*) FILTER (WHERE (metadata->>'redactedPreview') LIKE '%AKIA%'
                                   OR (metadata->>'redactedPreview') ~ 'C:\\Users\\[A-Za-z]'))::text
    || '|' || (count(*) FILTER (WHERE ((metadata->>'redactedPreview') LIKE '%AKIA%'
                                    OR (metadata->>'redactedPreview') ~ 'C:\\Users\\[A-Za-z]')
                                  AND event_time > TIMESTAMPTZ '2026-08-02 11:47:00+00'))::text
    || '|' || coalesce(max(length(metadata->>'redactedPreview')),0)::text
    || '|' || coalesce(replace(max(event_time)::text,' ','T'),'none')
    || '|' || coalesce(replace((max(event_time) FILTER (WHERE (metadata->>'redactedPreview') LIKE '%AKIA%'
                            OR (metadata->>'redactedPreview') ~ 'C:\\Users\\[A-Za-z]'))::text,' ','T'),'none') AS r
  FROM ai_events WHERE metadata ? 'redactedPreview';
SELECT 'QA::TRAF::' || coalesce(replace(max(event_time)::text,' ','T'),'none') || '|' || count(*)::text
    || '|' || (count(*) FILTER (WHERE event_time > now() - interval '7 days'))::text AS r FROM ai_events;
SELECT 'QA::A14::' || count(*)::text || '|' || count(DISTINCT name)::text AS r FROM migrations;
SELECT 'QA::A14C::' || coalesce(string_agg(conname || '(' || contype::text || ')', ',' ORDER BY conname),'none') AS r
  FROM pg_constraint WHERE conrelid='public.migrations'::regclass;
SELECT 'QA::A15::' || coalesce(string_agg(conname || '(' || contype::text || ')', ',' ORDER BY conname),'none') AS r
  FROM pg_constraint WHERE conrelid='public.ai_sessions'::regclass;
SELECT 'QA::A16::' || (count(*) FILTER (WHERE client_event_id IS NULL AND emitter_stream_id IS NOT NULL))::text
    || '|' || count(*)::text
    || '|' || (count(*) FILTER (WHERE emitter_stream_id IS NOT NULL))::text
    || '|' || (count(*) FILTER (WHERE client_event_id IS NULL))::text AS r
  FROM ai_events;
SELECT 'QA::ORGS::' || count(*)::text AS r FROM orgs;

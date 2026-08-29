SELECT 'QA::C38::' || seq_num::text || '|' || event_type
    || '|' || coalesce(runtime,'(null)') || '|' || coalesce(surface,'(null)')
    || '|' || coalesce(enforcement_effect,'(null)') || '|' || coalesce(policy_decision,'(null)')
    || '|' || coalesce(left(session_id::text,8),'(null)') AS r
  FROM ai_events WHERE seq_num IN (994, 2666, 2695) ORDER BY seq_num;
SELECT 'QA::C38N::' || count(*)::text AS r FROM ai_events WHERE seq_num IN (994, 2666, 2695);
SELECT 'QA::C38K::' || coalesce(string_agg(event_type || '=' || n::text, ',' ORDER BY event_type),'none') AS r
  FROM (SELECT event_type, count(*) AS n FROM ai_events
         WHERE event_type LIKE 'TOOL%' OR event_type LIKE 'PROMPT%' GROUP BY 1) t;
SELECT 'QA::ORGS::' || count(*)::text AS r FROM orgs;

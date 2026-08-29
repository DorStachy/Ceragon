SELECT 'QA::TRAF::' || coalesce(replace(max(event_time)::text,' ','T'),'none') || '|' || count(*)::text
    || '|' || (count(*) FILTER (WHERE event_time > now() - interval '7 days'))::text AS r FROM ai_events;
SELECT 'QA::TRAFA::' || coalesce(replace(max("createdAt")::text,' ','T'),'none') || '|' || count(*)::text AS r
  FROM audit_events;
SELECT 'QA::E56R::' || count(*)::text || '|' || count(DISTINCT org_id)::text
    || '|' || coalesce(replace(max(created_at)::text,' ','T'),'none') AS r
  FROM ai_policy_bundle_application_receipt;
SELECT 'QA::E56B::' || (SELECT count(*) FROM ai_policy_bundle_state)::text
    || '|' || (SELECT count(*) FROM ai_policy_bundle_history)::text AS r;
SELECT 'QA::E56T::' || count(*)::text AS r FROM ai_prompt_evidence_artifacts;
SELECT 'QA::E56A::' || coalesce(string_agg(state || '=' || n::text, ',' ORDER BY state),'none') AS r
  FROM (SELECT state, count(*) AS n FROM ai_prompt_evidence_artifacts GROUP BY 1) t;
SELECT 'QA::E59::' || coalesce(string_agg(et || '=' || n::text, ',' ORDER BY et),'none') AS r
  FROM (SELECT "eventType" AS et, count(*) AS n FROM audit_events
         WHERE "eventType" LIKE '%PROMPT_EVIDENCE%' GROUP BY 1) t;
SELECT 'QA::E59S::' || coalesce(string_agg(coalesce(s,'(no-surface)') || '=' || n::text, ',' ORDER BY 1),'none') AS r
  FROM (SELECT payload->>'surface' AS s, count(*) AS n FROM audit_events
         WHERE "eventType" LIKE '%PROMPT_EVIDENCE%' GROUP BY 1) t;
SELECT 'QA::E59T::' || count(*)::text || '|' || count(DISTINCT "eventType")::text AS r FROM audit_events;
SELECT 'QA::E59G::' || count(*)::text AS r FROM ai_prompt_evidence_access_grants;
SELECT 'QA::E62R::' || coalesce(string_agg(coalesce(runtime,'(null)') || '=' || n::text, ',' ORDER BY n DESC),'none') AS r
  FROM (SELECT runtime, count(*) AS n FROM ai_events GROUP BY 1) t;
SELECT 'QA::E62S::' || coalesce(string_agg(coalesce(surface,'(null)') || '=' || n::text, ',' ORDER BY n DESC),'none') AS r
  FROM (SELECT surface, count(*) AS n FROM ai_events GROUP BY 1) t;
SELECT 'QA::E62K::' || coalesce(string_agg(coalesce(client_kind,'(null)') || '=' || n::text, ',' ORDER BY n DESC),'none') AS r
  FROM (SELECT client_kind, count(*) AS n FROM ai_sessions GROUP BY 1) t;
SELECT 'QA::E65::' || left(id::text,8)
    || '|' || coalesce(replace(chat_title,' ','_'),'(null)')
    || '|' || coalesce(replace(title,' ','_'),'(null)')
    || '|' || coalesce(replace(username,' ','_'),'(null)') AS r
  FROM ai_sessions WHERE id::text LIKE '9c13f9e5%' OR id::text LIKE 'abd7495f%' ORDER BY 1;
SELECT 'QA::E65N::' || count(*)::text
    || '|' || (count(*) FILTER (WHERE chat_title IS NOT NULL))::text
    || '|' || (count(*) FILTER (WHERE title IS NOT NULL))::text
    || '|' || (count(*) FILTER (WHERE username IS NOT NULL))::text
    || '|' || (count(*) FILTER (WHERE chat_title IS NULL AND title IS NULL))::text AS r
  FROM ai_sessions;
SELECT 'QA::E68F::' || count(*)::text || '|' || count(DISTINCT endpoint_id)::text
    || '|' || count(DISTINCT org_id)::text AS r FROM ai_context_findings;
SELECT 'QA::E68C::' || count(*)::text || '|' || count(DISTINCT endpoint_id)::text
    || '|' || coalesce(sum(nodes_resolved),0)::text
    || '|' || (count(*) FILTER (WHERE complete))::text AS r FROM ai_context_coverage;
SELECT 'QA::ORGS::' || count(*)::text AS r FROM orgs;
SELECT 'QA::E68IDC::' || count(*)::text || '|' || (count(*) FILTER (WHERE a_hit))::text
    || '|' || (count(*) FILTER (WHERE k_hit))::text AS r
  FROM (SELECT EXISTS (SELECT 1 FROM agents g WHERE g.id::text = c.endpoint_id) AS a_hit,
               EXISTS (SELECT 1 FROM api_keys k WHERE k.id::text = c.endpoint_id) AS k_hit
          FROM ai_context_coverage c) t;
SELECT 'QA::E68IDF::' || count(*)::text || '|' || (count(*) FILTER (WHERE a_hit))::text
    || '|' || (count(*) FILTER (WHERE k_hit))::text AS r
  FROM (SELECT EXISTS (SELECT 1 FROM agents g WHERE g.id::text = f.endpoint_id) AS a_hit,
               EXISTS (SELECT 1 FROM api_keys k WHERE k.id::text = f.endpoint_id) AS k_hit
          FROM ai_context_findings f) t;

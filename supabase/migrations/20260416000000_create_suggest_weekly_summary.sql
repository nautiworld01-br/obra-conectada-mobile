-- Função aprimorada para sugerir resumo semanal com deduplicação semântica.
-- future_fix: Integrar com OpenAI/Anthropic via Edge Functions para resumo narrativo.

CREATE OR REPLACE FUNCTION suggest_weekly_summary(
  p_project_id UUID,
  p_week_start DATE,
  p_week_end DATE
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_summary TEXT := '';
  v_stages_list TEXT;
  v_activities_list TEXT;
BEGIN
  -- 1. Coleta etapas do cronograma (deduplicadas por nome)
  SELECT string_agg(DISTINCT name, E'\n- ')
  INTO v_stages_list
  FROM schedule_stages
  WHERE project_id = p_project_id
    AND (
      (planned_start <= p_week_end AND planned_end >= p_week_start) OR
      (planned_start IS NULL AND status = 'em_andamento')
    );

  -- 2. Coleta atividades dos logs diários, normalizando e removendo duplicatas
  SELECT string_agg(DISTINCT initcap(activity), E'\n- ')
  INTO v_activities_list
  FROM (
    -- Quebra, coloca em minúsculo e limpa espaços para comparação justa
    SELECT trim(lower(unnest(regexp_split_to_array(activities, E'[\n,]+')))) as activity
    FROM daily_logs
    WHERE project_id = p_project_id
      AND date >= p_week_start
      AND date <= p_week_end
  ) sub
  WHERE activity <> '';

  -- 3. Monta o corpo do resumo formatado
  IF v_stages_list IS NOT NULL THEN
    v_summary := 'MARCOS DO CRONOGRAMA ATIVOS:' || E'\n- ' || v_stages_list || E'\n\n';
  END IF;

  IF v_activities_list IS NOT NULL THEN
    v_summary := v_summary || 'TRABALHOS REALIZADOS NA SEMANA:' || E'\n- ' || v_activities_list;
  END IF;

  IF v_summary = '' THEN
    v_summary := 'Nenhum registro de atividade ou etapa ativa encontrado para este período.';
  END IF;

  RETURN v_summary;
END;
$$;

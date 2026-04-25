create or replace function suggest_weekly_summary(
  p_project_id uuid,
  p_week_start date,
  p_week_end date
)
returns text
language plpgsql
security definer
as $$
declare
  v_summary text := '';
  v_stages_list text;
  v_activities_list text;
  v_no_work_lines text := '';
  v_no_work_reasons_list text;
  v_total_logs integer := 0;
  v_total_no_work_logs integer := 0;
  v_current_start date;
  v_current_end date;
  v_current_reason text;
  v_row record;
begin
  select string_agg(distinct name, E'\n- ')
  into v_stages_list
  from schedule_stages
  where project_id = p_project_id
    and (
      (planned_start <= p_week_end and planned_end >= p_week_start) or
      (planned_start is null and status = 'em_andamento')
    );

  select count(*)::int,
         count(*) filter (where no_work_reason is not null)::int
  into v_total_logs, v_total_no_work_logs
  from daily_logs
  where project_id = p_project_id
    and date >= p_week_start
    and date <= p_week_end;

  select string_agg(distinct initcap(activity), E'\n- ')
  into v_activities_list
  from (
    select trim(lower(unnest(regexp_split_to_array(activities, E'[\n,]+')))) as activity
    from daily_logs
    where project_id = p_project_id
      and date >= p_week_start
      and date <= p_week_end
      and no_work_reason is null
  ) sub
  where activity <> '';

  if v_total_logs > 0 and v_total_logs = v_total_no_work_logs then
    select string_agg(distinct reason_label, E'\n- ')
    into v_no_work_reasons_list
    from (
      select case
        when no_work_reason = 'feriado' then 'Feriado'
        when no_work_reason = 'condominio fechado' then 'Condomínio fechado'
        when no_work_reason = 'condominio nao autorizou realizar servicos' then 'Condomínio não autorizou realizar serviços'
        when no_work_reason = 'chuva intensa' then 'Chuva intensa'
        when no_work_reason = 'outro' then coalesce(nullif(trim(no_work_note), ''), 'Outro')
        else coalesce(nullif(trim(no_work_reason), ''), 'Motivo não informado')
      end as reason_label
      from daily_logs
      where project_id = p_project_id
        and date >= p_week_start
        and date <= p_week_end
        and no_work_reason is not null
    ) reasons;
  else
    for v_row in
      select
        date,
        case
          when no_work_reason = 'feriado' then 'Feriado'
          when no_work_reason = 'condominio fechado' then 'Condomínio fechado'
          when no_work_reason = 'condominio nao autorizou realizar servicos' then 'Condomínio não autorizou realizar serviços'
          when no_work_reason = 'chuva intensa' then 'Chuva intensa'
          when no_work_reason = 'outro' then coalesce(nullif(trim(no_work_note), ''), 'Outro')
          else coalesce(nullif(trim(no_work_reason), ''), 'Motivo não informado')
        end as reason_label
      from daily_logs
      where project_id = p_project_id
        and date >= p_week_start
        and date <= p_week_end
        and no_work_reason is not null
      order by date asc
    loop
      if v_current_start is null then
        v_current_start := v_row.date;
        v_current_end := v_row.date;
        v_current_reason := v_row.reason_label;
      elsif v_row.reason_label = v_current_reason and v_row.date = v_current_end + 1 then
        v_current_end := v_row.date;
      else
        v_no_work_lines := v_no_work_lines ||
          case when v_no_work_lines <> '' then E'\n' else '' end ||
          case
            when v_current_start = v_current_end then
              format('- %s não teve obra. Motivo: %s.', to_char(v_current_start, 'DD/MM'), v_current_reason)
            when v_current_end = v_current_start + 1 then
              format('- %s e %s não teve obra. Motivo: %s.', to_char(v_current_start, 'DD/MM'), to_char(v_current_end, 'DD/MM'), v_current_reason)
            else
              format('- %s até %s não teve obra. Motivo: %s.', to_char(v_current_start, 'DD/MM'), to_char(v_current_end, 'DD/MM'), v_current_reason)
          end;

        v_current_start := v_row.date;
        v_current_end := v_row.date;
        v_current_reason := v_row.reason_label;
      end if;
    end loop;

    if v_current_start is not null then
      v_no_work_lines := v_no_work_lines ||
        case when v_no_work_lines <> '' then E'\n' else '' end ||
        case
          when v_current_start = v_current_end then
            format('- %s não teve obra. Motivo: %s.', to_char(v_current_start, 'DD/MM'), v_current_reason)
          when v_current_end = v_current_start + 1 then
            format('- %s e %s não teve obra. Motivo: %s.', to_char(v_current_start, 'DD/MM'), to_char(v_current_end, 'DD/MM'), v_current_reason)
          else
            format('- %s até %s não teve obra. Motivo: %s.', to_char(v_current_start, 'DD/MM'), to_char(v_current_end, 'DD/MM'), v_current_reason)
        end;
    end if;
  end if;

  if v_stages_list is not null then
    v_summary := 'MARCOS DO CRONOGRAMA ATIVOS:' || E'\n- ' || v_stages_list || E'\n\n';
  end if;

  if v_total_logs > 0 and v_total_logs = v_total_no_work_logs and coalesce(v_no_work_reasons_list, '') <> '' then
    v_summary := v_summary || 'TRABALHOS REALIZADOS NA SEMANA:' || E'\nNa semana não teve obra pelos seguintes motivos:' || E'\n- ' || v_no_work_reasons_list;
  else
    if v_activities_list is not null then
      v_summary := v_summary || 'TRABALHOS REALIZADOS NA SEMANA:' || E'\n- ' || v_activities_list;
    end if;

    if coalesce(v_no_work_lines, '') <> '' then
      v_summary := v_summary ||
        case
          when v_activities_list is not null then E'\n'
          else 'TRABALHOS REALIZADOS NA SEMANA:' || E'\n'
        end ||
        v_no_work_lines;
    end if;
  end if;

  if v_summary = '' then
    v_summary := 'Nenhum registro de atividade, dia sem obra ou etapa ativa encontrado para este período.';
  end if;

  return v_summary;
end;
$$;

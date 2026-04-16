-- Criação da tabela de presença (Attendance)
-- future_fix: Esta tabela tornou-se secundaria após a automação via DailyLogs,
-- mas permanece util para historico e integracoes externas.
CREATE TABLE IF NOT EXISTS public.attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('presente', 'falta', 'meio_periodo')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,

    -- Restrição crucial para o funcionamento do upsert (um registro por funcionário por dia)
    CONSTRAINT attendance_employee_date_unique UNIQUE (employee_id, date)
);

-- Índices para otimização de consultas por projeto e data
CREATE INDEX IF NOT EXISTS attendance_project_id_idx ON public.attendance(project_id);
CREATE INDEX IF NOT EXISTS attendance_date_idx ON public.attendance(date);

-- Habilitar Row Level Security (RLS)
-- Garante que dados de uma obra nao sejam acessados por membros de outra obra.
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- Políticas de Segurança (Seguindo o padrão do projeto)

-- 1. Proprietários e Membros do projeto podem visualizar a presença
CREATE POLICY "Enable read access for project members" ON public.attendance
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.project_members
            WHERE project_members.project_id = attendance.project_id
            AND project_members.user_id = auth.uid()
        )
    );

-- 2. Somente proprietários podem gerenciar (inserir/atualizar/excluir) a presença
-- future_fix: Adicionar role de 'mestre_de_obras' se este tambem puder lancar presenca manual.
CREATE POLICY "Enable manage access for project owners" ON public.attendance
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.project_members
            WHERE project_members.project_id = attendance.project_id
            AND project_members.user_id = auth.uid()
            AND project_members.role = 'proprietario'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.project_members
            WHERE project_members.project_id = attendance.project_id
            AND project_members.user_id = auth.uid()
            AND project_members.role = 'proprietario'
        )
    );

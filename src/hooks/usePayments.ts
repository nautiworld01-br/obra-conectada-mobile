import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useProject } from "./useProject";

// Definições de estados e categorias para o fluxo financeiro de pagamentos.
// future_fix: Adicionar tipos de pagamento para impostos e taxas administrativas.
export type PaymentStatus = "pendente" | "em_analise" | "aprovado" | "pago" | "recusado";
export type PaymentCategory = "mao_de_obra_projeto" | "mao_de_obra_extras" | "insumos_extras";

export type PaymentRow = {
  id: string;
  project_id: string;
  requested_by: string;
  period: string;
  request_date: string;
  planned_amount: number | null;
  requested_amount: number;
  stage_id: string | null;
  description: string;
  percent_work: number | null;
  observations: string | null;
  status: PaymentStatus;
  approval_date: string | null;
  payment_date: string | null;
  approved_by: string | null;
  receipt_url: string | null;
  created_at: string;
  updated_at: string;
  due_date: string | null;
  category: PaymentCategory;
};

// Hook para buscar o histórico de pagamentos e solicitações vinculadas ao projeto.
export function usePayments() {
  const { project } = useProject();

  const query = useQuery({
    queryKey: ["payments", project?.id],
    enabled: Boolean(project?.id && supabase),
    queryFn: async (): Promise<PaymentRow[]> => {
      if (!supabase || !project) {
        return [];
      }

      const { data, error } = await supabase
        .from("payments")
        .select(
          "id, project_id, requested_by, period, request_date, planned_amount, requested_amount, stage_id, description, percent_work, observations, status, approval_date, payment_date, approved_by, receipt_url, created_at, updated_at, due_date, category",
        )
        .eq("project_id", project.id)
        .order("request_date", { ascending: false });

      if (error) {
        throw error;
      }

      return (data ?? []) as PaymentRow[];
    },
  });

  return {
    project,
    payments: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

// Cria ou atualiza uma solicitação de pagamento, suportando edição de registros existentes.
// future_fix: Implementar validação de teto orçamentário por etapa antes do upsert.
export function useUpsertPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      id?: string;
      projectId: string;
      userId: string;
      period: string;
      category: PaymentCategory;
      plannedAmount: number;
      requestedAmount: number;
      description: string;
      percentWork: number;
      stageId: string | null;
      observations: string;
      dueDate: string | null;
    }) => {
      if (!supabase) {
        throw new Error("Supabase nao configurado.");
      }

      const paymentPayload = {
        project_id: payload.projectId,
        period: payload.period,
        planned_amount: payload.plannedAmount,
        requested_amount: payload.requestedAmount,
        category: payload.category,
        description: payload.description,
        percent_work: payload.percentWork,
        stage_id: payload.stageId,
        observations: payload.observations || null,
        due_date: payload.dueDate,
      };

      if (payload.id) {
        const { data, error } = await supabase
          .from("payments")
          .update(paymentPayload)
          .eq("id", payload.id)
          .select(
            "id, project_id, requested_by, period, request_date, planned_amount, requested_amount, stage_id, description, percent_work, observations, status, approval_date, payment_date, approved_by, receipt_url, created_at, updated_at, due_date, category",
          )
          .single();

        if (error) {
          throw error;
        }

        return data as PaymentRow;
      }

      const { data, error } = await supabase
        .from("payments")
        .insert({
          ...paymentPayload,
          requested_by: payload.userId,
        })
        .select(
          "id, project_id, requested_by, period, request_date, planned_amount, requested_amount, stage_id, description, percent_work, observations, status, approval_date, payment_date, approved_by, receipt_url, created_at, updated_at, due_date, category",
        )
        .single();

      if (error) {
        throw error;
      }

      return data as PaymentRow;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["payments", variables.projectId] });
    },
  });
}

// Atualiza o status de aprovação ou liquidação de um pagamento (Fluxo de Aprovação).
export function useUpdatePaymentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      id: string;
      projectId: string;
      userId: string;
      status: PaymentStatus;
      paymentDate?: string | null;
    }) => {
      if (!supabase) {
        throw new Error("Supabase nao configurado.");
      }

      const updateData: {
        status: PaymentStatus;
        approved_by: string;
        approval_date: string;
        payment_date?: string | null;
      } = {
        status: payload.status,
        approved_by: payload.userId,
        approval_date: new Date().toISOString().slice(0, 10),
      };

      if (payload.paymentDate !== undefined) {
        updateData.payment_date = payload.paymentDate;
      }

      const { data, error } = await supabase
        .from("payments")
        .update(updateData)
        .eq("id", payload.id)
        .select(
          "id, project_id, requested_by, period, request_date, planned_amount, requested_amount, stage_id, description, percent_work, observations, status, approval_date, payment_date, approved_by, receipt_url, created_at, updated_at, due_date, category",
        )
        .single();

      if (error) {
        throw error;
      }

      return data as PaymentRow;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["payments", variables.projectId] });
    },
  });
}

// Remove uma solicitação de pagamento específica e sincroniza o estado global.
export function useDeletePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { id: string; projectId: string }) => {
      if (!supabase) {
        throw new Error("Supabase nao configurado.");
      }

      const { error } = await supabase.from("payments").delete().eq("id", payload.id);

      if (error) {
        throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["payments", variables.projectId] });
    },
  });
}

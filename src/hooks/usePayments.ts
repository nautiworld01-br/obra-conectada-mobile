import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "../lib/supabase";
import { extractPathFromSupabaseUrl } from "../lib/storageUpload";
import { useProject } from "./useProject";

export type PaymentCategory = "mao_de_obra_projeto" | "mao_de_obra_extras" | "insumos_extras";
export type PaymentStatus = "pendente" | "em_analise" | "aprovado" | "pago" | "recusado";
const PAYMENT_RECEIPTS_BUCKET = "app-media";

export type PaymentRow = {
  id: string;
  project_id: string;
  requested_by: string;
  period: string;
  category: PaymentCategory;
  planned_amount: number | string | null;
  requested_amount: number | string;
  description: string;
  percent_work: number | string | null;
  stage_id: string | null;
  observations: string | null;
  due_date: string | null;
  receipt_url: string | null;
  status: PaymentStatus;
  approved_by: string | null;
  approval_date: string | null;
  payment_date: string | null;
  request_date: string | null;
  created_at?: string;
  updated_at?: string;
};

async function removePaymentReceipt(receiptUrl: string | null | undefined) {
  if (!supabase || !receiptUrl) return;
  if (!canRemoveManagedReceipt(receiptUrl)) return;

  const filePath = extractPathFromSupabaseUrl(receiptUrl);
  if (!filePath) return;

  const { error } = await supabase.storage.from(PAYMENT_RECEIPTS_BUCKET).remove([filePath]);
  if (error) {
    throw error;
  }
}

function canRemoveManagedReceipt(receiptUrl: string) {
  if (!receiptUrl.startsWith("http://") && !receiptUrl.startsWith("https://")) {
    return false;
  }

  try {
    const parsedUrl = new URL(receiptUrl);
    return parsedUrl.pathname.includes(`/storage/v1/object/public/${PAYMENT_RECEIPTS_BUCKET}/`);
  } catch {
    return false;
  }
}

export function usePayments() {
  const { project } = useProject();

  const query = useInfiniteQuery({
    queryKey: ["payments", project?.id],
    enabled: Boolean(project?.id && supabase),
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }): Promise<PaymentRow[]> => {
      if (!supabase || !project) return [];

      const pageSize = 10;
      const from = pageParam * pageSize;
      const to = from + pageSize - 1;

      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("project_id", project.id)
        .order("request_date", { ascending: false })
        .range(from, to);

      if (error) throw error;
      return (data ?? []) as PaymentRow[];
    },
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === 10 ? allPages.length : undefined;
    }
  });

  const flatPayments = useMemo(() => {
    return query.data?.pages.flat() ?? [];
  }, [query.data]);

  return {
    project,
    payments: flatPayments,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * Mutation para criar ou atualizar um pagamento, incluindo suporte a anexo (receipt_url).
 * future_fix: Implementar compressao de imagem para os comprovantes de pagamento.
 */
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
      receiptUrl: string | null;
      previousReceiptUrl?: string | null;
    }) => {
      if (!supabase) throw new Error("Supabase nao configurado.");

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
        receipt_url: payload.receiptUrl,
      };

      const query = payload.id
        ? supabase.from("payments").update(paymentPayload).eq("id", payload.id)
        : supabase.from("payments").insert({ ...paymentPayload, requested_by: payload.userId });

      const { data, error } = await query.select().single();
      if (error) throw error;

      const replacedReceipt =
        payload.id &&
        payload.previousReceiptUrl &&
        payload.previousReceiptUrl !== payload.receiptUrl;

      if (replacedReceipt) {
        await removePaymentReceipt(payload.previousReceiptUrl);
      }

      return data as PaymentRow;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["payments", variables.projectId] });
    },
  });
}

/**
 * Hook para atualizar status de aprovacao ou pagamento.
 */
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
      if (!supabase) throw new Error("Supabase nao configurado.");

      const updateData: any = {
        status: payload.status,
        approved_by: payload.userId,
        approval_date: new Date().toISOString().slice(0, 10),
      };

      if (payload.paymentDate !== undefined) updateData.payment_date = payload.paymentDate;

      const { data, error } = await supabase.from("payments").update(updateData).eq("id", payload.id).select().single();
      if (error) throw error;
      return data as PaymentRow;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["payments", variables.projectId] });
    },
  });
}

/**
 * Hook para deletar um registro financeiro.
 */
export function useDeletePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { payment: PaymentRow }) => {
      if (!supabase) throw new Error("Supabase nao configurado.");

      const { data: deletedPayment, error: deleteError } = await supabase
        .from("payments")
        .delete()
        .eq("id", payload.payment.id)
        .select("*")
        .single();

      if (deleteError) throw deleteError;

      try {
        await removePaymentReceipt(payload.payment.receipt_url);
      } catch (receiptError) {
        const { error: rollbackError } = await supabase.from("payments").insert(deletedPayment);
        if (rollbackError) {
          throw new Error("Falha ao excluir o comprovante e ao restaurar o pagamento.");
        }

        throw receiptError;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["payments", variables.payment.project_id] });
    },
  });
}

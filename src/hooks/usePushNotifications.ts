import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  getCurrentPushSubscriptionRecord,
  getPushSupportState,
  reconcilePushSubscription,
  sendSelfTestPushNotification,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} from "../lib/pushNotifications";

export function usePushNotifications() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["push-notifications", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const supportState = getPushSupportState();
      const record = user?.id ? await getCurrentPushSubscriptionRecord(user.id) : null;
      return {
        supportState: record ? "subscribed" as const : supportState,
        record,
      };
    },
  });

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    void reconcilePushSubscription(user.id).finally(() => {
      void queryClient.invalidateQueries({ queryKey: ["push-notifications", user.id] });
    });
  }, [queryClient, user?.id]);

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) {
        throw new Error("Usuario nao autenticado.");
      }

      await subscribeToPushNotifications(user.id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["push-notifications", user?.id] });
    },
  });

  const unsubscribeMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) {
        throw new Error("Usuario nao autenticado.");
      }

      await unsubscribeFromPushNotifications(user.id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["push-notifications", user?.id] });
    },
  });

  const selfTestMutation = useMutation({
    mutationFn: sendSelfTestPushNotification,
  });

  return {
    supportState: query.data?.supportState ?? getPushSupportState(),
    subscription: query.data?.record ?? null,
    isLoading: query.isLoading,
    isSubscribing: subscribeMutation.isPending,
    isUnsubscribing: unsubscribeMutation.isPending,
    isSendingTest: selfTestMutation.isPending,
    subscribe: subscribeMutation.mutateAsync,
    unsubscribe: unsubscribeMutation.mutateAsync,
    sendTest: selfTestMutation.mutateAsync,
  };
}

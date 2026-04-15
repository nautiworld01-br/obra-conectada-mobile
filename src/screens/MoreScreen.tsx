import * as ImagePicker from "expo-image-picker";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppScreen } from "../components/AppScreen";
import { SectionCard } from "../components/SectionCard";
import { colors } from "../config/theme";
import { useAuth } from "../contexts/AuthContext";
import { buildInitials, useProfile } from "../hooks/useProfile";
import { uploadAppMediaIfNeeded } from "../lib/appMedia";
import { supabase } from "../lib/supabase";

export function MoreScreen() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { fullName, avatarUrl, occupationLabel, initials } = useProfile();
  const [editVisible, setEditVisible] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftAvatar, setDraftAvatar] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmRemoveAvatar, setConfirmRemoveAvatar] = useState(false);

  useEffect(() => {
    if (editVisible) {
      setDraftName(fullName);
      setDraftAvatar(avatarUrl);
      setConfirmRemoveAvatar(false);
    }
  }, [avatarUrl, editVisible, fullName]);

  const pickAvatarFromGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert("Galeria", "Permita o acesso a galeria para escolher a foto do perfil.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.9,
      aspect: [1, 1],
    });

    if (result.canceled || !result.assets.length) {
      return;
    }

    setDraftAvatar(result.assets[0].uri);
  };

  const handleSaveProfile = async () => {
    if (!supabase || !user) {
      Alert.alert("Perfil", "Conecte o app ao Supabase para editar o perfil.");
      return;
    }

    if (!draftName.trim()) {
      Alert.alert("Perfil", "Informe o nome do usuario.");
      return;
    }

    setSaving(true);

    try {
      const avatarUrl = await uploadAppMediaIfNeeded({
        uri: draftAvatar.trim() || null,
        pathPrefix: `users/${user.id}/avatar`,
        fileBaseName: "profile_avatar",
      });

      const { error: profileError } = await supabase.from("profiles").upsert({
        id: user.id,
        full_name: draftName.trim(),
        avatar_url: avatarUrl,
      });

      if (profileError) {
        throw profileError;
      }

      const { error: authError } = await supabase.auth.updateUser({
        data: {
          full_name: draftName.trim(),
        },
      });

      if (authError) {
        throw authError;
      }

      await queryClient.invalidateQueries({ queryKey: ["profile", user.id] });
      setEditVisible(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel salvar o perfil.";
      Alert.alert("Erro ao salvar", message);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenAvatar = async () => {
    if (!draftAvatar.trim()) return;

    try {
      await Linking.openURL(draftAvatar.trim());
    } catch {
      Alert.alert("Foto", "Nao foi possivel abrir a imagem.");
    }
  };

  return (
    <>
      <AppScreen title="Perfil" subtitle="Dados do usuario conectado neste aparelho.">
        <SectionCard title="Usuario" subtitle="Resumo da conta atual.">
          <View style={styles.profileRow}>
            <View style={styles.avatarShell}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>{initials}</Text>
              )}
            </View>

            <View style={styles.profileCopy}>
              <Text style={styles.name}>{fullName}</Text>
              <Text style={styles.meta}>{user?.email ?? "Email nao disponivel"}</Text>
              <Text style={styles.meta}>{occupationLabel}</Text>
            </View>
          </View>

          <Pressable style={({ pressed }) => [styles.editButton, pressed && styles.buttonPressed]} onPress={() => setEditVisible(true)}>
            <Text style={styles.editButtonText}>Editar perfil</Text>
          </Pressable>
        </SectionCard>

        <SectionCard title="Conta" subtitle="Informacoes atuais do login.">
          <View style={styles.infoList}>
            <Text style={styles.infoRow}>Nome: {fullName}</Text>
            <Text style={styles.infoRow}>Email: {user?.email ?? "Email nao disponivel"}</Text>
            <Text style={styles.infoRow}>Ocupacao: {occupationLabel}</Text>
          </View>
        </SectionCard>
      </AppScreen>

      <Modal transparent animationType="fade" visible={editVisible} onRequestClose={() => setEditVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setEditVisible(false)}>
          <Pressable style={styles.modalCard} onPress={() => undefined}>
            <Text style={styles.modalTitle}>Editar perfil</Text>

            <View style={styles.modalAvatarArea}>
              <Pressable style={({ pressed }) => [styles.photoButton, pressed && styles.buttonPressed]} onPress={() => void pickAvatarFromGallery()}>
                <Text style={styles.photoButtonText}>{draftAvatar ? "Trocar foto" : "Escolher foto"}</Text>
              </Pressable>

              <View style={styles.previewBlock}>
                <Text style={styles.previewLabel}>Preview da foto</Text>
                {draftAvatar ? (
                  <Pressable onPress={() => void handleOpenAvatar()} onLongPress={() => setConfirmRemoveAvatar(true)} delayLongPress={3000}>
                    <View style={styles.avatarShellLarge}>
                      <Image source={{ uri: draftAvatar }} style={styles.avatarImage} />
                    </View>
                  </Pressable>
                ) : (
                  <View style={styles.emptyPreviewBox}>
                    <Text style={styles.emptyPreviewText}>Nenhuma foto selecionada.</Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.formBlock}>
              <Text style={styles.formLabel}>Nome</Text>
              <TextInput style={styles.formInput} value={draftName} onChangeText={setDraftName} placeholder="Nome completo" placeholderTextColor={colors.textMuted} />
            </View>

            <View style={styles.formBlock}>
              <Text style={styles.formLabel}>Email</Text>
              <View style={styles.readonlyBox}>
                <Text style={styles.readonlyText}>{user?.email ?? "Email nao disponivel"}</Text>
              </View>
            </View>

            <View style={styles.formBlock}>
              <Text style={styles.formLabel}>Ocupacao</Text>
              <View style={styles.readonlyBox}>
                <Text style={styles.readonlyText}>{occupationLabel}</Text>
              </View>
            </View>

            <View style={styles.modalActions}>
              <Pressable style={({ pressed }) => [styles.cancelButton, pressed && styles.buttonPressed]} onPress={() => setEditVisible(false)}>
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </Pressable>

              <Pressable style={({ pressed }) => [styles.saveButton, (saving || pressed) && styles.buttonPressed]} onPress={() => void handleSaveProfile()}>
                {saving ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.saveButtonText}>Salvar</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal transparent animationType="fade" visible={confirmRemoveAvatar} onRequestClose={() => setConfirmRemoveAvatar(false)}>
        <View style={styles.confirmBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setConfirmRemoveAvatar(false)} />
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Excluir foto?</Text>
            <Text style={styles.confirmText}>Deseja remover a foto selecionada do perfil?</Text>
            <View style={styles.confirmActions}>
              <Pressable style={styles.confirmCancel} onPress={() => setConfirmRemoveAvatar(false)}>
                <Text style={styles.confirmCancelText}>Nao</Text>
              </Pressable>
              <Pressable
                style={styles.confirmAccept}
                onPress={() => {
                  setDraftAvatar("");
                  setConfirmRemoveAvatar(false);
                }}
              >
                <Text style={styles.confirmAcceptText}>Sim</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatarShell: {
    width: 72,
    height: 72,
    borderRadius: 24,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarText: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.primary,
  },
  profileCopy: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
  },
  meta: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
  infoList: {
    gap: 10,
  },
  infoRow: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  editButton: {
    marginTop: 16,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: colors.primary,
  },
  editButtonText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: "800",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(31, 28, 23, 0.42)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    gap: 16,
    borderRadius: 24,
    padding: 18,
    backgroundColor: colors.surface,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
  },
  modalAvatarArea: {
    alignItems: "stretch",
    gap: 12,
  },
  avatarShellLarge: {
    width: 92,
    height: 92,
    borderRadius: 28,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  avatarTextLarge: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.primary,
  },
  photoButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.surfaceMuted,
  },
  photoButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  previewBlock: {
    gap: 8,
    alignItems: "center",
  },
  previewLabel: {
    alignSelf: "flex-start",
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
  },
  emptyPreviewBox: {
    width: "100%",
    minHeight: 92,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  emptyPreviewText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  formBlock: {
    gap: 8,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  formInput: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  readonlyBox: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  readonlyText: {
    fontSize: 15,
    color: colors.textMuted,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
  },
  confirmBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(31, 28, 23, 0.24)",
    paddingHorizontal: 20,
  },
  confirmCard: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 18,
    backgroundColor: colors.surface,
    padding: 18,
    gap: 12,
  },
  confirmTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
  },
  confirmText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
    textAlign: "center",
  },
  confirmActions: {
    flexDirection: "row",
    gap: 10,
  },
  confirmCancel: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surfaceMuted,
    paddingVertical: 12,
    alignItems: "center",
  },
  confirmCancelText: {
    color: colors.text,
    fontWeight: "700",
  },
  confirmAccept: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: colors.danger,
    paddingVertical: 12,
    alignItems: "center",
  },
  confirmAcceptText: {
    color: colors.surface,
    fontWeight: "800",
  },
  cancelButton: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
  },
  cancelButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  saveButton: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: colors.primary,
  },
  saveButtonText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: "800",
  },
  buttonPressed: {
    opacity: 0.82,
  },
});

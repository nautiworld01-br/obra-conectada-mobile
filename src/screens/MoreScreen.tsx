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
import { deleteFileFromStorage } from "../lib/storageUpload";
import { supabase } from "../lib/supabase";

/**
 * Tela de Perfil (Mais): Gestao de dados pessoais e foto de perfil do usuario.
 * future_fix: Adicionar botao de 'Excluir Conta' conforme diretrizes da Apple/Google.
 */
export function MoreScreen() {
  const queryClient = useQueryClient();
  const { user, signOut } = useAuth();
  const { fullName, avatarUrl, occupationLabel, initials } = useProfile();
  const [editVisible, setEditVisible] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftAvatar, setDraftAvatar] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmRemoveAvatar, setConfirmRemoveAvatar] = useState(false);

  // Sincroniza estado com dados reais ao abrir modal de edicao.
  useEffect(() => {
    if (editVisible) {
      setDraftName(fullName);
      setDraftAvatar(avatarUrl || "");
      setConfirmRemoveAvatar(false);
    }
  }, [avatarUrl, editVisible, fullName]);

  /**
   * Dispara seletor de imagem nativo para trocar a foto de perfil.
   */
  const pickAvatarFromGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert("Galeria", "Permissao necessaria."); return; }
    
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], allowsEditing: true, quality: 0.9, aspect: [1, 1],
    });

    if (!result.canceled && result.assets.length) {
      setDraftAvatar(result.assets[0].uri);
    }
  };

  /**
   * Salva as alteracoes de perfil no Storage e no Banco (Tabela profiles).
   * future_fix: Sincronizar 'full_name' com o Auth do Supabase para evitar divergencia.
   */
  const handleSaveProfile = async () => {
    if (!supabase || !user) return;
    if (!draftName.trim()) { Alert.alert("Perfil", "Informe o nome."); return; }
    setSaving(true);
    try {
      // Se a foto mudou, deletamos a antiga antes de subir a nova para economizar espaco.
      if (draftAvatar !== avatarUrl) {
        await deleteFileFromStorage("app-media", avatarUrl);
      }

      const uploadedUrl = await uploadAppMediaIfNeeded({
        uri: draftAvatar.trim() || null,
        pathPrefix: `users/${user.id}/avatar`,
        fileBaseName: "profile_avatar",
      });

      // Sincroniza tambem o full_name no Auth Metadata para consistencia
      await supabase.auth.updateUser({ data: { full_name: draftName.trim() } });
      
      await supabase.from("profiles").upsert({ id: user.id, full_name: draftName.trim(), avatar_url: uploadedUrl });
      await queryClient.invalidateQueries({ queryKey: ["profile", user.id] });
      setEditVisible(false);
    } catch (e) { Alert.alert("Erro", "Falha ao salvar perfil."); }
    finally { setSaving(false); }
  };

  /**
   * Executa a exclusao definitiva da conta do usuario.
   * future_fix: Adicionar logica para verificar se o usuario e o UNICO proprietario de uma obra antes de permitir exclusao.
   */
  const handleDeleteAccount = () => {
    Alert.alert(
      "Excluir conta?",
      "Esta acao e IRREVERSIVEL. Todos os seus dados pessoais e acesso a obra serao removidos.",
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Excluir Definitivamente", 
          style: "destructive", 
          onPress: async () => {
            if (!supabase) return;
            const { error } = await supabase.rpc("delete_user_account");
            if (error) {
              Alert.alert("Erro ao excluir", "Nao foi possivel remover sua conta agora. Tente novamente mais tarde.");
            } else {
              await signOut();
            }
          } 
        },
      ]
    );
  };

  return (
    <>
      <AppScreen title="Perfil" subtitle="Seus dados pessoais.">
        <SectionCard title="Usuario" subtitle="Resumo da conta.">
          <View style={styles.profileRow}>
            <View style={styles.avatarShell}>{avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{initials}</Text>}</View>
            <View style={styles.profileCopy}><Text style={styles.name}>{fullName}</Text><Text style={styles.meta}>{user?.email}</Text><Text style={styles.meta}>{occupationLabel}</Text></View>
          </View>
          <View style={styles.profileActions}>
            <Pressable style={styles.editButton} onPress={() => setEditVisible(true)}><Text style={styles.editButtonText}>Editar perfil</Text></Pressable>
            <Pressable style={styles.deleteAccountButton} onPress={handleDeleteAccount}><Text style={styles.deleteAccountText}>Excluir conta</Text></Pressable>
          </View>
        </SectionCard>
      </AppScreen>

      <Modal transparent animationType="fade" visible={editVisible} onRequestClose={() => setEditVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setEditVisible(false)}>
          <Pressable style={styles.modalCard} onPress={() => undefined}>
            <Text style={styles.modalTitle}>Editar perfil</Text>
            <View style={styles.modalAvatarArea}>
              <Pressable style={styles.photoButton} onPress={() => void pickAvatarFromGallery()}><Text style={styles.photoButtonText}>Trocar foto</Text></Pressable>
              <View style={styles.avatarShellLarge}>{draftAvatar ? <Image source={{ uri: draftAvatar }} style={styles.avatarImage} /> : <Text style={styles.avatarTextLarge}>{initials}</Text>}</View>
            </View>
            <View style={styles.formBlock}><Text style={styles.formLabel}>Nome</Text><TextInput style={styles.formInput} value={draftName} onChangeText={setDraftName} placeholder="Nome completo" /></View>
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelButton} onPress={() => setEditVisible(false)}><Text>Cancelar</Text></Pressable>
              <Pressable style={styles.saveButton} onPress={() => void handleSaveProfile()}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Salvar</Text>}</Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  profileRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatarShell: { width: 72, height: 72, borderRadius: 24, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  avatarImage: { width: "100%", height: "100%" },
  avatarText: { fontSize: 22, fontWeight: "800", color: colors.primary },
  profileCopy: { flex: 1, gap: 4 },
  name: { fontSize: 22, fontWeight: "800", color: colors.text },
  meta: { fontSize: 14, color: colors.textMuted },
  profileActions: { gap: 10, marginTop: 20 },
  editButton: { borderRadius: 16, paddingVertical: 14, alignItems: "center", backgroundColor: colors.primary },
  editButtonText: { color: colors.surface, fontSize: 15, fontWeight: "800" },
  deleteAccountButton: { paddingVertical: 10, alignItems: "center" },
  deleteAccountText: { color: colors.danger, fontSize: 13, fontWeight: "600" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(31, 28, 23, 0.42)", alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  modalCard: { width: "100%", maxWidth: 360, gap: 16, borderRadius: 24, padding: 18, backgroundColor: colors.surface },
  modalTitle: { fontSize: 20, fontWeight: "800", color: colors.text, textAlign: "center" },
  modalAvatarArea: { alignItems: "center", gap: 12 },
  avatarShellLarge: { width: 92, height: 92, borderRadius: 28, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  avatarTextLarge: { fontSize: 28, fontWeight: "800", color: colors.primary },
  photoButton: { borderRadius: 14, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.surfaceMuted },
  photoButtonText: { fontSize: 14, fontWeight: "700", color: colors.text },
  formBlock: { gap: 8 },
  formLabel: { fontSize: 14, fontWeight: "700", color: colors.text },
  formInput: { minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surfaceMuted, paddingHorizontal: 14, fontSize: 15 },
  modalActions: { flexDirection: "row", gap: 12 },
  cancelButton: { flex: 1, borderRadius: 16, paddingVertical: 14, alignItems: "center", backgroundColor: colors.surfaceMuted },
  saveButton: { flex: 1, borderRadius: 16, paddingVertical: 14, alignItems: "center", backgroundColor: colors.primary },
  saveButtonText: { color: colors.surface, fontSize: 15, fontWeight: "800" },
});

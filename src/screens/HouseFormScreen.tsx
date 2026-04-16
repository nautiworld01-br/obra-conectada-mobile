import * as ImagePicker from "expo-image-picker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppScreen } from "../components/AppScreen";
import { colors } from "../config/theme";
import { useAuth } from "../contexts/AuthContext";
import { useProfile } from "../hooks/useProfile";
import { useProject } from "../hooks/useProject";
import { uploadAppMediaIfNeeded } from "../lib/appMedia";
import { supabase } from "../lib/supabase";

type EmployeeRole = "empregada domestica" | "marinheiro";

type HouseEmployee = {
  id?: string;
  full_name: string;
  role: EmployeeRole;
  photo: string;
};

type RoomItem = {
  id?: string;
  name: string;
};

const occupationOptions: { value: EmployeeRole; label: string }[] = [
  { value: "empregada domestica", label: "Empregada domestica" },
  { value: "marinheiro", label: "Marinheiro" },
];

/**
 * Auxiliares de formatacao e inicializacao.
 */
function initialsFromName(name: string) {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return "OC";
  return tokens.slice(0, 2).map((t) => t[0]?.toUpperCase() ?? "").join("");
}

function buildEmployeeDraft(employee?: HouseEmployee | null): HouseEmployee {
  return {
    id: employee?.id,
    full_name: employee?.full_name ?? "",
    role: employee?.role ?? "empregada domestica",
    photo: employee?.photo ?? "",
  };
}

/**
 * Tela de Cadastro da Casa: Define os detalhes físicos da obra e a equipe fixa (Marinheiro/Empregada).
 * future_fix: Implementar ordenacao de comodos por 'drag and drop' no mobile.
 */
export function HouseFormScreen() {
  const queryClient = useQueryClient();
  const { project, isLoading: projectLoading } = useProject();
  const { user } = useAuth();
  const { isOwner } = useProfile();
  
  const [houseName, setHouseName] = useState("");
  const [address, setAddress] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [removedRoomIds, setRemovedRoomIds] = useState<string[]>([]);
  const [roomModalVisible, setRoomModalVisible] = useState(false);
  const [roomDraft, setRoomDraft] = useState("");
  const [observations, setObservations] = useState("");
  const [employees, setEmployees] = useState<HouseEmployee[]>([]);
  const [removedEmployeeIds, setRemovedEmployeeIds] = useState<string[]>([]);
  const [employeeDraft, setEmployeeDraft] = useState<HouseEmployee>(buildEmployeeDraft());
  const [employeeFormVisible, setEmployeeFormVisible] = useState(true);
  const [occupationMenuOpen, setOccupationMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingPreviewRemoval, setPendingPreviewRemoval] = useState<"house" | "employee" | null>(null);

  /**
   * Busca funcionarios fixos (empregada/marinheiro) vinculados ao projeto.
   */
  const employeesQuery = useQuery({
    queryKey: ["house-employees", project?.id],
    enabled: Boolean(project?.id && supabase),
    queryFn: async (): Promise<HouseEmployee[]> => {
      const { data, error } = await supabase!.from("employees").select("id, full_name, role, photo").eq("project_id", project!.id).order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((item) => ({ id: item.id, full_name: item.full_name, role: item.role as EmployeeRole, photo: item.photo ?? "" }));
    },
  });

  /**
   * Busca os comodos/espacos cadastrados para a casa.
   */
  const roomsQuery = useQuery({
    queryKey: ["house-rooms", project?.id],
    enabled: Boolean(project?.id && supabase),
    queryFn: async (): Promise<RoomItem[]> => {
      const { data, error } = await supabase!.from("rooms").select("id, name").eq("project_id", project!.id).order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((item) => ({ id: item.id, name: item.name }));
    },
  });

  // Sincroniza dados do projeto com o estado local.
  useEffect(() => {
    setHouseName(project?.name ?? "");
    setAddress(project?.address ?? "");
    setPhotoUrl(project?.photo_url ?? "");
    setObservations(project?.observations ?? "");
  }, [project]);

  useEffect(() => {
    if (roomsQuery.data) setRooms(roomsQuery.data);
    if (employeesQuery.data) {
      setEmployees(employeesQuery.data);
      setEmployeeFormVisible(employeesQuery.data.length === 0);
    }
  }, [roomsQuery.data, employeesQuery.data]);

  /**
   * Lida com a selecao de imagens da galeria para casa ou funcionarios.
   */
  const pickImage = async (type: "house" | "employee") => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, quality: 0.9, aspect: [1, 1] });
    if (!result.canceled && result.assets.length) {
      const uri = result.assets[0].uri;
      if (type === "house") setPhotoUrl(uri);
      else setEmployeeDraft((c) => ({ ...c, photo: uri }));
    }
  };

  /**
   * Salva as informacoes completas (Projeto, Comodos e Funcionarios) em lote.
   * future_fix: Adicionar transacao SQL (RPC) para garantir que todos os dados salvem ou falhem juntos.
   */
  const handleSaveHouse = async () => {
    if (!supabase || !user || !isOwner) return;
    setSaving(true);
    try {
      let projectId = project?.id ?? null;
      const uploadedHousePhoto = await uploadAppMediaIfNeeded({ uri: photoUrl, pathPrefix: projectId ? `projects/${projectId}/house` : `users/${user.id}/draft`, fileBaseName: "house_cover" });
      const payload = { name: houseName.trim(), address, photo_url: uploadedHousePhoto, observations };
      
      // Upsert do Projeto e Membro Proprietario se for novo.
      if (projectId) await supabase.from("projects").update(payload).eq("id", projectId);
      else {
        const { data: nProject } = await supabase.from("projects").insert({ ...payload, owner_id: user.id }).select("id").single();
        projectId = nProject.id;
        await supabase.from("project_members").insert({ project_id: projectId, user_id: user.id, role: "proprietario" });
      }

      // Sincroniza Funcionarios e Comodos (Delete removidos + Upsert atuais).
      if (removedEmployeeIds.length) await supabase.from("employees").delete().in("id", removedEmployeeIds);
      if (removedRoomIds.length) await supabase.from("rooms").delete().in("id", removedRoomIds);
      
      for (const emp of employees) {
        const upPhoto = await uploadAppMediaIfNeeded({ uri: emp.photo, pathPrefix: `projects/${projectId}/employees`, fileBaseName: `emp_${emp.id ?? "new"}` });
        const p = { project_id: projectId, full_name: emp.full_name, role: emp.role, photo: upPhoto, status: "ativo" };
        if (emp.id) await supabase.from("employees").update(p).eq("id", emp.id);
        else await supabase.from("employees").insert(p);
      }

      for (const [i, r] of rooms.entries()) {
        const p = { project_id: projectId, name: r.name, display_order: i };
        if (r.id) await supabase.from("rooms").update(p).eq("id", r.id);
        else await supabase.from("rooms").insert(p);
      }

      await queryClient.invalidateQueries({ queryKey: ["project", user.id] });
      Alert.alert("Sucesso", "Dados da casa salvos.");
    } catch (e) { Alert.alert("Erro", "Falha ao salvar casa."); }
    finally { setSaving(false); }
  };

  if (projectLoading) return <View style={styles.loadingState}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <>
      <AppScreen title="Casa" subtitle="Configuracoes fisicas e equipe fixa da obra.">
        <View style={styles.formCard}>
          <View style={styles.photoBlock}>
            <View style={styles.houseAvatar}>{photoUrl ? <Image source={{ uri: photoUrl }} style={styles.houseAvatarImage} /> : <Text style={styles.houseAvatarText}>{initialsFromName(houseName)}</Text>}</View>
            <View style={styles.photoCopy}><Text style={styles.sectionTitle}>Foto da capa</Text><Pressable onPress={() => void pickImage("house")}><Text style={styles.linkButtonText}>Trocar foto</Text></Pressable></View>
          </View>
          <View style={styles.fieldBlock}><Text style={styles.fieldLabel}>Nome da casa *</Text><TextInput style={[styles.fieldInput, styles.primaryInput]} value={houseName} onChangeText={setHouseName} placeholder="Ex: Casa do Lago" /></View>
          <View style={styles.fieldBlock}><Text style={styles.fieldLabel}>Comodos</Text>
            <View style={styles.roomList}>
              {rooms.map((r) => (<View key={r.id ?? r.name} style={styles.roomChip}><Text style={styles.roomChipText}>{r.name}</Text><Pressable onPress={() => setRooms(c => c.filter(i => i !== r))}><Text>×</Text></Pressable></View>))}
              <Pressable style={styles.inlineAddButton} onPress={() => setRoomModalVisible(true)}><Text style={styles.inlineAddButtonText}>+ Adicionar</Text></Pressable>
            </View>
          </View>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Equipe Fixa</Text>
          {employees.map((e) => (
            <View key={e.id ?? e.full_name} style={styles.employeeCard}>
              <View style={styles.employeeRow}><View style={styles.employeeAvatar}>{e.photo ? <Image source={{ uri: e.photo }} style={styles.houseAvatarImage} /> : <Text>{initialsFromName(e.full_name)}</Text>}</View><View><Text style={styles.employeeName}>{e.full_name}</Text><Text style={styles.employeeRole}>{e.role}</Text></View></View>
              <Pressable onPress={() => setEmployees(c => c.filter(i => i !== e))}><Text style={{color: colors.danger}}>Remover</Text></Pressable>
            </View>
          ))}
          {employeeFormVisible && (
            <View style={styles.employeeFormCard}>
              <TextInput style={styles.fieldInput} value={employeeDraft.full_name} onChangeText={v => setEmployeeDraft(c => ({...c, full_name: v}))} placeholder="Nome do funcionario" />
              <Pressable style={styles.primaryButton} onPress={() => { setEmployees(c => [...c, employeeDraft]); setEmployeeFormVisible(false); }}><Text style={styles.primaryButtonText}>Adicionar</Text></Pressable>
            </View>
          )}
          {!employeeFormVisible && <Pressable onPress={() => { setEmployeeDraft(buildEmployeeDraft()); setEmployeeFormVisible(true); }}><Text style={styles.linkButtonText}>+ Novo funcionario</Text></Pressable>}
        </View>

        <Pressable style={({ pressed }) => [styles.saveButton, (saving || pressed) && styles.buttonPressed]} onPress={() => void handleSaveHouse()}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Salvar tudo</Text>}
        </Pressable>
      </AppScreen>

      <Modal transparent visible={roomModalVisible} onRequestClose={() => setRoomModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.popupCard}><Text style={styles.popupTitle}>Novo comodo</Text><TextInput style={styles.fieldInput} value={roomDraft} onChangeText={setRoomDraft} autoFocus /><Pressable style={styles.primaryButton} onPress={() => { setRooms(c => [...c, { name: roomDraft }]); setRoomDraft(""); setRoomModalVisible(false); }}><Text style={styles.primaryButtonText}>Criar</Text></Pressable></View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  formCard: { gap: 16, padding: 18, borderRadius: 24, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface, marginBottom: 16 },
  photoBlock: { flexDirection: "row", alignItems: "center", gap: 14 },
  houseAvatar: { width: 72, height: 72, borderRadius: 24, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  houseAvatarImage: { width: "100%", height: "100%" },
  houseAvatarText: { fontSize: 24, fontWeight: "800", color: colors.primary },
  photoCopy: { flex: 1, gap: 4 },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  fieldBlock: { gap: 8 },
  fieldLabel: { fontSize: 14, fontWeight: "700", color: colors.text },
  fieldInput: { minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surfaceMuted, paddingHorizontal: 16, fontSize: 15 },
  primaryInput: { borderColor: colors.primary },
  roomList: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  roomChip: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: colors.surfaceMuted },
  roomChipText: { fontSize: 14, fontWeight: "600" },
  inlineAddButton: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.primarySoft },
  inlineAddButtonText: { fontSize: 12, fontWeight: "700", color: colors.primary },
  employeeCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12, borderRadius: 16, backgroundColor: colors.surfaceMuted },
  employeeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  employeeAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#ddd", alignItems: "center", justifyContent: "center" },
  employeeName: { fontWeight: "700" },
  employeeRole: { fontSize: 12, color: colors.textMuted },
  employeeFormCard: { gap: 10, padding: 12, borderRadius: 16, backgroundColor: "#f9f9f9" },
  primaryButton: { paddingVertical: 12, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontWeight: "800" },
  linkButtonText: { color: colors.primary, fontWeight: "700" },
  saveButton: { borderRadius: 18, paddingVertical: 16, alignItems: "center", backgroundColor: colors.primary },
  saveButtonText: { fontSize: 16, fontWeight: "800", color: "#fff" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  popupCard: { width: "80%", padding: 20, borderRadius: 20, backgroundColor: "#fff", gap: 16 },
  popupTitle: { fontSize: 18, fontWeight: "800" },
  buttonPressed: { opacity: 0.8 },
});

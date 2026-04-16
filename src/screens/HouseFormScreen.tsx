import * as ImagePicker from "expo-image-picker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { deleteFileFromStorage } from "../lib/storageUpload";
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

function initialsFromName(name: string) {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return "OC";
  return tokens.slice(0, 2).map((t) => t[0]?.toUpperCase() ?? "").join("");
}

/**
 * Tela de Configuração da Casa (Refatorada para RPC).
 * future_fix: Adicionar compressao de imagem para economizar storage no upload da capa.
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
  const [roomModalVisible, setRoomModalVisible] = useState(false);
  const [roomDraft, setRoomDraft] = useState("");
  const [observations, setObservations] = useState("");
  const [employees, setEmployees] = useState<HouseEmployee[]>([]);
  const [employeeFormVisible, setEmployeeFormVisible] = useState(false);
  const [employeeDraft, setEmployeeDraft] = useState<HouseEmployee>({ full_name: "", role: "empregada domestica", photo: "" });
  const [saving, setSaving] = useState(false);

  // Queries para buscar dados iniciais
  const employeesQuery = useQuery({
    queryKey: ["house-employees", project?.id],
    enabled: Boolean(project?.id && supabase),
    queryFn: async () => {
      const { data, error } = await supabase!.from("employees").select("id, full_name, role, photo").eq("project_id", project!.id);
      if (error) throw error;
      return data;
    },
  });

  const roomsQuery = useQuery({
    queryKey: ["house-rooms", project?.id],
    enabled: Boolean(project?.id && supabase),
    queryFn: async () => {
      const { data, error } = await supabase!.from("rooms").select("id, name").eq("project_id", project!.id).order("display_order");
      if (error) throw error;
      return data;
    },
  });

  // Sincroniza dados com o estado local
  useEffect(() => {
    if (project) {
      setHouseName(project.name ?? "");
      setAddress(project.address ?? "");
      setPhotoUrl(project.photo_url ?? "");
      setObservations(project.observations ?? "");
    }
  }, [project]);

  useEffect(() => {
    if (roomsQuery.data) setRooms(roomsQuery.data);
    if (employeesQuery.data) setEmployees(employeesQuery.data as any);
  }, [roomsQuery.data, employeesQuery.data]);

  const pickImage = async (type: "house" | "employee") => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, quality: 0.8, aspect: [1, 1] });
    if (!res.canceled) {
      if (type === "house") setPhotoUrl(res.assets[0].uri);
      else setEmployeeDraft(c => ({ ...c, photo: res.assets[0].uri }));
    }
  };

  /**
   * SALVAMENTO UNIFICADO VIA RPC (Database Transaction).
   * Envia projeto, comodos e funcionarios em uma única chamada.
   */
  const handleSaveAll = async () => {
    if (!isOwner || !user || !supabase) return;
    setSaving(true);
    try {
      // 1. Limpeza e Upload da foto da capa se mudou
      if (photoUrl !== project?.photo_url) {
        await deleteFileFromStorage("app-media", project?.photo_url);
      }
      
      const finalPhotoUrl = await uploadAppMediaIfNeeded({
        uri: photoUrl,
        pathPrefix: project?.id ? `projects/${project.id}/house` : `users/${user.id}/temp`,
        fileBaseName: "house_cover"
      });

      // 2. Upload das fotos dos funcionários que mudaram
      const processedEmployees = await Promise.all(employees.map(async (emp) => {
        // Encontra a foto antiga para deletar se ela mudou
        const oldEmp = (employeesQuery.data as any[])?.find(e => e.id === emp.id);
        if (emp.photo !== oldEmp?.photo) {
          await deleteFileFromStorage("app-media", oldEmp?.photo);
        }

        const upPhoto = await uploadAppMediaIfNeeded({
          uri: emp.photo,
          pathPrefix: project?.id ? `projects/${project.id}/employees` : `users/${user.id}/temp`,
          fileBaseName: `emp_${emp.full_name.replace(/\s/g, "_")}`
        });
        return { ...emp, photo: upPhoto };
      }));

      // 3. Chamada RPC Unificada (Tudo ou Nada)
      const { data: newProjectId, error } = await supabase.rpc("upsert_full_project", {
        p_project_id: project?.id || null,
        p_user_id: user.id,
        p_name: houseName.trim(),
        p_address: address.trim(),
        p_photo_url: finalPhotoUrl,
        p_observations: observations,
        p_rooms: rooms,
        p_employees: processedEmployees
      });

      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ["project"] });
      Alert.alert("Sucesso", "Configurações da casa salvas com segurança.");
    } catch (e) {
      console.error(e);
      Alert.alert("Erro", "Falha ao sincronizar dados da casa.");
    } finally {
      setSaving(false);
    }
  };

  if (projectLoading) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <>
      <AppScreen title="Casa" subtitle="Defina os detalhes da obra e a equipe fixa.">
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View style={styles.houseThumb}>{photoUrl ? <Image source={{ uri: photoUrl }} style={styles.img} /> : <Text style={styles.initials}>{initialsFromName(houseName)}</Text>}</View>
            <View style={styles.headerInfo}><Text style={styles.cardTitle}>Dados da Obra</Text><Pressable onPress={() => pickImage("house")}><Text style={styles.linkText}>Alterar foto da capa</Text></Pressable></View>
          </View>
          <View style={styles.field}><Text style={styles.label}>Nome da Casa *</Text><TextInput style={styles.input} value={houseName} onChangeText={setHouseName} placeholder="Ex: Casa de Campo" /></View>
          <View style={styles.field}><Text style={styles.label}>Endereço</Text><TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="Rua, Numero, Bairro" /></View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Cômodos e Áreas</Text>
          <View style={styles.roomList}>
            {rooms.map((r, i) => (<View key={i} style={styles.chip}><Text style={styles.chipText}>{r.name}</Text><Pressable onPress={() => setRooms(c => c.filter((_, idx) => idx !== i))}><Text style={styles.chipClose}>×</Text></Pressable></View>))}
            <Pressable style={styles.addChip} onPress={() => setRoomModalVisible(true)}><Text style={styles.addChipText}>+ Comodo</Text></Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Equipe Fixa (Marinheiro / Empregada)</Text>
          {employees.map((e, i) => (
            <View key={i} style={styles.empRow}>
              <View style={styles.empAvatar}>{e.photo ? <Image source={{ uri: e.photo }} style={styles.img} /> : <Text>{initialsFromName(e.full_name)}</Text>}</View>
              <View style={{flex: 1}}><Text style={styles.empName}>{e.full_name}</Text><Text style={styles.empRole}>{e.role}</Text></View>
              <Pressable onPress={() => setEmployees(c => c.filter((_, idx) => idx !== i))}><Text style={styles.dangerText}>Remover</Text></Pressable>
            </View>
          ))}
          {!employeeFormVisible ? (
            <Pressable style={styles.addLink} onPress={() => setEmployeeFormVisible(true)}><Text style={styles.linkText}>+ Adicionar membro à equipe</Text></Pressable>
          ) : (
            <View style={styles.empForm}>
              <TextInput style={styles.input} value={employeeDraft.full_name} onChangeText={v => setEmployeeDraft(c => ({...c, full_name: v}))} placeholder="Nome completo" />
              <View style={styles.row}>
                <Pressable style={[styles.roleBtn, employeeDraft.role === "marinheiro" && styles.roleBtnActive]} onPress={() => setEmployeeDraft(c => ({...c, role: "marinheiro"}))}><Text style={employeeDraft.role === "marinheiro" && {color: "#fff"}}>Marinheiro</Text></Pressable>
                <Pressable style={[styles.roleBtn, employeeDraft.role === "empregada domestica" && styles.roleBtnActive]} onPress={() => setEmployeeDraft(c => ({...c, role: "empregada domestica"}))}><Text style={employeeDraft.role === "empregada domestica" && {color: "#fff"}}>Empregada</Text></Pressable>
              </View>
              <Pressable style={styles.confirmBtn} onPress={() => { if (employeeDraft.full_name) { setEmployees(c => [...c, employeeDraft]); setEmployeeFormVisible(false); setEmployeeDraft({full_name: "", role: "empregada domestica", photo: ""}); } }}><Text style={styles.confirmBtnText}>Confirmar</Text></Pressable>
            </View>
          )}
        </View>

        <Pressable style={({ pressed }) => [styles.saveBtn, (saving || pressed) && styles.btnPressed]} onPress={handleSaveAll} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Salvar Configurações</Text>}
        </Pressable>
      </AppScreen>

      <Modal transparent visible={roomModalVisible} animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.popup}>
            <Text style={styles.popupTitle}>Nome do Cômodo</Text>
            <TextInput style={styles.input} value={roomDraft} onChangeText={setRoomDraft} autoFocus />
            <View style={styles.row}>
              <Pressable style={styles.cancelBtn} onPress={() => setRoomModalVisible(false)}><Text>Cancelar</Text></Pressable>
              <Pressable style={styles.confirmBtn} onPress={() => { if (roomDraft) { setRooms(c => [...c, { name: roomDraft.trim() }]); setRoomDraft(""); setRoomModalVisible(false); } }}><Text style={styles.confirmBtnText}>Adicionar</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: "#fff", borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.cardBorder, gap: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  houseThumb: { width: 64, height: 64, borderRadius: 16, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  img: { width: "100%", height: "100%" },
  initials: { fontSize: 20, fontWeight: "800", color: colors.primary },
  headerInfo: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  linkText: { color: colors.primary, fontWeight: "700", fontSize: 14 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: "700", color: colors.textMuted },
  input: { backgroundColor: colors.surfaceMuted, borderRadius: 12, padding: 14, fontSize: 15, borderWidth: 1, borderColor: colors.cardBorder },
  roomList: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surfaceMuted, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder },
  chipText: { fontSize: 14, fontWeight: "600" },
  chipClose: { fontSize: 18, color: colors.danger, marginLeft: 4 },
  addChip: { backgroundColor: colors.primarySoft, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  addChipText: { color: colors.primary, fontWeight: "700", fontSize: 14 },
  empRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#eee" },
  empAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#eee", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  empName: { fontWeight: "700", fontSize: 14 },
  empRole: { fontSize: 12, color: colors.textMuted },
  dangerText: { color: colors.danger, fontSize: 13, fontWeight: "600" },
  addLink: { marginTop: 8 },
  empForm: { backgroundColor: "#f9f9f9", padding: 12, borderRadius: 16, gap: 10, marginTop: 10 },
  row: { flexDirection: "row", gap: 10 },
  roleBtn: { flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: "#ddd", alignItems: "center" },
  roleBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  confirmBtn: { backgroundColor: colors.primary, padding: 12, borderRadius: 12, alignItems: "center" },
  confirmBtnText: { color: "#fff", fontWeight: "800" },
  cancelBtn: { flex: 1, padding: 12, alignItems: "center" },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 18, paddingVertical: 16, alignItems: "center", marginTop: 10, marginBottom: 30 },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  btnPressed: { opacity: 0.8 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  popup: { width: "85%", backgroundColor: "#fff", borderRadius: 24, padding: 20, gap: 16 },
  popupTitle: { fontSize: 18, fontWeight: "800", textAlign: "center" }
});

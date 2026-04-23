import * as ImagePicker from "expo-image-picker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from "react-native-draggable-flatlist";
import Toast from "react-native-toast-message";
import { AppScreen } from "../components/AppScreen";
import { AppIcon } from "../components/AppIcon";
import { colors } from "../config/theme";
import { useAuth } from "../contexts/AuthContext";
import { useProfile } from "../hooks/useProfile";
import { useProject } from "../hooks/useProject";
import { uploadAppMediaIfNeeded } from "../lib/appMedia";
import { getErrorMessage } from "../lib/errorMessage";
import { withSchemaDriftContext } from "../lib/schemaDrift";
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
 * Tela de Configuração da Obra (Refatorada para RPC e Drag & Drop).
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
      if (error) throw withSchemaDriftContext(error, "consulta da tabela rooms na configuracao da obra");
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
   */
  const handleSaveAll = async () => {
    if (!isOwner || !user || !supabase) return;
    setSaving(true);
    try {
      if (photoUrl !== project?.photo_url) {
        await deleteFileFromStorage("app-media", project?.photo_url);
      }
      
      const finalPhotoUrl = await uploadAppMediaIfNeeded({
        uri: photoUrl,
        pathPrefix: project?.id ? `projects/${project.id}/house` : `users/${user.id}/temp`,
        fileBaseName: "house_cover"
      });

      const processedEmployees = await Promise.all(employees.map(async (emp) => {
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

      if (error) throw withSchemaDriftContext(error, "RPC upsert_full_project");

      await queryClient.invalidateQueries({ queryKey: ["project"] });
      await queryClient.invalidateQueries({ queryKey: ["house-rooms"] });
      await queryClient.invalidateQueries({ queryKey: ["rooms"] });
      await queryClient.invalidateQueries({ queryKey: ["house-employees"] });
      await queryClient.invalidateQueries({ queryKey: ["employees"] });
      Toast.show({
        type: "success",
        text1: "Configurações salvas",
        text2: "Os dados da obra e equipe foram sincronizados.",
      });
    } catch (e) {
      console.error(e);
      Alert.alert("Erro", getErrorMessage(e, "Falha ao sincronizar dados da obra."));
    } finally {
      setSaving(false);
    }
  };

  const renderRoomItem = useCallback(({ item, drag, isActive }: RenderItemParams<RoomItem>) => {
    return (
      <ScaleDecorator>
        <Pressable
          onLongPress={drag}
          disabled={isActive}
          style={[
            styles.roomListItem,
            isActive && { backgroundColor: colors.primarySoft, borderColor: colors.primary }
          ]}
        >
          <View style={styles.roomItemInfo}>
            <AppIcon name="GripVertical" size={20} color={colors.textMuted} />
            <Text style={styles.roomItemText}>{item.name}</Text>
          </View>
          <Pressable onPress={() => setRooms(c => c.filter(r => r.name !== item.name))}>
            <AppIcon name="Trash2" size={18} color={colors.danger} />
          </Pressable>
        </Pressable>
      </ScaleDecorator>
    );
  }, []);

  if (projectLoading) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <>
      <AppScreen title="Obra" subtitle="Defina os detalhes da obra e a equipe fixa.">
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View style={styles.houseThumb}>{photoUrl ? <Image source={{ uri: photoUrl }} style={styles.img} /> : <Text style={styles.initials}>{initialsFromName(houseName)}</Text>}</View>
            <View style={styles.headerInfo}><Text style={styles.cardTitle}>Dados da Obra</Text><Pressable onPress={() => pickImage("house")}><Text style={styles.linkText}>Alterar foto da capa</Text></Pressable></View>
          </View>
          <View style={styles.field}><Text style={styles.label}>Nome da Obra *</Text><TextInput style={styles.input} value={houseName} onChangeText={setHouseName} placeholder="Ex: Obra de Campo" /></View>
          <View style={styles.field}><Text style={styles.label}>Endereço</Text><TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="Rua, Número, Bairro" /></View>
        </View>

        <View style={[styles.card, { paddingBottom: 8 }]}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Cômodos e Áreas</Text>
            <Text style={styles.helperTextSmall}>Segure para ordenar</Text>
          </View>
          
          <View style={styles.roomContainer}>
            {rooms.length > 0 ? (
              <View style={{ maxHeight: 300 }}>
                <DraggableFlatList
                  data={rooms}
                  onDragEnd={({ data }) => setRooms(data)}
                  keyExtractor={(item) => item.name}
                  renderItem={renderRoomItem}
                  scrollEnabled={false}
                />
              </View>
            ) : (
              <Text style={styles.emptyText}>Nenhum cômodo adicionado.</Text>
            )}
            
            <Pressable style={styles.addRoomBtn} onPress={() => setRoomModalVisible(true)}>
              <AppIcon name="Plus" size={18} color={colors.primary} />
              <Text style={styles.addRoomBtnText}>Adicionar Cômodo</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Equipe Fixa (Marinheiro / Empregada)</Text>
          {employees.map((e, i) => (
            <View key={i} style={styles.empRow}>
              <View style={styles.empAvatar}>{e.photo ? <Image source={{ uri: e.photo }} style={styles.img} /> : <Text>{initialsFromName(e.full_name)}</Text>}</View>
              <View style={{flex: 1}}><Text style={styles.empName}>{e.full_name}</Text><Text style={styles.empRole}>{e.role}</Text></View>
              <Pressable onPress={() => setEmployees(c => c.filter((_, idx) => idx !== i))}>
                <AppIcon name="UserMinus" size={18} color={colors.danger} />
              </Pressable>
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
              <View style={styles.row}>
                <Pressable style={styles.cancelBtn} onPress={() => setEmployeeFormVisible(false)}><Text>Cancelar</Text></Pressable>
                <Pressable style={[styles.confirmBtn, { flex: 1 }]} onPress={() => { if (employeeDraft.full_name) { setEmployees(c => [...c, employeeDraft]); setEmployeeFormVisible(false); setEmployeeDraft({full_name: "", role: "empregada domestica", photo: ""}); } }}><Text style={styles.confirmBtnText}>Confirmar</Text></Pressable>
              </View>
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
            <TextInput style={styles.input} value={roomDraft} onChangeText={setRoomDraft} autoFocus placeholder="Ex: Sala de Estar" />
            <View style={styles.row}>
              <Pressable style={styles.cancelBtn} onPress={() => { setRoomModalVisible(false); setRoomDraft(""); }}><Text>Cancelar</Text></Pressable>
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
  cardHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
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
  roomContainer: { gap: 12 },
  roomListItem: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between", 
    backgroundColor: colors.surfaceMuted, 
    padding: 12, 
    borderRadius: 14, 
    borderWidth: 1, 
    borderColor: colors.cardBorder,
    marginBottom: 8
  },
  roomItemInfo: { flexDirection: "row", alignItems: "center", gap: 10 },
  roomItemText: { fontSize: 15, fontWeight: "600", color: colors.text },
  addRoomBtn: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "center", 
    gap: 8, 
    backgroundColor: colors.primarySoft, 
    padding: 12, 
    borderRadius: 14,
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: colors.primary
  },
  addRoomBtnText: { color: colors.primary, fontWeight: "700", fontSize: 14 },
  emptyText: { textAlign: "center", color: colors.textMuted, fontSize: 14, paddingVertical: 10 },
  helperTextSmall: { fontSize: 11, color: colors.textMuted },
  empRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#eee" },
  empAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#eee", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  empName: { fontWeight: "700", fontSize: 14 },
  empRole: { fontSize: 12, color: colors.textMuted },
  addLink: { marginTop: 8 },
  empForm: { backgroundColor: "#f9f9f9", padding: 12, borderRadius: 16, gap: 10, marginTop: 10 },
  row: { flexDirection: "row", gap: 10 },
  roleBtn: { flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: "#ddd", alignItems: "center" },
  roleBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  confirmBtn: { backgroundColor: colors.primary, padding: 12, borderRadius: 12, alignItems: "center" },
  confirmBtnText: { color: "#fff", fontWeight: "800" },
  cancelBtn: { flex: 1, padding: 12, alignItems: "center", justifyContent: "center" },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 18, paddingVertical: 16, alignItems: "center", marginTop: 10, marginBottom: 30 },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  btnPressed: { opacity: 0.8 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  popup: { width: "85%", backgroundColor: "#fff", borderRadius: 24, padding: 20, gap: 16 },
  popupTitle: { fontSize: 18, fontWeight: "800", textAlign: "center" }
});

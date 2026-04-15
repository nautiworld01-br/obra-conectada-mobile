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

function stringifyList(values: string[] | null | undefined) {
  return values && values.length ? values.join(", ") : "";
}

function parseList(value: string) {
  return value
    .split(/\r?\n|,/) 
    .map((item) => item.trim())
    .filter(Boolean);
}

function initialsFromName(name: string) {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) {
    return "OC";
  }

  return tokens.slice(0, 2).map((token) => token[0]?.toUpperCase() ?? "").join("");
}

function buildEmployeeDraft(employee?: HouseEmployee | null): HouseEmployee {
  return {
    id: employee?.id,
    full_name: employee?.full_name ?? "",
    role: employee?.role ?? "empregada domestica",
    photo: employee?.photo ?? "",
  };
}

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

  const employeesQuery = useQuery({
    queryKey: ["house-employees", project?.id],
    enabled: Boolean(project?.id && supabase),
    queryFn: async (): Promise<HouseEmployee[]> => {
      const { data, error } = await supabase!
        .from("employees")
        .select("id, full_name, role, photo")
        .eq("project_id", project!.id)
        .order("full_name", { ascending: true });

      if (error) {
        throw error;
      }

      return (data ?? []).map((item) => ({
        id: item.id,
        full_name: item.full_name,
        role: (item.role as EmployeeRole) || "empregada domestica",
        photo: item.photo ?? "",
      }));
    },
  });

  const roomsQuery = useQuery({
    queryKey: ["house-rooms", project?.id],
    enabled: Boolean(project?.id && supabase),
    queryFn: async (): Promise<RoomItem[]> => {
      const { data, error } = await supabase!
        .from("rooms")
        .select("id, name, display_order")
        .eq("project_id", project!.id)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) {
        throw error;
      }

      return (data ?? []).map((item) => ({
        id: item.id,
        name: item.name,
      }));
    },
  });

  useEffect(() => {
    setHouseName(project?.name ?? "");
    setAddress(project?.address ?? "");
    setPhotoUrl(project?.photo_url ?? "");
    setObservations(project?.observations ?? "");
  }, [project]);

  useEffect(() => {
    if (roomsQuery.data) {
      setRooms(roomsQuery.data);
      setRemovedRoomIds([]);
    } else if (!project?.id) {
      setRooms([]);
      setRemovedRoomIds([]);
    }
  }, [project?.id, roomsQuery.data]);

  useEffect(() => {
    if (employeesQuery.data) {
      setEmployees(employeesQuery.data);
      setRemovedEmployeeIds([]);
      setEmployeeFormVisible(employeesQuery.data.length === 0);
      setEmployeeDraft(buildEmployeeDraft());
    } else if (!project?.id) {
      setEmployees([]);
      setRemovedEmployeeIds([]);
      setEmployeeFormVisible(true);
      setEmployeeDraft(buildEmployeeDraft());
    }
  }, [employeesQuery.data, project?.id]);

  const employeeRoleLabel = useMemo(
    () => occupationOptions.find((option) => option.value === employeeDraft.role)?.label ?? "Empregada domestica",
    [employeeDraft.role],
  );

  const pickImageFromGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert("Galeria", "Permita o acesso a galeria para escolher uma foto.");
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.9,
      aspect: [1, 1],
    });

    if (result.canceled || !result.assets.length) {
      return null;
    }

    return result.assets[0].uri;
  };

  const handlePickHousePhoto = async () => {
    const selectedUri = await pickImageFromGallery();
    if (selectedUri) {
      setPhotoUrl(selectedUri);
    }
  };

  const handlePickEmployeePhoto = async () => {
    const selectedUri = await pickImageFromGallery();
    if (selectedUri) {
      setEmployeeDraft((current) => ({ ...current, photo: selectedUri }));
    }
  };

  const handleOpenPreview = async (uri: string) => {
    if (!uri.trim()) return;

    try {
      await Linking.openURL(uri.trim());
    } catch {
      Alert.alert("Imagem", "Nao foi possivel abrir a imagem.");
    }
  };

  const handleEmployeeSave = () => {
    if (!employeeDraft.full_name.trim()) {
      Alert.alert("Funcionario", "Informe o nome do funcionario.");
      return;
    }

    setEmployees((current) => {
      if (employeeDraft.id) {
        return current.map((item) => (item.id === employeeDraft.id ? { ...employeeDraft, full_name: employeeDraft.full_name.trim() } : item));
      }

      return [...current, { ...employeeDraft, full_name: employeeDraft.full_name.trim() }];
    });

    setEmployeeDraft(buildEmployeeDraft());
    setEmployeeFormVisible(false);
  };

  const handleEmployeeEdit = (employee: HouseEmployee) => {
    setEmployeeDraft(buildEmployeeDraft(employee));
    setEmployeeFormVisible(true);
  };

  const handleEmployeeRemove = (employee: HouseEmployee) => {
    setEmployees((current) => {
      const nextEmployees = current.filter((item) => item.id !== employee.id || item.full_name !== employee.full_name);
      if (!nextEmployees.length) {
        setEmployeeFormVisible(true);
      }
      return nextEmployees;
    });

    if (employee.id) {
      setRemovedEmployeeIds((current) => [...current, employee.id!]);
    }

    if (employeeDraft.id === employee.id) {
      setEmployeeDraft(buildEmployeeDraft());
      setEmployeeFormVisible(true);
    }
  };

  const handleSaveHouse = async () => {
    if (!supabase || !user) {
      Alert.alert("Casa", "Conecte o app ao Supabase para salvar a casa.");
      return;
    }

    if (!isOwner) {
      Alert.alert("Permissao", "Somente o proprietario pode configurar a casa.");
      return;
    }

    if (!houseName.trim()) {
      Alert.alert("Casa", "Informe o nome da casa.");
      return;
    }

    setSaving(true);

    try {
      let projectId = project?.id ?? null;
      const uploadedHousePhotoUrl = await uploadAppMediaIfNeeded({
        uri: photoUrl.trim() || null,
        pathPrefix: projectId ? `projects/${projectId}/house` : `users/${user.id}/draft-house`,
        fileBaseName: "house_cover",
      });

      const projectPayload = {
        name: houseName.trim(),
        address: address.trim() || null,
        photo_url: uploadedHousePhotoUrl,
        observations: observations.trim() || null,
      };

      if (projectId) {
        const { error } = await supabase.from("projects").update(projectPayload).eq("id", projectId);
        if (error) {
          throw error;
        }
      } else {
        const { data: createdProject, error: createProjectError } = await supabase
          .from("projects")
          .insert({ ...projectPayload, owner_id: user.id })
          .select("id")
          .single();

        if (createProjectError) {
          throw createProjectError;
        }

        projectId = createdProject.id;

        const { error: memberError } = await supabase.from("project_members").insert({
          project_id: projectId,
          user_id: user.id,
          role: "proprietario",
        });

        if (memberError) {
          throw memberError;
        }
      }

      if (removedEmployeeIds.length) {
        const { error: deleteError } = await supabase.from("employees").delete().in("id", removedEmployeeIds);
        if (deleteError) {
          throw deleteError;
        }
      }

      if (removedRoomIds.length) {
        const { error: deleteRoomsError } = await supabase.from("rooms").delete().in("id", removedRoomIds);
        if (deleteRoomsError) {
          throw deleteRoomsError;
        }
      }

      for (const employee of employees) {
        const uploadedEmployeePhotoUrl = await uploadAppMediaIfNeeded({
          uri: employee.photo.trim() || null,
          pathPrefix: `projects/${projectId}/employees`,
          fileBaseName: `${employee.full_name.trim().replace(/\s+/g, "_").toLowerCase()}_${employee.id ?? "new"}`,
        });

        const employeePayload = {
          project_id: projectId,
          full_name: employee.full_name.trim(),
          role: employee.role,
          photo: uploadedEmployeePhotoUrl,
          status: "ativo",
        };

        if (employee.id) {
          const { error: updateEmployeeError } = await supabase.from("employees").update(employeePayload).eq("id", employee.id);
          if (updateEmployeeError) {
            throw updateEmployeeError;
          }
        } else {
          const { error: insertEmployeeError } = await supabase.from("employees").insert(employeePayload);
          if (insertEmployeeError) {
            throw insertEmployeeError;
          }
        }
      }

      for (const [index, room] of rooms.entries()) {
        const roomPayload = {
          project_id: projectId,
          name: room.name.trim(),
          display_order: index,
        };

        if (room.id) {
          const { error: updateRoomError } = await supabase.from("rooms").update(roomPayload).eq("id", room.id);
          if (updateRoomError) {
            throw updateRoomError;
          }
        } else {
          const { error: insertRoomError } = await supabase.from("rooms").insert(roomPayload);
          if (insertRoomError) {
            throw insertRoomError;
          }
        }
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project", user.id] }),
        queryClient.invalidateQueries({ queryKey: ["house-rooms", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["house-employees", projectId] }),
      ]);

      Alert.alert("Casa salva", project ? "As informacoes da casa foram atualizadas." : "A casa foi cadastrada com sucesso.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel salvar a casa.";
      Alert.alert("Erro ao salvar", message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddRoom = () => {
    if (!roomDraft.trim()) {
      Alert.alert("Comodos", "Informe o nome do comodo.");
      return;
    }

    setRooms((current) => [...current, { name: roomDraft.trim() }]);
    setRoomDraft("");
    setRoomModalVisible(false);
  };

  const handleRemoveRoom = (room: RoomItem) => {
    setRooms((current) => current.filter((item) => item.id !== room.id || item.name !== room.name));

    if (room.id) {
      setRemovedRoomIds((current) => [...current, room.id!]);
    }
  };

  if (projectLoading) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Carregando dados da casa...</Text>
      </View>
    );
  }

  return (
    <>
      <AppScreen title="Casa" subtitle="Cadastre a casa, os espacos e a equipe que vai aparecer no app.">
        <View style={styles.formCard}>
          <View style={styles.photoBlock}>
            <View style={styles.houseAvatar}>
              {photoUrl.trim() ? (
                <Image source={{ uri: photoUrl.trim() }} style={styles.houseAvatarImage} />
              ) : (
                <Text style={styles.houseAvatarText}>{initialsFromName(houseName || "Obra Conectada")}</Text>
              )}
            </View>
            <View style={styles.photoCopy}>
              <Text style={styles.sectionTitle}>Foto da casa</Text>
              <Text style={styles.helperText}>Escolha uma foto da galeria para usar como capa da casa.</Text>
            </View>
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Foto</Text>
            <Pressable style={({ pressed }) => [styles.photoPickerButton, pressed && styles.buttonPressed]} onPress={() => void handlePickHousePhoto()}>
              <Text style={styles.photoPickerButtonText}>{photoUrl.trim() ? "Trocar foto da casa" : "Abrir galeria"}</Text>
            </Pressable>
            {photoUrl.trim() ? (
              <View style={styles.previewBlock}>
                <Text style={styles.previewLabel}>Pre-visualizacao da casa</Text>
                <Pressable onPress={() => void handleOpenPreview(photoUrl)} onLongPress={() => setPendingPreviewRemoval("house")} delayLongPress={1500}>
                  <Image source={{ uri: photoUrl.trim() }} style={styles.previewImage} />
                </Pressable>
              </View>
            ) : null}
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Nome da casa *</Text>
            <TextInput style={[styles.fieldInput, styles.primaryInput]} value={houseName} onChangeText={setHouseName} placeholder="Ex.: Casa do Lago" placeholderTextColor={colors.textMuted} />
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Endereco</Text>
            <TextInput style={styles.fieldInput} value={address} onChangeText={setAddress} placeholder="Rua, numero, cidade..." placeholderTextColor={colors.textMuted} />
          </View>

          <View style={styles.fieldBlock}>
            <View style={styles.inlineHeader}>
              <Text style={styles.fieldLabel}>Comodos</Text>
              <Pressable style={({ pressed }) => [styles.inlineAddButton, pressed && styles.buttonPressed]} onPress={() => setRoomModalVisible(true)}>
                <Text style={styles.inlineAddButtonText}>Adicionar comodo</Text>
              </Pressable>
            </View>
            {rooms.length ? (
              <View style={styles.roomList}>
                {rooms.map((room) => (
                  <View key={room.id ?? room.name} style={styles.roomChip}>
                    <Text style={styles.roomChipText}>{room.name}</Text>
                    <Pressable onPress={() => handleRemoveRoom(room)}>
                      <Text style={styles.roomChipRemove}>×</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.fieldHint}>Nenhum comodo cadastrado ainda.</Text>
            )}
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Observacoes</Text>
            <TextInput
              multiline
              style={[styles.fieldInput, styles.notesArea]}
              value={observations}
              onChangeText={setObservations}
              placeholder="Informacoes gerais da casa e da obra..."
              placeholderTextColor={colors.textMuted}
            />
          </View>
        </View>

        <View style={styles.formCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.sectionTitle}>Funcionarios</Text>
              <Text style={styles.helperText}>
                {employees.length
                  ? "Edite ou remova a equipe que aparece vinculada a esta casa."
                  : "Ainda nao ha funcionarios. Preencha os dados do primeiro abaixo."}
              </Text>
            </View>

            {employees.length && !employeeFormVisible ? (
              <Pressable style={({ pressed }) => [styles.ghostButton, pressed && styles.buttonPressed]} onPress={() => { setEmployeeDraft(buildEmployeeDraft()); setEmployeeFormVisible(true); }}>
                <Text style={styles.ghostButtonText}>Adicionar</Text>
              </Pressable>
            ) : null}
          </View>

          {employees.length ? (
            <View style={styles.employeeList}>
              {employees.map((employee) => (
                <View key={employee.id ?? `${employee.full_name}-${employee.role}`} style={styles.employeeCard}>
                  <View style={styles.employeeRow}>
                    <View style={styles.employeeAvatar}>
                      {employee.photo.trim() ? (
                        <Image source={{ uri: employee.photo.trim() }} style={styles.employeeAvatarImage} />
                      ) : (
                        <Text style={styles.employeeAvatarText}>{initialsFromName(employee.full_name)}</Text>
                      )}
                    </View>

                    <View style={styles.employeeCopy}>
                      <Text style={styles.employeeName}>{employee.full_name}</Text>
                      <Text style={styles.employeeRole}>{employee.role}</Text>
                    </View>
                  </View>

                  <View style={styles.employeeActions}>
                    <Pressable style={({ pressed }) => [styles.linkButton, pressed && styles.buttonPressed]} onPress={() => handleEmployeeEdit(employee)}>
                      <Text style={styles.linkButtonText}>Editar</Text>
                    </Pressable>
                    <Pressable style={({ pressed }) => [styles.linkButton, pressed && styles.buttonPressed]} onPress={() => handleEmployeeRemove(employee)}>
                      <Text style={[styles.linkButtonText, { color: colors.danger }]}>Remover</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {employeeFormVisible ? (
            <View style={styles.employeeFormCard}>
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Foto do funcionario</Text>
                <Pressable style={({ pressed }) => [styles.photoPickerButton, pressed && styles.buttonPressed]} onPress={() => void handlePickEmployeePhoto()}>
                  <Text style={styles.photoPickerButtonText}>{employeeDraft.photo.trim() ? "Trocar foto do funcionario" : "Abrir galeria"}</Text>
                </Pressable>
                {employeeDraft.photo.trim() ? (
                  <View style={styles.previewBlock}>
                    <Text style={styles.previewLabel}>Pre-visualizacao do funcionario</Text>
                    <Pressable onPress={() => void handleOpenPreview(employeeDraft.photo)} onLongPress={() => setPendingPreviewRemoval("employee")} delayLongPress={1500}>
                      <Image source={{ uri: employeeDraft.photo.trim() }} style={styles.previewImage} />
                    </Pressable>
                  </View>
                ) : null}
              </View>

              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Nome</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={employeeDraft.full_name}
                  onChangeText={(value) => setEmployeeDraft((current) => ({ ...current, full_name: value }))}
                  placeholder="Nome completo"
                  placeholderTextColor={colors.textMuted}
                />
              </View>

              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Ocupacao</Text>
                <Pressable style={styles.selectField} onPress={() => setOccupationMenuOpen(true)}>
                  <Text style={styles.selectFieldText}>{employeeRoleLabel}</Text>
                  <Text style={styles.selectFieldArrow}>˅</Text>
                </Pressable>
              </View>

              <View style={styles.employeeFormActions}>
                {employees.length ? (
                  <Pressable
                    style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
                    onPress={() => {
                      setEmployeeFormVisible(false);
                      setEmployeeDraft(buildEmployeeDraft());
                    }}
                  >
                    <Text style={styles.secondaryButtonText}>Cancelar</Text>
                  </Pressable>
                ) : null}

                <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]} onPress={handleEmployeeSave}>
                  <Text style={styles.primaryButtonText}>{employeeDraft.id ? "Salvar funcionario" : "Adicionar funcionario"}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>

        <Pressable style={({ pressed }) => [styles.saveButton, (saving || pressed) && styles.buttonPressed]} onPress={() => void handleSaveHouse()}>
          {saving ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.saveButtonText}>Salvar</Text>}
        </Pressable>
      </AppScreen>

      <Modal transparent animationType="fade" visible={occupationMenuOpen} onRequestClose={() => setOccupationMenuOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOccupationMenuOpen(false)}>
          <Pressable style={styles.dropdownCard} onPress={() => undefined}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.dropdownContent}>
              {occupationOptions.map((option) => {
                const active = option.value === employeeDraft.role;

                return (
                  <Pressable
                    key={option.value}
                    style={({ pressed }) => [styles.dropdownItem, active && styles.dropdownItemActive, pressed && styles.buttonPressed]}
                    onPress={() => {
                      setEmployeeDraft((current) => ({ ...current, role: option.value }));
                      setOccupationMenuOpen(false);
                    }}
                  >
                    <Text style={[styles.dropdownItemText, active && styles.dropdownItemTextActive]}>
                      {active ? "✓  " : "   "}
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal transparent animationType="fade" visible={roomModalVisible} onRequestClose={() => setRoomModalVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setRoomModalVisible(false)}>
          <Pressable style={styles.popupCard} onPress={() => undefined}>
            <Text style={styles.popupTitle}>Novo comodo</Text>
            <TextInput
              style={styles.fieldInput}
              value={roomDraft}
              onChangeText={setRoomDraft}
              placeholder="Ex.: Sala de jantar"
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
            <View style={styles.popupActions}>
              <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]} onPress={() => setRoomModalVisible(false)}>
                <Text style={styles.secondaryButtonText}>Cancelar</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]} onPress={handleAddRoom}>
                <Text style={styles.primaryButtonText}>Criar</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal transparent animationType="fade" visible={Boolean(pendingPreviewRemoval)} onRequestClose={() => setPendingPreviewRemoval(null)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPendingPreviewRemoval(null)} />
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Excluir foto?</Text>
            <Text style={styles.confirmText}>Deseja remover esta imagem selecionada?</Text>
            <View style={styles.confirmActions}>
              <Pressable style={styles.secondaryButton} onPress={() => setPendingPreviewRemoval(null)}>
                <Text style={styles.secondaryButtonText}>Nao</Text>
              </Pressable>
              <Pressable
                style={styles.confirmAccept}
                onPress={() => {
                  if (pendingPreviewRemoval === "house") {
                    setPhotoUrl("");
                  }

                  if (pendingPreviewRemoval === "employee") {
                    setEmployeeDraft((current) => ({ ...current, photo: "" }));
                  }

                  setPendingPreviewRemoval(null);
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
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: colors.background,
  },
  loadingText: {
    color: colors.textMuted,
  },
  formCard: {
    gap: 16,
    padding: 18,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
  },
  photoBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  houseAvatar: {
    width: 72,
    height: 72,
    borderRadius: 24,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  houseAvatarImage: {
    width: "100%",
    height: "100%",
  },
  houseAvatarText: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.primary,
  },
  photoCopy: {
    flex: 1,
    gap: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },
  helperText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
  },
  fieldBlock: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  fieldInput: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.text,
  },
  primaryInput: {
    borderColor: colors.primary,
  },
  textArea: {
    minHeight: 88,
    textAlignVertical: "top",
  },
  notesArea: {
    minHeight: 112,
    textAlignVertical: "top",
  },
  fieldHint: {
    fontSize: 12,
    color: colors.textMuted,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  inlineHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  inlineAddButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
  },
  inlineAddButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
  roomList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  roomChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 12,
    paddingRight: 10,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surfaceMuted,
  },
  roomChipText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  roomChipRemove: {
    fontSize: 18,
    lineHeight: 18,
    color: colors.textMuted,
  },
  ghostButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surfaceMuted,
  },
  ghostButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  photoPickerButton: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: "center",
  },
  photoPickerButtonText: {
    fontSize: 15,
    color: colors.text,
    fontWeight: "600",
  },
  previewBlock: {
    gap: 8,
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
  },
  previewImage: {
    width: 84,
    height: 84,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
  },
  employeeList: {
    gap: 12,
  },
  employeeCard: {
    gap: 10,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surfaceMuted,
  },
  employeeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  employeeAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  employeeAvatarImage: {
    width: "100%",
    height: "100%",
  },
  employeeAvatarText: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.primary,
  },
  employeeCopy: {
    flex: 1,
    gap: 2,
  },
  employeeName: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
  },
  employeeRole: {
    fontSize: 13,
    color: colors.textMuted,
  },
  employeeActions: {
    flexDirection: "row",
    gap: 16,
  },
  linkButton: {
    paddingVertical: 2,
  },
  linkButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
  },
  employeeFormCard: {
    gap: 14,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surfaceMuted,
  },
  selectField: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectFieldText: {
    fontSize: 15,
    color: colors.text,
  },
  selectFieldArrow: {
    fontSize: 18,
    color: colors.textMuted,
    marginTop: -4,
  },
  employeeFormActions: {
    flexDirection: "row",
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  primaryButton: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.surface,
  },
  saveButton: {
    marginTop: 6,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center",
    backgroundColor: colors.primary,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.surface,
  },
  dropdownCard: {
    width: "84%",
    maxWidth: 320,
    maxHeight: 260,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    paddingVertical: 8,
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  popupCard: {
    width: "84%",
    maxWidth: 320,
    gap: 16,
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
  },
  popupTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },
  popupActions: {
    flexDirection: "row",
    gap: 12,
  },
  confirmCard: {
    width: "100%",
    maxWidth: 320,
    gap: 12,
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
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
    gap: 12,
  },
  confirmAccept: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: colors.danger,
  },
  confirmAcceptText: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.surface,
  },
  dropdownContent: {
    paddingHorizontal: 8,
  },
  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
  },
  dropdownItemActive: {
    backgroundColor: colors.primarySoft,
  },
  dropdownItemText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  dropdownItemTextActive: {
    color: colors.primary,
    fontWeight: "800",
  },
  modalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(31, 28, 23, 0.24)",
    paddingHorizontal: 20,
  },
  buttonPressed: {
    opacity: 0.82,
  },
});




import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { colors } from "../config/theme";
import { useAuth } from "../contexts/AuthContext";
import type { Occupation } from "../hooks/useProfile";
import { validateSignUpInput } from "../lib/authValidation";
import { EMPLOYEE_ROLE_OPTIONS, type EmployeeRoleValue } from "../lib/teamRoles";
import { AppIcon } from "../components/AppIcon";

type RootStackParamList = {
  Login: undefined;
  SignUp: undefined;
  ResetPassword: undefined;
  App: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, "SignUp">;

/**
 * Tela de Cadastro: Registro de novos usuarios.
 */
export function SignUpScreen({ navigation }: Props) {
  const { signUp, resendSignUpConfirmation, loading, checkOwnerExists } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [occupation, setOccupation] = useState<Occupation>("employee");
  const [employeeRole, setEmployeeRole] = useState<EmployeeRoleValue | "">("");
  const [employeeRoleOpen, setEmployeeRoleOpen] = useState(false);
  const [ownerExists, setOwnerExists] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState<string | null>(null);
  const [resendingConfirmation, setResendingConfirmation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checkingOwner, setCheckingOwner] = useState(true);

  /**
   * Verifica se ja existe um proprietario cadastrado para travar a opcao no UI.
   */
  useEffect(() => {
    const loadOwnerState = async () => {
      setCheckingOwner(true);
      const exists = await checkOwnerExists();
      setOwnerExists(exists);
      // Se ja existe dono, forca a selecao para funcionario por seguranca.
      if (exists) {
        setOccupation("employee");
      }
      setCheckingOwner(false);
    };
    void loadOwnerState();
  }, [checkOwnerExists]);

  /**
   * Dispara a criacao de conta no Supabase.
   */
  const handleSubmit = async () => {
    const validation = validateSignUpInput(fullName, email, password, {
      occupation,
      employeeRole,
    });
    if ("error" in validation) {
      setError(validation.error ?? "Confira os dados informados.");
      setFeedback(null);
      return;
    }

    setSubmitting(true);
    setError(null);
    setFeedback(null);
    const result = await signUp({
      fullName: validation.trimmedName,
      email: validation.normalizedEmail,
      password,
      occupation,
      employeeRole: occupation === "employee" ? (employeeRole || null) : null,
    });

    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    if (result.requiresEmailConfirmation) {
      setPendingConfirmationEmail(validation.normalizedEmail);
      setFeedback("Conta criada. Confirme o email enviado para ativar seu acesso.");
      setSubmitting(false);
      return;
    }

    navigation.replace("Login");
    setSubmitting(false);
  };

  const handleResendConfirmation = async () => {
    if (!pendingConfirmationEmail) {
      return;
    }

    setResendingConfirmation(true);
    setError(null);
    setFeedback(null);
    const result = await resendSignUpConfirmation(pendingConfirmationEmail);

    if (result.error) {
      setError(result.error);
      setResendingConfirmation(false);
      return;
    }

    setFeedback("Reenviamos o email de confirmação. Verifique sua caixa de entrada e spam.");
    setResendingConfirmation(false);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.keyboardShell}>
        <ScrollView bounces={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.brandBlock}>
            <View style={styles.brandBadge}><Text style={styles.brandBadgeText}>OC</Text></View>
            <Text style={styles.title}>Criar conta</Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Cadastro</Text>
            
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Nome completo</Text>
              <TextInput autoCapitalize="words" placeholder="Seu nome" placeholderTextColor={colors.textMuted} style={styles.input} value={fullName} onChangeText={setFullName} />
            </View>

            <Text style={styles.label}>Tipo de Perfil</Text>
            <View style={styles.checkboxRow}>
              {/* Opcao Proprietario: Fica desabilitada e cinza se ownerExists for true */}
              <Pressable 
                onPress={() => {
                  if (ownerExists) {
                    return;
                  }

                  setOccupation("owner");
                  setEmployeeRole("");
                  setEmployeeRoleOpen(false);
                }} 
                disabled={ownerExists || checkingOwner} 
                style={[
                  styles.checkboxButton, 
                  occupation === "owner" && styles.checkboxButtonActive,
                  ownerExists && styles.checkboxButtonDisabled
                ]}
              >
                <View style={[
                  styles.checkboxBox, 
                  occupation === "owner" && styles.checkboxBoxActive,
                  ownerExists && styles.checkboxBoxDisabled
                ]}>
                  {occupation === "owner" && <Text style={styles.checkboxMark}>✓</Text>}
                </View>
                <View>
                  <Text style={[styles.checkboxLabel, ownerExists && styles.checkboxLabelDisabled]}>Proprietário</Text>
                  {ownerExists && <Text style={styles.disabledHint}>Já cadastrado</Text>}
                </View>
              </Pressable>

              <Pressable 
                onPress={() => setOccupation("employee")} 
                style={[styles.checkboxButton, occupation === "employee" && styles.checkboxButtonActive]}
              >
                <View style={[styles.checkboxBox, occupation === "employee" && styles.checkboxBoxActive]}>
                  {occupation === "employee" && <Text style={styles.checkboxMark}>✓</Text>}
                </View>
                <Text style={styles.checkboxLabel}>Funcionário</Text>
              </Pressable>
            </View>

            {occupation === "employee" ? (
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Ocupação</Text>
                <Pressable style={styles.selectField} onPress={() => setEmployeeRoleOpen(true)}>
                  <Text style={[styles.selectFieldText, !employeeRole && styles.selectFieldPlaceholder]}>
                    {EMPLOYEE_ROLE_OPTIONS.find((option) => option.value === employeeRole)?.label ?? "Selecione a função"}
                  </Text>
                  <AppIcon name="ChevronDown" size={18} color={colors.textMuted} />
                </Pressable>
              </View>
            ) : null}

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="voce@email.com" placeholderTextColor={colors.textMuted} style={styles.input} value={email} onChangeText={setEmail} />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Senha</Text>
              <View style={styles.passwordRow}>
                <TextInput placeholder="Crie uma senha" placeholderTextColor={colors.textMuted} secureTextEntry={!showPassword} style={styles.passwordInput} value={password} onChangeText={setPassword} />
                <Pressable style={({ pressed }) => [styles.passwordToggle, pressed && styles.buttonPressed]} onPress={() => setShowPassword((v) => !v)}><Text style={styles.passwordToggleText}>{showPassword ? "Ocultar" : "Ver"}</Text></Pressable>
              </View>
              <Text style={styles.helperText}>Use pelo menos 8 caracteres, combinando letras e números.</Text>
            </View>

            {error && <Text style={styles.error}>{error}</Text>}
            {feedback && <Text style={styles.feedback}>{feedback}</Text>}
            <Pressable disabled={loading || submitting || checkingOwner} onPress={handleSubmit} style={({ pressed }) => [styles.button, (loading || submitting || pressed) && styles.buttonPressed]}>
              {(submitting || checkingOwner) ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>Criar conta</Text>}
            </Pressable>

            {pendingConfirmationEmail ? (
              <Pressable
                disabled={resendingConfirmation}
                onPress={handleResendConfirmation}
                style={({ pressed }) => [styles.secondaryButton, (resendingConfirmation || pressed) && styles.buttonPressed]}
              >
                {resendingConfirmation ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.secondaryButtonText}>Reenviar confirmação</Text>}
              </Pressable>
            ) : null}

            <View style={styles.secondaryActions}>
              <Pressable onPress={() => navigation.goBack()}><Text style={styles.secondaryLink}>Voltar para entrar</Text></Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <Modal transparent visible={employeeRoleOpen} animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setEmployeeRoleOpen(false)}>
          <View style={styles.dropdownCard}>
            {EMPLOYEE_ROLE_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                style={styles.dropdownItem}
                onPress={() => {
                  setEmployeeRole(option.value);
                  setEmployeeRoleOpen(false);
                }}
              >
                <Text style={styles.dropdownText}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  keyboardShell: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 36, paddingBottom: 28, gap: 24 },
  brandBlock: { gap: 10, alignItems: "center" },
  brandBadge: { width: 52, height: 52, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.cardBorder },
  brandBadgeText: { color: colors.primary, fontSize: 19, fontWeight: "800" },
  title: { fontSize: 35, lineHeight: 40, fontWeight: "800", color: colors.text, textAlign: "center" },
  formCard: { backgroundColor: colors.surface, borderRadius: 28, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: 18, paddingVertical: 20, gap: 16 },
  formTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
  fieldGroup: { gap: 8 },
  label: { fontSize: 13, fontWeight: "700", color: colors.text },
  checkboxRow: { flexDirection: "row", gap: 10 },
  checkboxButton: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surfaceMuted, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: 12, paddingVertical: 14 },
  checkboxButtonActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  checkboxButtonDisabled: { opacity: 0.6, backgroundColor: "#f0f0f0", borderColor: "#ddd" },
  checkboxBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.cardBorder, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  checkboxBoxActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  checkboxBoxDisabled: { borderColor: "#ccc", backgroundColor: "#eee" },
  checkboxMark: { color: colors.surface, fontSize: 13, fontWeight: "800" },
  checkboxLabel: { fontSize: 14, fontWeight: "600", color: colors.text },
  checkboxLabelDisabled: { color: "#999" },
  disabledHint: { fontSize: 10, color: colors.danger, fontWeight: "700", textTransform: "uppercase", marginTop: 2 },
  input: { backgroundColor: colors.surfaceMuted, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: 16, paddingVertical: 14, color: colors.text, fontSize: 15, width: "100%" },
  passwordRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  passwordInput: { flex: 1, backgroundColor: colors.surfaceMuted, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: 16, paddingVertical: 14, color: colors.text, fontSize: 15 },
  passwordToggle: { minWidth: 72, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, paddingVertical: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface },
  passwordToggleText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  button: { borderRadius: 16, backgroundColor: colors.primary, paddingVertical: 16, alignItems: "center" },
  buttonPressed: { opacity: 0.8 },
  buttonText: { color: colors.surface, fontSize: 15, fontWeight: "700" },
  secondaryButton: { borderRadius: 16, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft, paddingVertical: 15, alignItems: "center" },
  secondaryButtonText: { color: colors.primary, fontSize: 15, fontWeight: "700" },
  error: { color: colors.danger, fontSize: 13, lineHeight: 20 },
  feedback: { color: colors.success, fontSize: 13, lineHeight: 20 },
  helperText: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  secondaryActions: { paddingTop: 4, alignItems: "center" },
  secondaryLink: { color: colors.primary, fontSize: 14, fontWeight: "700" },
  selectField: { backgroundColor: colors.surfaceMuted, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: 16, paddingVertical: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  selectFieldText: { color: colors.text, fontSize: 15, fontWeight: "600" },
  selectFieldPlaceholder: { color: colors.textMuted, fontWeight: "500" },
  modalBackdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center", padding: 20 },
  dropdownCard: { width: "100%", maxWidth: 360, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.cardBorder, overflow: "hidden" },
  dropdownItem: { paddingHorizontal: 18, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.divider },
  dropdownText: { color: colors.text, fontSize: 15, fontWeight: "600" },
});

import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../config/theme";
import { useAuth } from "../contexts/AuthContext";

/**
 * Tela de redefinicao de senha aberta a partir do link web/PWA de recuperacao.
 */
export function ResetPasswordScreen() {
  const { updatePassword, finishPasswordRecovery } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!password || !confirmPassword) {
      setError("Preencha e confirme a nova senha.");
      return;
    }

    if (password.length < 6) {
      setError("A nova senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("As senhas digitadas não coincidem.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const result = await updatePassword(password);

    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    setSuccess(true);
    setSubmitting(false);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.keyboardShell}>
        <ScrollView bounces={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.brandBlock}>
            <View style={styles.brandBadge}><Text style={styles.brandBadgeText}>OC</Text></View>
            <Text style={styles.title}>Redefinir senha</Text>
          </View>

          <View style={styles.formCard}>
            {!success ? (
              <>
                <Text style={styles.formTitle}>Escolha uma nova senha</Text>
                <Text style={styles.formDescription}>
                  Essa tela foi aberta pelo link enviado ao seu email. Depois de confirmar, a nova senha passa a valer imediatamente.
                </Text>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Nova senha</Text>
                  <View style={styles.passwordRow}>
                    <TextInput
                      placeholder="Digite a nova senha"
                      placeholderTextColor={colors.textMuted}
                      secureTextEntry={!showPassword}
                      style={styles.passwordInput}
                      value={password}
                      onChangeText={setPassword}
                    />
                    <Pressable style={({ pressed }) => [styles.passwordToggle, pressed && styles.buttonPressed]} onPress={() => setShowPassword((value) => !value)}>
                      <Text style={styles.passwordToggleText}>{showPassword ? "Ocultar" : "Ver"}</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Confirmar senha</Text>
                  <View style={styles.passwordRow}>
                    <TextInput
                      placeholder="Repita a nova senha"
                      placeholderTextColor={colors.textMuted}
                      secureTextEntry={!showConfirmPassword}
                      style={styles.passwordInput}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                    />
                    <Pressable style={({ pressed }) => [styles.passwordToggle, pressed && styles.buttonPressed]} onPress={() => setShowConfirmPassword((value) => !value)}>
                      <Text style={styles.passwordToggleText}>{showConfirmPassword ? "Ocultar" : "Ver"}</Text>
                    </Pressable>
                  </View>
                </View>

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <Pressable disabled={submitting} onPress={handleSubmit} style={({ pressed }) => [styles.button, (submitting || pressed) && styles.buttonPressed]}>
                  {submitting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>Salvar nova senha</Text>}
                </Pressable>

                <Pressable style={styles.secondaryButton} onPress={() => void finishPasswordRecovery({ signOut: true })}>
                  <Text style={styles.secondaryButtonText}>Cancelar e voltar ao login</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.formTitle}>Senha atualizada</Text>
                <Text style={styles.successText}>
                  Sua senha foi redefinida com sucesso. Você pode continuar no app com a nova credencial.
                </Text>
                <Pressable onPress={() => void finishPasswordRecovery()} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
                  <Text style={styles.buttonText}>Continuar</Text>
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  keyboardShell: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 36, paddingBottom: 28, gap: 24, justifyContent: "center" },
  brandBlock: { gap: 10, alignItems: "center" },
  brandBadge: { width: 52, height: 52, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.cardBorder },
  brandBadgeText: { color: colors.primary, fontSize: 19, fontWeight: "800" },
  title: { fontSize: 35, lineHeight: 40, fontWeight: "800", color: colors.text, textAlign: "center" },
  formCard: { backgroundColor: colors.surface, borderRadius: 28, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: 18, paddingVertical: 20, gap: 16 },
  formTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
  formDescription: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  fieldGroup: { gap: 8 },
  label: { fontSize: 13, fontWeight: "700", color: colors.text },
  passwordRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  passwordInput: { flex: 1, backgroundColor: colors.surfaceMuted, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: 16, paddingVertical: 14, color: colors.text, fontSize: 15 },
  passwordToggle: { minWidth: 72, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, paddingVertical: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface },
  passwordToggleText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  button: { borderRadius: 16, backgroundColor: colors.primary, paddingVertical: 16, alignItems: "center" },
  buttonPressed: { opacity: 0.8 },
  buttonText: { color: colors.surface, fontSize: 15, fontWeight: "700" },
  secondaryButton: { alignItems: "center", paddingVertical: 10 },
  secondaryButtonText: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
  error: { color: colors.danger, fontSize: 13, lineHeight: 20 },
  successText: { color: colors.success, fontSize: 14, lineHeight: 22 },
});

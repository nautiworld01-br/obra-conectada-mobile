import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../config/theme";
import { useAuth } from "../contexts/AuthContext";

type RootStackParamList = {
  Login: undefined;
  SignUp: undefined;
  ResetPassword: undefined;
  App: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

/**
 * Tela de Login: Ponto de entrada do aplicativo.
 * Gerencia a autenticacao de usuarios via Supabase Auth.
 */
export function LoginScreen({ navigation }: Props) {
  const { signIn, requestPasswordReset, loading, isConfigured } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /**
   * Dispara o processo de login.
   * future_fix: Implementar validacao de formato de email no frontend antes de enviar ao servidor.
   */
  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    setFeedback(null);
    const result = await signIn(email.trim(), password);
    if (result.error) {
      setError(result.error);
    }
    setSubmitting(false);
  };

  const handlePasswordRecovery = async () => {
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setError("Informe seu email para receber o link de recuperação.");
      setFeedback(null);
      return;
    }

    setSubmitting(true);
    setError(null);
    setFeedback(null);

    const result = await requestPasswordReset(normalizedEmail);

    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    setFeedback("Se o email estiver cadastrado, enviaremos um link de recuperação para sua caixa de entrada.");
    setRecoveryMode(false);
    setSubmitting(false);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.keyboardShell}>
        <ScrollView bounces={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.brandBlock}>
            <Image source={require("../../assets/icon.png")} style={styles.brandLogo} />
            <Text style={styles.title}>Obra Conectada</Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Entrar</Text>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="voce@email.com" placeholderTextColor={colors.textMuted} style={styles.input} value={email} onChangeText={setEmail} />
            </View>
            {!recoveryMode ? (
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Senha</Text>
                <View style={styles.passwordRow}>
                  <TextInput placeholder="Digite sua senha" placeholderTextColor={colors.textMuted} secureTextEntry={!showPassword} style={styles.passwordInput} value={password} onChangeText={setPassword} />
                  <Pressable style={({ pressed }) => [styles.passwordToggle, pressed && styles.buttonPressed]} onPress={() => setShowPassword((value) => !value)}>
                    <Text style={styles.passwordToggleText}>{showPassword ? "Ocultar" : "Ver"}</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.recoveryCard}>
                <Text style={styles.recoveryTitle}>Recuperar senha</Text>
                <Text style={styles.recoveryDescription}>
                  Vamos enviar um link para redefinir sua senha no email informado acima.
                </Text>
              </View>
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}
            <Pressable disabled={loading || submitting} onPress={recoveryMode ? handlePasswordRecovery : handleSubmit} style={({ pressed }) => [styles.button, (loading || submitting || pressed) && styles.buttonPressed]}>
              {submitting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>{recoveryMode ? "Enviar link" : "Entrar"}</Text>}
            </Pressable>

            <View style={styles.secondaryActions}>
              <Pressable onPress={() => { setError(null); setFeedback(null); setRecoveryMode(false); navigation.navigate("SignUp"); }}><Text style={styles.secondaryLink}>Criar conta</Text></Pressable>
              <Pressable
                onPress={() => {
                  setError(null);
                  setFeedback(null);
                  setRecoveryMode((value) => !value);
                }}
              >
                <Text style={styles.secondaryLinkMuted}>{recoveryMode ? "Voltar para login" : "Esqueci a senha"}</Text>
              </Pressable>
            </View>
            {!isConfigured ? <Text style={styles.helperText}>As credenciais do Supabase precisam estar configuradas para autenticação e recuperação de senha.</Text> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  keyboardShell: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 36, paddingBottom: 28, gap: 24 },
  brandBlock: { gap: 12, alignItems: "center", marginBottom: 30 },
  brandLogo: { width: 80, height: 80, borderRadius: 20 },
  brandBadge: { width: 52, height: 52, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.cardBorder },
  brandBadgeText: { color: colors.primary, fontSize: 19, fontWeight: "800" },
  title: { fontSize: 35, lineHeight: 40, fontWeight: "800", color: colors.text, textAlign: "center" },
  formCard: { backgroundColor: colors.surface, borderRadius: 28, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: 18, paddingVertical: 20, gap: 16, shadowColor: "#8d7159", shadowOpacity: 0.08, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 2 },
  formTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
  fieldGroup: { gap: 8 },
  label: { fontSize: 13, fontWeight: "700", color: colors.text },
  input: { backgroundColor: colors.surfaceMuted, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: 16, paddingVertical: 14, color: colors.text, fontSize: 15, width: "100%" },
  passwordRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  passwordInput: { flex: 1, backgroundColor: colors.surfaceMuted, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: 16, paddingVertical: 14, color: colors.text, fontSize: 15 },
  passwordToggle: { minWidth: 72, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, paddingVertical: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface },
  passwordToggleText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  button: { borderRadius: 16, backgroundColor: colors.primary, paddingVertical: 16, alignItems: "center" },
  buttonPressed: { opacity: 0.8 },
  buttonText: { color: colors.surface, fontSize: 15, fontWeight: "700" },
  error: { color: colors.danger, fontSize: 13, lineHeight: 20 },
  feedback: { color: colors.success, fontSize: 13, lineHeight: 20 },
  secondaryActions: { paddingTop: 4, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 16 },
  secondaryLink: { color: colors.primary, fontSize: 14, fontWeight: "700" },
  secondaryLinkMuted: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
  recoveryCard: { gap: 6, borderRadius: 18, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surfaceMuted, padding: 14 },
  recoveryTitle: { fontSize: 14, fontWeight: "800", color: colors.text },
  recoveryDescription: { fontSize: 13, lineHeight: 20, color: colors.textMuted },
  helperText: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
});

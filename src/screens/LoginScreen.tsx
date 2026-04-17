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
  App: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

/**
 * Tela de Login: Ponto de entrada do aplicativo.
 * Gerencia a autenticacao de usuarios via Supabase Auth.
 */
export function LoginScreen({ navigation }: Props) {
  const { signIn, loading, isConfigured } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /**
   * Dispara o processo de login.
   * future_fix: Implementar validacao de formato de email no frontend antes de enviar ao servidor.
   */
  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    const result = await signIn(email.trim(), password);
    if (result.error) {
      setError(result.error);
    }
    setSubmitting(false);
  };

  /**
   * Gerencia links secundarios como criacao de conta ou recuperacao.
   * future_fix: Integrar fluxo de 'Esqueci a Senha' nativo assim que o SMTP do Supabase estiver configurado.
   */
  const handleSecondaryAction = (action: "signup" | "recovery") => {
    setError(
      action === "signup"
        ? ""
        : "Recuperação de senha ainda não foi aberta no mobile. Use o app web temporariamente.",
    );
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
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Senha</Text>
              <View style={styles.passwordRow}>
                <TextInput placeholder="Digite sua senha" placeholderTextColor={colors.textMuted} secureTextEntry={!showPassword} style={styles.passwordInput} value={password} onChangeText={setPassword} />
                <Pressable style={({ pressed }) => [styles.passwordToggle, pressed && styles.buttonPressed]} onPress={() => setShowPassword((value) => !value)}>
                  <Text style={styles.passwordToggleText}>{showPassword ? "Ocultar" : "Ver"}</Text>
                </Pressable>
              </View>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable disabled={loading || submitting} onPress={handleSubmit} style={({ pressed }) => [styles.button, (loading || submitting || pressed) && styles.buttonPressed]}>
              {submitting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>Entrar</Text>}
            </Pressable>

            <View style={styles.secondaryActions}>
              <Pressable onPress={() => { setError(null); navigation.navigate("SignUp"); }}><Text style={styles.secondaryLink}>Criar conta</Text></Pressable>
              <Pressable onPress={() => handleSecondaryAction("recovery")}><Text style={styles.secondaryLinkMuted}>Esqueci a senha</Text></Pressable>
            </View>
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
  secondaryActions: { paddingTop: 4, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 16 },
  secondaryLink: { color: colors.primary, fontSize: 14, fontWeight: "700" },
  secondaryLinkMuted: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
});

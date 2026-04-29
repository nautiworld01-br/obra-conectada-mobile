import { TextStyle, ViewStyle } from "react-native";

/**
 * Configuração da paleta de cores global do aplicativo.
 * Define a identidade visual baseada no design do Obra Conectada.
 */
export const colors = {
  // Cores de Marca
  primary: "#b2603a",     // Marrom/Laranja terra (Principal)
  primarySoft: "#f2dfd3", // Fundo suave para destaques
  secondary: "#d97b00",   // Laranja vibrante para botões de ação
  
  // Cores de Sistema
  background: "#f4f1ea",  // Bege muito claro (Fundo do app)
  surface: "#ffffff",     // Branco (Cards e modais)
  surfaceMuted: "#f7f4ef", // Cinza/Bege para campos de input
  
  // Neutros e Bordas
  text: "#1f1c17",        // Preto quase puro
  textMuted: "#746d63",   // Cinza para descrições
  cardBorder: "#e6ded2",  // Cor suave para bordas de cards
  divider: "#eeeeee",     // Linhas de separação finas
  
  // Cores de Status (Unificadas)
  success: "#3d7a57",     // Verde (Concluído/Pago)
  successLight: "#e7f4ec",
  warning: "#a46d1f",     // Ocre (Pendente/Em análise)
  warningLight: "#fff3df",
  danger: "#a83e33",      // Vermelho (Atrasado/Recusado)
  dangerLight: "#fdeae7",
  info: "#3566d6",        // Azul (Aprovado/Em andamento)
  infoLight: "#e6f0ff",
  
  // Navegação
  tabInactive: "#8a8378",
  overlay: "rgba(31, 28, 23, 0.42)",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  sectionGap: 24,
  screenBottomPadding: 40,
};

export const radii = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  pill: 999,
};

export const typography: Record<string, TextStyle> = {
  overline: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "800" as const,
    letterSpacing: 0.8,
    textTransform: "uppercase" as const,
  },
  screenTitle: {
    fontSize: 32,
    lineHeight: 36,
    fontWeight: "800" as const,
  },
  screenSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "500" as const,
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800" as const,
  },
  sectionSubtitle: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "500" as const,
  },
  body: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "500" as const,
  },
  helper: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600" as const,
  },
};

export const shadows: Record<string, ViewStyle> = {
  card: {
    shadowColor: "#1f1c17",
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
  modal: {
    shadowColor: "#1f1c17",
    shadowOpacity: 0.12,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 8,
  },
};

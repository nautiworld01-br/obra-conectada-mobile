import { IconName } from "../components/AppIcon";

export interface AppModule {
  key: string;
  label: string;
  icon: IconName;
}

/**
 * Configuração dos módulos principais do aplicativo.
 * Define os itens de navegação rápida com ícones e rótulos para o dashboard.
 */
export const primaryModules: AppModule[] = [
  { key: "dashboard", label: "Dashboard", icon: "LayoutDashboard" },
  { key: "updates", label: "Atualizações", icon: "Camera" },
  { key: "payments", label: "Pagamentos", icon: "CreditCard" },
  { key: "documents", label: "Documentos", icon: "FileText" },
  { key: "team", label: "Equipe", icon: "Users" },
  { key: "attendance", label: "Presença", icon: "UserCheck" },
];

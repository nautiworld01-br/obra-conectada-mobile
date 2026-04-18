import { Text } from "react-native";
import { AppScreen } from "../components/AppScreen";
import { SectionCard } from "../components/SectionCard";
import { colors } from "../config/theme";

/**
 * Tela de Presenca (Legado): Area inicial de planejamento para o controle de equipe.
 * future_fix: Esta tela foi substituida pela 'PresenceScreen' e deve ser removida do RootNavigator.
 */
export function AttendanceScreen() {
  return (
    <AppScreen title="Presença" subtitle="Área de controle legada.">
      <SectionCard title="Aviso" subtitle="Este módulo foi movido.">
        <Text style={{ color: colors.text, fontSize: 15, lineHeight: 22 }}>
          Esta área está sendo desativada. Utilize o novo Relatório de Presença Automática disponível no menu principal.
        </Text>
      </SectionCard>
    </AppScreen>
  );
}

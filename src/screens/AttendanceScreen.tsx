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
    <AppScreen title="Presenca" subtitle="Area de controle legada.">
      <SectionCard title="Aviso" subtitle="Este modulo foi movido.">
        <Text style={{ color: colors.text, fontSize: 15, lineHeight: 22 }}>
          Esta area esta sendo desativada. Utilize o novo Relatorio de Presenca Automatica disponivel no menu principal.
        </Text>
      </SectionCard>
    </AppScreen>
  );
}

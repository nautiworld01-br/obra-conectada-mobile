import { Text } from "react-native";
import { AppScreen } from "../components/AppScreen";
import { SectionCard } from "../components/SectionCard";
import { colors } from "../config/theme";

export function AttendanceScreen() {
  return (
    <AppScreen title="Presenca" subtitle="Tela crua para controle de presenca da equipe.">
      <SectionCard title="Base da tela" subtitle="Aqui vamos replicar a presenca e os registros diarios do web.">
        <Text style={{ color: colors.text, fontSize: 15, lineHeight: 22 }}>
          Esta area sera usada para lancar e consultar presenca, faltas e apontamentos dos funcionarios.
        </Text>
      </SectionCard>
    </AppScreen>
  );
}

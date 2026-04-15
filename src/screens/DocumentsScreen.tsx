import { Text, View } from "react-native";
import { AppScreen } from "../components/AppScreen";
import { SectionCard } from "../components/SectionCard";
import { colors } from "../config/theme";

export function DocumentsScreen() {
  return (
    <AppScreen title="Documentos" subtitle="Upload, consulta e abertura de arquivos via Supabase Storage.">
      <SectionCard title="Recursos previstos" subtitle="As dependencias para selecionar imagem e documento ja estao instaladas.">
        <View style={{ gap: 10 }}>
          {[
            "Upload de contrato, alvara, laudo e nota fiscal",
            "Consulta por categoria e vencimento",
            "Abertura segura por URL assinada",
          ].map((item) => (
            <Text key={item} style={{ color: colors.text, fontSize: 15, lineHeight: 22 }}>
              • {item}
            </Text>
          ))}
        </View>
      </SectionCard>
    </AppScreen>
  );
}

import "react-native-url-polyfill/auto";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { AppProviders } from "./src/providers/AppProviders";
import { RootNavigator } from "./src/navigation/RootNavigator";

/**
 * Ponto de Entrada Principal (React Native): Envelopa o app com todos os provedores necessarios.
 */
export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppProviders>
        <StatusBar style="dark" />
        <RootNavigator />
      </AppProviders>
    </GestureHandlerRootView>
  );
}

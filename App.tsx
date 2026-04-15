import "react-native-url-polyfill/auto";
import { StatusBar } from "expo-status-bar";
import { AppProviders } from "./src/providers/AppProviders";
import { RootNavigator } from "./src/navigation/RootNavigator";

export default function App() {
  return (
    <AppProviders>
      <StatusBar style="dark" />
      <RootNavigator />
    </AppProviders>
  );
}

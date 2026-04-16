import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ComponentType, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Easing, Image, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../config/theme";
import { useAuth } from "../contexts/AuthContext";
import { useProfile } from "../hooks/useProfile";
import { useProject } from "../hooks/useProject";
import { DashboardScreen } from "../screens/DashboardScreen";
import { DailyScreen } from "../screens/DailyScreen";
import { DocumentsScreen } from "../screens/DocumentsScreen";
import { HouseFormScreen } from "../screens/HouseFormScreen";
import { LoginScreen } from "../screens/LoginScreen";
import { MoreScreen } from "../screens/MoreScreen";
import { PaymentsScreen } from "../screens/PaymentsScreen";
import { PresenceScreen } from "../screens/PresenceScreen";
import { ScheduleScreen } from "../screens/ScheduleScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { SignUpScreen } from "../screens/SignUpScreen";
import { TeamScreen } from "../screens/TeamScreen";
import { UpdatesScreen } from "../screens/UpdatesScreen";

type RootStackParamList = { Login: undefined; SignUp: undefined; App: undefined; };

/**
 * Define a estrutura de rota do aplicativo, incluindo regras de visibilidade.
 */
type AppRoute = {
  key: string;
  label: string;
  menuLabel: string;
  icon: string;
  component: ComponentType;
  inDrawer?: boolean;
  inBottomNav?: boolean;
  ownerOnly?: boolean;
};

/**
 * Configuracao central de todas as telas do aplicativo.
 * future_fix: Migrar ícones de texto para bibliotecas de icones vetoriais (ex: Lucide ou FontAwesome).
 */
const appRoutes: AppRoute[] = [
  { key: "inicio", label: "Inicio", menuLabel: "Dashboard", icon: "⌂", component: DashboardScreen, inBottomNav: true, inDrawer: true },
  { key: "dia-a-dia", label: "Dia a Dia", menuLabel: "Dia a Dia", icon: "◫", component: DailyScreen, inBottomNav: true },
  { key: "crono", label: "Crono", menuLabel: "Crono", icon: "◷", component: ScheduleScreen, inBottomNav: true },
  { key: "pagtos", label: "Pagtos", menuLabel: "Pagamentos", icon: "$", component: PaymentsScreen, inDrawer: true, ownerOnly: true },
  { key: "mais", label: "Perfil", menuLabel: "Perfil", icon: "+", component: MoreScreen, inBottomNav: true },
  { key: "atualizacoes", label: "Atualizacoes", menuLabel: "Atualizacoes", icon: "◉", component: UpdatesScreen, inDrawer: true, ownerOnly: true },
  { key: "documentos", label: "Documentos", menuLabel: "Documentos", icon: "□", component: DocumentsScreen, inDrawer: true, ownerOnly: true },
  { key: "equipe", label: "Equipe", menuLabel: "Equipe", icon: "◌", component: TeamScreen, inDrawer: true, ownerOnly: true },
  { key: "presenca", label: "Presenca", menuLabel: "Presenca", icon: "✓", component: PresenceScreen, inDrawer: true, ownerOnly: true },
  { key: "house-config", label: "Casa", menuLabel: "Casa", icon: "⌘", component: HouseFormScreen, ownerOnly: true },
  { key: "config", label: "Configuracoes", menuLabel: "Configuracoes", icon: "•", component: SettingsScreen, inDrawer: true, ownerOnly: true },
];

/**
 * Tema customizado para o NavigationContainer, integrando com as cores globais.
 */
const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background, card: colors.surface, border: colors.cardBorder, primary: colors.primary, text: colors.text,
  },
};

/**
 * Componente de Navegacao Inferior (Bottom Tabs) customizado.
 */
function BottomNav({ routes, currentRouteKey, onNavigate }: any) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bottomNavShell, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.bottomNavBar}>
        {routes.map((route: any) => {
          const active = route.key === currentRouteKey;
          return (
            <Pressable key={route.key} style={styles.bottomNavItem} onPress={() => onNavigate(route.key)}>
              <Text style={[styles.bottomNavIcon, active && styles.bottomNavIconActive]}>{route.icon}</Text>
              <Text style={[styles.bottomNavLabel, active && styles.bottomNavLabelActive]}>{route.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Menu Lateral (Drawer) customizado com animacoes de entrada e saida.
 * future_fix: Adicionar suporte a gestos (swipe) para abrir/fechar o menu.
 */
function SideMenu(_: any) {
  const { routes, currentRouteKey, houseName, housePhotoUrl, isOwner, isHouseMenuOpen, visible, onClose, onNavigate, onToggleHouseMenu, onSignOut } = _;
  const [isMounted, setIsMounted] = useState(visible);
  const translateX = useRef(new Animated.Value(-320)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setIsMounted(true);
      Animated.parallel([
        Animated.timing(translateX, { toValue: 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
      return;
    }
    Animated.parallel([
      Animated.timing(translateX, { toValue: -320, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) setIsMounted(false); });
  }, [visible]);

  if (!isMounted) return null;

  return (
    <Modal transparent animationType="none" visible onRequestClose={onClose}>
      <View style={styles.overlayRow}>
        <Animated.View style={[styles.drawerBackdropContainer, { opacity: backdropOpacity }]}><Pressable style={styles.drawerBackdrop} onPress={onClose} /></Animated.View>
        <Animated.View style={[styles.drawerAnimatedLayer, { transform: [{ translateX }] }]}>
          <SafeAreaView style={styles.drawerContainer} edges={["top", "bottom"]}>
            <View style={styles.drawerContent}>
              <View style={styles.drawerHeader}><Text style={styles.drawerEyebrow}>Menu lateral</Text><Text style={styles.drawerTitle}>Obra Conectada</Text></View>
              <View style={styles.drawerHouseArea}>
                <Pressable style={styles.drawerHouseButton} onPress={onToggleHouseMenu}>
                  <View style={styles.drawerHouseAvatar}>{housePhotoUrl ? <Image source={{ uri: housePhotoUrl }} style={styles.drawerHouseAvatarImage} /> : <Text style={styles.drawerHouseAvatarText}>OC</Text>}</View>
                  <View style={styles.drawerHouseCopy}><Text numberOfLines={1} style={styles.drawerHouseName}>{houseName}</Text><Text style={styles.drawerHouseHint}>{isOwner ? "Ver ou configurar" : "Ver casa"}</Text></View>
                </Pressable>
                {isHouseMenuOpen && (
                  <View style={styles.drawerHousePopover}>
                    {isOwner && <Pressable style={styles.drawerHouseMenuItem} onPress={() => onNavigate("house-config")}><Text style={styles.drawerHouseMenuTitle}>Configurar</Text></Pressable>}
                    <Pressable style={styles.drawerHouseMenuItem} onPress={() => onNavigate("inicio")}><Text style={styles.drawerHouseMenuTitle}>Ver casa</Text></Pressable>
                  </View>
                )}
              </View>
              <View style={styles.drawerDivider} />
              <View style={styles.drawerSection}>
                {routes.map((route: any) => (
                  <Pressable key={route.key} style={styles.drawerItem} onPress={() => onNavigate(route.key)}><Text style={[styles.drawerItemText, route.key === currentRouteKey && styles.drawerItemTextActive]}>{route.menuLabel}</Text></Pressable>
                ))}
              </View>
            </View>
            <View style={styles.drawerFooter}><Pressable style={styles.signOutButton} onPress={onSignOut}><Text style={styles.signOutButtonText}>Sair</Text></Pressable></View>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

/**
 * Casca principal do app autenticado. Gerencia o estado de navegação interna.
 * future_fix: Persistir a ultima rota acessada para reabrir o app na mesma tela.
 */
function AppShell() {
  const [currentRouteKey, setCurrentRouteKey] = useState("inicio");
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [isHouseMenuOpen, setIsHouseMenuOpen] = useState(false);
  const { signOut } = useAuth();
  const { project } = useProject();
  const { isOwner } = useProfile();

  const ActiveScreen = useMemo(() => appRoutes.find(r => r.key === currentRouteKey)?.component ?? appRoutes[0].component, [currentRouteKey]);
  const houseName = project?.name?.trim() || "Casa ainda nao configurada";
  const availableRoutes = useMemo(() => appRoutes.filter(r => !r.ownerOnly || isOwner), [isOwner]);

  const handleNavigate = (routeKey: string) => { setCurrentRouteKey(routeKey); setIsHouseMenuOpen(false); setIsSideMenuOpen(false); };

  return (
    <SafeAreaView style={styles.shellSafeArea} edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable style={styles.iconButton} onPress={() => setIsSideMenuOpen(true)}><Text style={styles.iconText}>≡</Text></Pressable>
        <Text style={styles.screenLabel}>{appRoutes.find(r => r.key === currentRouteKey)?.label}</Text>
      </View>
      <View style={styles.screenArea}><ActiveScreen /></View>
      <BottomNav routes={availableRoutes.filter(r => r.inBottomNav)} currentRouteKey={currentRouteKey} onNavigate={handleNavigate} />
      <SideMenu routes={availableRoutes.filter(r => r.inDrawer)} currentRouteKey={currentRouteKey} houseName={houseName} housePhotoUrl={project?.photo_url} isOwner={isOwner} isHouseMenuOpen={isHouseMenuOpen} visible={isSideMenuOpen} onClose={() => setIsSideMenuOpen(false)} onNavigate={handleNavigate} onToggleHouseMenu={() => setIsHouseMenuOpen(!isHouseMenuOpen)} onSignOut={signOut} />
    </SafeAreaView>
  );
}

/**
 * Root Navigator: Ponto de decisao entre fluxo de Autenticacao e fluxo de App.
 */
export function RootNavigator() {
  const { loading, session } = useAuth();
  const Stack = createNativeStackNavigator();

  if (loading) return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {session ? <Stack.Screen name="App" component={AppShell} /> : (
          <><Stack.Screen name="Login" component={LoginScreen} /><Stack.Screen name="SignUp" component={SignUpScreen} /></>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  shellSafeArea: { flex: 1, backgroundColor: colors.background },
  topBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.cardBorder, backgroundColor: colors.background },
  iconButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  iconText: { color: colors.text, fontSize: 24, marginTop: -2 },
  screenLabel: { flex: 1, fontSize: 18, fontWeight: "800", color: colors.text },
  screenArea: { flex: 1 },
  bottomNavShell: { backgroundColor: colors.surface },
  bottomNavBar: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.cardBorder, backgroundColor: colors.surface },
  bottomNavItem: { flex: 1, alignItems: "center", gap: 4 },
  bottomNavIcon: { fontSize: 20, color: colors.textMuted, fontWeight: "600" },
  bottomNavIconActive: { color: colors.primary, fontWeight: "800" },
  bottomNavLabel: { fontSize: 11, fontWeight: "600", color: colors.textMuted },
  bottomNavLabelActive: { color: colors.primary, fontWeight: "800" },
  overlayRow: { flex: 1 },
  drawerBackdropContainer: { ...StyleSheet.absoluteFillObject },
  drawerAnimatedLayer: { position: "absolute", top: 0, bottom: 0, left: 0, width: 296, backgroundColor: colors.surface, overflow: "hidden" },
  drawerBackdrop: { flex: 1, backgroundColor: "rgba(31, 28, 23, 0.2)" },
  drawerContainer: { flex: 1, width: 296, paddingHorizontal: 18, paddingVertical: 18, backgroundColor: colors.surface, borderRightWidth: 1, borderRightColor: colors.cardBorder },
  drawerContent: { flex: 1 },
  drawerHeader: { gap: 4 },
  drawerEyebrow: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", color: colors.textMuted },
  drawerTitle: { fontSize: 24, fontWeight: "800", color: colors.text },
  drawerHouseArea: { position: "relative", zIndex: 20 },
  drawerHouseButton: { marginTop: 18, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  drawerHouseAvatar: { width: 42, height: 42, borderRadius: 21, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  drawerHouseAvatarImage: { width: "100%", height: "100%" },
  drawerHouseAvatarText: { fontSize: 15, fontWeight: "800", color: colors.primary },
  drawerHouseCopy: { flex: 1, gap: 2 },
  drawerHouseName: { fontSize: 14, fontWeight: "800", color: colors.text },
  drawerHouseHint: { fontSize: 12, color: colors.textMuted },
  drawerHousePopover: { position: "absolute", top: 58, left: 18, right: 8, gap: 6, padding: 8, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface, elevation: 3 },
  drawerHouseMenuItem: { gap: 2, padding: 8, borderRadius: 12 },
  drawerHouseMenuTitle: { fontSize: 14, fontWeight: "800", color: colors.text },
  drawerDivider: { height: 1, backgroundColor: colors.cardBorder, marginTop: 18, marginBottom: 4 },
  drawerSection: { flex: 1, gap: 10, paddingTop: 16 },
  drawerItem: { paddingHorizontal: 16, paddingVertical: 12 },
  drawerItemText: { fontSize: 15, fontWeight: "600", color: colors.text },
  drawerItemTextActive: { color: colors.primary, fontWeight: "800" },
  drawerFooter: { paddingTop: 20, backgroundColor: colors.surface },
  signOutButton: { borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14, alignItems: "center", backgroundColor: colors.text },
  signOutButtonText: { fontSize: 15, fontWeight: "700", color: colors.surface },
});

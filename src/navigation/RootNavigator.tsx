import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ComponentType, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Easing, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Reanimated, { FadeIn, LinearTransition } from "react-native-reanimated";
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
import { ResetPasswordScreen } from "../screens/ResetPasswordScreen";
import { ScheduleScreen } from "../screens/ScheduleScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { SignUpScreen } from "../screens/SignUpScreen";
import { TeamScreen } from "../screens/TeamScreen";
import { UpdatesScreen } from "../screens/UpdatesScreen";
import { AppIcon, IconName } from "../components/AppIcon";

type RootStackParamList = { Login: undefined; SignUp: undefined; ResetPassword: undefined; App: undefined; };

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Define a estrutura de rota do aplicativo, incluindo regras de visibilidade.
 */
type AppRoute = {
  key: string;
  label: string;
  menuLabel: string;
  icon: IconName;
  component: ComponentType;
  inDrawer?: boolean;
  inBottomNav?: boolean;
  ownerOnly?: boolean;
};

const appRoutes: AppRoute[] = [
  { key: "inicio", label: "Início", menuLabel: "Dashboard", icon: "Home", component: DashboardScreen, inBottomNav: true, inDrawer: true },
  { key: "dia-a-dia", label: "Dia a Dia", menuLabel: "Dia a Dia", icon: "LayoutList", component: DailyScreen, inBottomNav: true },
  { key: "crono", label: "Crono", menuLabel: "Crono", icon: "CalendarDays", component: ScheduleScreen, inBottomNav: true },
  { key: "atualizacoes", label: "Relatórios", menuLabel: "Relatórios", icon: "Camera", component: UpdatesScreen, inDrawer: true },
  { key: "mais", label: "Perfil", menuLabel: "Perfil", icon: "User", component: MoreScreen, inBottomNav: true },
  
  // Rotas exclusivas do Proprietario
  { key: "pagtos", label: "Pagtos", menuLabel: "Pagamentos", icon: "CircleDollarSign", component: PaymentsScreen, inDrawer: true, ownerOnly: true },
  { key: "documentos", label: "Documentos", menuLabel: "Documentos", icon: "FileText", component: DocumentsScreen, inDrawer: true, ownerOnly: true },
  { key: "equipe", label: "Equipe", menuLabel: "Equipe", icon: "Users", component: TeamScreen, inDrawer: true, ownerOnly: true },
  { key: "presenca", label: "Presença", menuLabel: "Presença", icon: "UserCheck", component: PresenceScreen, inDrawer: true, ownerOnly: true },
  { key: "house-config", label: "Obra", menuLabel: "Dados da Obra", icon: "Home", component: HouseFormScreen, ownerOnly: true },
  { key: "config", label: "Configurações", menuLabel: "Configurações", icon: "Settings", component: SettingsScreen, inDrawer: true, ownerOnly: true },
];

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background, card: colors.surface, border: colors.cardBorder, primary: colors.primary, text: colors.text,
  },
};

function BottomNav({ routes, currentRouteKey, onNavigate }: any) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bottomNavShell, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.bottomNavBar}>
        {routes.map((route: any) => {
          const active = route.key === currentRouteKey;
          return (
            <Pressable key={route.key} style={styles.bottomNavItem} onPress={() => onNavigate(route.key)}>
              <AppIcon 
                name={route.icon} 
                size={22} 
                color={active ? colors.primary : colors.tabInactive} 
                strokeWidth={active ? 2.5 : 2}
              />
              <Text style={[styles.bottomNavLabel, active && styles.bottomNavLabelActive]}>{route.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

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
              <View style={styles.drawerHeader}>
                <View style={styles.drawerHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.drawerEyebrow}>Menu lateral</Text>
                    <Text style={styles.drawerTitle}>Obra Conectada</Text>
                  </View>
                  <Pressable onPress={onClose} style={styles.drawerCloseButton}>
                    <AppIcon name="X" size={24} color={colors.textMuted} />
                  </Pressable>
                </View>
              </View>
              <View style={styles.drawerHouseArea}>
                <Pressable 
                  style={styles.drawerHouseButton} 
                  onPress={isOwner ? onToggleHouseMenu : undefined}
                >
                  <View style={styles.drawerHouseAvatar}>{housePhotoUrl ? <Image source={{ uri: housePhotoUrl }} style={styles.drawerHouseAvatarImage} /> : <Text style={styles.drawerHouseAvatarText}>OC</Text>}</View>
                  <View style={styles.drawerHouseCopy}>
                    <Text numberOfLines={1} style={styles.drawerHouseName}>{houseName}</Text>
                    <Text style={styles.drawerHouseHint}>{isOwner ? "Toque para configurar" : "Residência vinculada"}</Text>
                  </View>
                  {isOwner && <AppIcon name={isHouseMenuOpen ? "ChevronUp" : "ChevronDown"} size={16} color={colors.textMuted} />}
                </Pressable>
                {isHouseMenuOpen && isOwner && (
                  <View style={styles.drawerHousePopover}>
                    <Pressable style={styles.drawerHouseMenuItem} onPress={() => onNavigate("house-config")}>
                      <AppIcon name="Settings2" size={16} color={colors.primary} />
                      <Text style={styles.drawerHouseMenuTitle}>Configurar Obra</Text>
                    </Pressable>
                  </View>
                )}
              </View>
              <View style={styles.drawerDivider} />
              <ScrollView style={styles.drawerSection} showsVerticalScrollIndicator={false}>
                {routes.map((route: any) => {
                  const active = route.key === currentRouteKey;
                  return (
                    <Pressable key={route.key} style={styles.drawerItem} onPress={() => onNavigate(route.key)}>
                      <AppIcon name={route.icon} size={20} color={active ? colors.primary : colors.textMuted} />
                      <Text style={[styles.drawerItemText, active && styles.drawerItemTextActive]}>{route.menuLabel}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
            <View style={styles.drawerFooter}>
              <Pressable style={styles.signOutButton} onPress={onSignOut}>
                <AppIcon name="LogOut" size={18} color={colors.surface} />
                <Text style={styles.signOutButtonText}>Sair da Conta</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function AppShell() {
  const [currentRouteKey, setCurrentRouteKey] = useState("inicio");
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [isHouseMenuOpen, setIsHouseMenuOpen] = useState(false);
  const { signOut } = useAuth();
  const { project, isLoading: projectLoading } = useProject();
  const { isOwner, profile, isLoading: profileLoading, isFetched: profileFetched, error: profileError } = useProfile();

  const ActiveScreen = useMemo(() => appRoutes.find(r => r.key === currentRouteKey)?.component ?? appRoutes[0].component, [currentRouteKey]);
  
  // So desloga se a consulta terminou sem erro e realmente nao encontrou perfil.
  // Em PWA isso evita "logout fantasma" por falha transitória de storage/rede na largada.
  useEffect(() => {
    if (!profileLoading && profileFetched && !profileError && !profile) {
      void signOut();
    }
  }, [profile, profileError, profileFetched, profileLoading, signOut]);

  // Lógica sênior para nome da casa: aguarda carregamento e trata nulos
  const houseName = useMemo(() => {
    if (projectLoading) return "Carregando...";
    return project?.name?.trim() || "Obra vinculada";
  }, [project, projectLoading]);

  const availableRoutes = useMemo(() => appRoutes.filter(r => !r.ownerOnly || isOwner), [isOwner]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const routeKey = params.get("notifyRoute");
    if (!routeKey || !availableRoutes.some((route) => route.key === routeKey)) {
      return;
    }

    setCurrentRouteKey(routeKey);
    params.delete("notifyRoute");
    params.delete("notifyEntityId");
    params.delete("notifyEvent");

    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", nextUrl);
  }, [availableRoutes]);

  const handleNavigate = (routeKey: string) => { setCurrentRouteKey(routeKey); setIsHouseMenuOpen(false); setIsSideMenuOpen(false); };

  return (
    <SafeAreaView style={styles.shellSafeArea} edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable style={styles.iconButton} onPress={() => setIsSideMenuOpen(true)}>
          <AppIcon name="Menu" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.screenLabel}>{appRoutes.find(r => r.key === currentRouteKey)?.label}</Text>
      </View>
      <Reanimated.View
        key={currentRouteKey}
        entering={FadeIn.duration(180)}
        layout={LinearTransition.springify().damping(22).stiffness(200)}
        style={styles.screenArea}
      >
        <ActiveScreen />
      </Reanimated.View>
      <BottomNav routes={availableRoutes.filter(r => r.inBottomNav)} currentRouteKey={currentRouteKey} onNavigate={handleNavigate} />
      <SideMenu routes={availableRoutes.filter(r => r.inDrawer)} currentRouteKey={currentRouteKey} houseName={houseName} housePhotoUrl={project?.photo_url} isOwner={isOwner} isHouseMenuOpen={isHouseMenuOpen} visible={isSideMenuOpen} onClose={() => setIsSideMenuOpen(false)} onNavigate={handleNavigate} onToggleHouseMenu={() => setIsHouseMenuOpen(!isHouseMenuOpen)} onSignOut={handleSignOut} />
    </SafeAreaView>
  );

  function handleSignOut() {
    setIsSideMenuOpen(false);
    setIsHouseMenuOpen(false);
    if (Platform.OS === "web") {
      if (globalThis.confirm("Deseja sair da conta?")) void signOut();
      return;
    }
    Alert.alert("Sair da conta?", "Você será desconectado.", [{ text: "Cancelar", style: "cancel" }, { text: "Sair", style: "destructive", onPress: () => void signOut() }]);
  }
}

export function RootNavigator() {
  const { loading, passwordRecoveryActive, session } = useAuth();

  if (loading) return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {passwordRecoveryActive ? <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} /> : session ? <Stack.Screen name="App" component={AppShell} /> : (
          <><Stack.Screen name="Login" component={LoginScreen} /><Stack.Screen name="SignUp" component={SignUpScreen} /></>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  shellSafeArea: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    backgroundColor: colors.background,
  },
  iconButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  iconText: { color: colors.text, fontSize: 24, marginTop: -2 },
  screenLabel: { flex: 1, fontSize: 18, fontWeight: "800", color: colors.text },
  screenArea: { flex: 1, backgroundColor: colors.background },
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
  drawerHeader: { gap: 4, marginBottom: 12 },
  drawerHeaderRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  drawerCloseButton: { padding: 4, marginRight: -8, marginTop: -4 },
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
  drawerHouseMenuItem: { flexDirection: "row", alignItems: "center", gap: 10, padding: 8, borderRadius: 12 },
  drawerHouseMenuTitle: { fontSize: 14, fontWeight: "800", color: colors.text },
  drawerDivider: { height: 1, backgroundColor: colors.cardBorder, marginTop: 18, marginBottom: 4 },
  drawerSection: { flex: 1, paddingTop: 16 },
  drawerItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, marginBottom: 4 },
  drawerItemText: { fontSize: 15, fontWeight: "600", color: colors.text },
  drawerItemTextActive: { color: colors.primary, fontWeight: "800" },
  drawerFooter: { paddingTop: 20, backgroundColor: colors.surface },
  signOutButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: colors.text },
  signOutButtonText: { fontSize: 15, fontWeight: "700", color: colors.surface },
});

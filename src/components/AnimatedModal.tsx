import { ReactNode, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { colors } from "../config/theme";

type AnimatedModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  children: ReactNode;
  position?: "center" | "bottom";
  contentStyle?: StyleProp<ViewStyle>;
  dismissOnBackdropPress?: boolean;
  backdropColor?: string;
};

export function AnimatedModal({
  visible,
  onRequestClose,
  children,
  position = "bottom",
  contentStyle,
  dismissOnBackdropPress = true,
  backdropColor = colors.overlay,
}: AnimatedModalProps) {
  const [mounted, setMounted] = useState(visible);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(position === "bottom" ? 36 : 18)).current;
  const scale = useRef(new Animated.Value(position === "center" ? 0.96 : 1)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.setValue(position === "bottom" ? 36 : 18);
      scale.setValue(position === "center" ? 0.96 : 1);
      contentOpacity.setValue(0);

      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(contentOpacity, {
        toValue: 0,
        duration: 160,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: position === "bottom" ? 28 : 12,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: position === "center" ? 0.98 : 1,
        duration: 160,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setMounted(false);
      }
    });
  }, [backdropOpacity, contentOpacity, position, scale, translateY, visible]);

  if (!mounted) {
    return null;
  }

  return (
    <Modal transparent animationType="none" visible onRequestClose={onRequestClose}>
      <View style={styles.root}>
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            styles.backdropLayer,
            { opacity: backdropOpacity, backgroundColor: backdropColor },
          ]}
        >
          <Pressable
            style={styles.backdropPressable}
            onPress={dismissOnBackdropPress ? onRequestClose : undefined}
          />
        </Animated.View>

        <View
          pointerEvents="box-none"
          style={[styles.positioner, position === "center" ? styles.center : styles.bottom]}
        >
          <Animated.View
            style={[
              contentStyle,
              {
                opacity: contentOpacity,
                transform: [{ translateY }, { scale }],
              },
            ]}
          >
            {children}
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdropLayer: {
    justifyContent: "center",
  },
  backdropPressable: {
    flex: 1,
  },
  positioner: {
    flex: 1,
    paddingHorizontal: 16,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  bottom: {
    justifyContent: "flex-end",
  },
});

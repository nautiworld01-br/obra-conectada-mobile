import { createElement, useEffect, useState } from "react";
import { Alert, Image, Linking, Modal, Platform, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { colors } from "../config/theme";
import { AppIcon } from "./AppIcon";
import { getOptimizedStorageImageUrl } from "../lib/appMedia";

export function getOptimizedMediaImageSource(params: {
  url: string;
  bucket: string;
  width: number;
  height?: number;
  quality?: number;
}) {
  return {
    uri: getOptimizedStorageImageUrl(params),
  };
}

function getVideoPosterCaptureTime(duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0.1;
  }

  return Math.min(Math.max(duration * 0.15, 0.1), 2);
}

export function AppPhotoViewerModal({
  visible,
  url,
  title,
  bucket,
  onClose,
}: {
  visible: boolean;
  url: string | null;
  title: string;
  bucket: string;
  onClose: () => void;
}) {
  if (!url) {
    return null;
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.viewerBackdrop}>
        <Pressable style={styles.viewerCloseButton} onPress={onClose}>
          <Text style={styles.viewerCloseText}>×</Text>
        </Pressable>
        <Text style={styles.viewerTitle}>{title}</Text>
        <View style={styles.viewerShell}>
          <Image
            source={getOptimizedMediaImageSource({
              url,
              bucket,
              width: 1600,
              quality: 75,
            })}
            style={styles.viewerImage}
            resizeMode="contain"
          />
        </View>
      </View>
    </Modal>
  );
}

export function AppVideoThumbnail({
  url,
  onPress,
  onLongPress,
  delayLongPress,
  containerStyle,
}: {
  url: string;
  index?: number;
  onPress: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
  containerStyle?: StyleProp<ViewStyle>;
}) {
  const [posterUrl, setPosterUrl] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined" || !url?.trim()) {
      setPosterUrl(null);
      return;
    }

    let active = true;
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");

    const cleanup = () => {
      video.pause();
      video.removeEventListener("loadeddata", handleLoadedData);
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("error", handleError);
      video.removeAttribute("src");
      try {
        video.load();
      } catch {
        // Ignora falhas na limpeza do elemento temporário.
      }
    };

    const finalize = (nextPosterUrl: string | null) => {
      if (active) {
        setPosterUrl(nextPosterUrl);
      }
      cleanup();
    };

    const captureFrame = () => {
      try {
        const width = video.videoWidth || 320;
        const height = video.videoHeight || 180;
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");
        if (!context) {
          finalize(null);
          return;
        }

        context.drawImage(video, 0, 0, width, height);
        finalize(canvas.toDataURL("image/jpeg", 0.72));
      } catch {
        finalize(null);
      }
    };

    const handleLoadedData = () => {
      const targetTime = getVideoPosterCaptureTime(video.duration);
      const maxTime = Number.isFinite(video.duration) && video.duration > 0 ? Math.max(video.duration - 0.1, 0) : targetTime;
      const captureTime = Math.min(targetTime, maxTime);

      if (captureTime > 0.05 && Math.abs(video.currentTime - captureTime) > 0.05) {
        try {
          video.currentTime = captureTime;
          return;
        } catch {
          // Alguns navegadores bloqueiam seek inicial.
        }
      }

      captureFrame();
    };

    const handleSeeked = () => {
      captureFrame();
    };

    const handleError = () => {
      finalize(null);
    };

    setPosterUrl(null);
    video.preload = "metadata";
    video.muted = true;
    video.crossOrigin = "anonymous";
    (video as HTMLVideoElement & { playsInline?: boolean }).playsInline = true;
    video.addEventListener("loadeddata", handleLoadedData);
    video.addEventListener("seeked", handleSeeked);
    video.addEventListener("error", handleError);
    video.src = url;
    video.load();

    return () => {
      active = false;
      cleanup();
    };
  }, [url]);

  return (
    <Pressable style={containerStyle} onPress={onPress} onLongPress={onLongPress} delayLongPress={delayLongPress}>
      <View style={styles.videoThumb}>
        {posterUrl ? (
          <Image source={{ uri: posterUrl }} style={styles.fill} />
        ) : (
          <View style={styles.videoThumbFallback}>
            <AppIcon name="Video" size={20} color={colors.surface} />
          </View>
        )}
        <View style={styles.videoThumbShade} />
        <View style={styles.videoThumbPlay}>
          <View style={styles.videoThumbPlayInner}>
            <AppIcon name="Play" size={18} color={colors.surface} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export function AppVideoViewerModal({
  visible,
  url,
  title,
  onClose,
}: {
  visible: boolean;
  url: string | null;
  title: string;
  onClose: () => void;
}) {
  if (!url) {
    return null;
  }

  const handleOpenExternally = async () => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Vídeo", "Não foi possível abrir este vídeo.");
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.viewerBackdrop}>
        <Pressable style={styles.viewerCloseButton} onPress={onClose}>
          <Text style={styles.viewerCloseText}>×</Text>
        </Pressable>
        <Text style={styles.viewerTitle}>{title}</Text>
        <View style={styles.viewerShell}>
          {Platform.OS === "web" ? (
            createElement("video" as any, {
              src: url,
              controls: true,
              preload: "metadata",
              playsInline: true,
              style: {
                width: "100%",
                height: "100%",
                objectFit: "contain",
                backgroundColor: "#000000",
              },
            } as any)
          ) : (
            <View style={styles.videoFallbackCard}>
              <AppIcon name="Video" size={26} color={colors.surface} />
              <Text style={styles.videoFallbackTitle}>Visualização interna disponível no web</Text>
              <Text style={styles.videoFallbackText}>No mobile, o vídeo continua sendo aberto no player externo do aparelho.</Text>
              <Pressable style={styles.videoFallbackButton} onPress={() => void handleOpenExternally()}>
                <Text style={styles.videoFallbackButtonText}>Abrir vídeo</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    width: "100%",
    height: "100%",
  },
  videoThumb: {
    width: "100%",
    height: "100%",
    backgroundColor: "#16130f",
  },
  videoThumbFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.text,
  },
  videoThumbShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(8, 9, 11, 0.24)",
  },
  videoThumbPlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  videoThumbPlayInner: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(10, 14, 22, 0.92)",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  viewerCloseButton: {
    position: "absolute",
    top: 22,
    right: 20,
    zIndex: 2,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.14)",
  },
  viewerCloseText: {
    color: colors.surface,
    fontSize: 28,
    fontWeight: "400",
    lineHeight: 30,
  },
  viewerTitle: {
    marginBottom: 16,
    color: colors.surface,
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  viewerShell: {
    flex: 1,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerImage: {
    width: "100%",
    height: "100%",
  },
  videoFallbackCard: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  videoFallbackTitle: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  videoFallbackText: {
    color: "rgba(255, 255, 255, 0.78)",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  videoFallbackButton: {
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  videoFallbackButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
});

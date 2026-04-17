import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View, TextInput } from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { colors } from "../config/theme";
import { AppIcon } from "./AppIcon";

interface AppDatePickerProps {
  value: string; // Formato YYYY-MM-DD
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
}

/**
 * Componente de Seletor de Data Padronizado.
 * Suporta plataformas nativas (modal) e Web (input nativo HTML5).
 */
export function AppDatePicker({ value, onChange, label, placeholder }: AppDatePickerProps) {
  const [show, setShow] = useState(false);

  // Calcula a data de hoje formatada para o placeholder
  const today = new Date();
  const formattedToday = `${today.getDate().toString().padStart(2, "0")}/${(today.getMonth() + 1).toString().padStart(2, "0")}/${today.getFullYear()}`;
  const displayPlaceholder = placeholder || formattedToday;

  // Renderização específica para WEB
  if (Platform.OS === "web") {
    return (
      <View style={styles.container}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        <View style={styles.inputWebWrapper}>
          <View style={styles.iconWrapper}>
            <AppIcon name="Calendar" size={18} color={colors.textMuted} />
          </View>
          <input
            type="date"
            value={value}
            placeholder={displayPlaceholder}
            onChange={(e) => onChange(e.target.value)}
            style={{
              padding: "12px 14px",
              paddingLeft: "42px", // Espaço para o icone fixo a esquerda
              borderRadius: "14px",
              border: `1px solid ${colors.cardBorder}`,
              backgroundColor: colors.surfaceMuted,
              color: colors.text,
              fontSize: "15px",
              fontFamily: "inherit",
              width: "100%",
              boxSizing: "border-box",
              outline: "none",
              cursor: "pointer",
            }}
          />
        </View>
      </View>
    );
  }

  // Lógica para NATIVO (iOS/Android)
  const dateValue = value ? new Date(value + "T12:00:00") : new Date();

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setShow(false);
    }
    if (selectedDate && event.type !== "dismissed") {
      const isoDate = selectedDate.toISOString().split("T")[0];
      onChange(isoDate);
    }
  };

  const displayDate = value ? value.split("-").reverse().join("/") : "";

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      
      <Pressable 
        style={({ pressed }) => [styles.input, pressed && styles.pressed]} 
        onPress={() => setShow(true)}
      >
        <View style={styles.innerInputRow}>
          <AppIcon name="Calendar" size={18} color={colors.textMuted} />
          <Text style={[styles.inputText, !displayDate && styles.placeholder]}>
            {displayDate || displayPlaceholder}
          </Text>
        </View>
      </Pressable>

      {show && (
        <DateTimePicker
          value={dateValue}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={handleDateChange}
          maximumDate={new Date(2100, 12, 31)}
          minimumDate={new Date(2000, 0, 1)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
    width: "100%",
  },
  label: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  input: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  innerInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  inputWebWrapper: {
    position: "relative",
    width: "100%",
  },
  iconWrapper: {
    position: "absolute",
    left: 14,
    top: "50%",
    transform: [{ translateY: -9 }],
    zIndex: 1,
  },
  inputText: {
    color: colors.text,
    fontSize: 15,
  },
  placeholder: {
    color: colors.textMuted,
    opacity: 0.7,
  },
  pressed: {
    opacity: 0.7,
  },
});

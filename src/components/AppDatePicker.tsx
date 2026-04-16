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
export function AppDatePicker({ value, onChange, label, placeholder = "Selecione uma data" }: AppDatePickerProps) {
  const [show, setShow] = useState(false);

  // Renderização específica para WEB
  if (Platform.OS === "web") {
    return (
      <View style={styles.container}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            padding: "12px 14px",
            borderRadius: "14px",
            border: `1px solid ${colors.cardBorder}`,
            backgroundColor: colors.surfaceMuted,
            color: colors.text,
            fontSize: "15px",
            fontFamily: "inherit",
            width: "100%",
            outline: "none",
          }}
        />
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
        <Text style={[styles.inputText, !displayDate && styles.placeholder]}>
          {displayDate || placeholder}
        </Text>
        <AppIcon name="Calendar" size={18} color={colors.textMuted} />
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
    justifyContent: "space-between",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inputText: {
    color: colors.text,
    fontSize: 15,
  },
  placeholder: {
    color: colors.textMuted,
  },
  pressed: {
    opacity: 0.7,
  },
});

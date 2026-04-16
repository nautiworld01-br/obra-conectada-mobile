import React from "react";
import * as LucideIcons from "lucide-react-native";
import { colors } from "../config/theme";
import { SvgProps } from "react-native-svg";

/**
 * Lista de nomes de ícones permitidos baseada na biblioteca Lucide.
 */
export type IconName = keyof typeof LucideIcons;

interface AppIconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/**
 * Componente padronizado de Ícone Vetorial.
 * Facilita a migração de emojis/texto para vetores mantendo o padrão visual do app.
 * Utiliza lucide-react-native que é compatível com Expo Web e Nativo.
 */
export function AppIcon({ 
  name, 
  size = 20, 
  color = colors.text, 
  strokeWidth = 2 
}: AppIconProps) {
  // Busca o componente do ícone dinamicamente
  const IconComponent = (LucideIcons as any)[name];

  if (!IconComponent) {
    if (__DEV__) {
      console.warn(`Icon "${name}" not found in LucideIcons`);
    }
    return null;
  }

  // Renderiza o componente com as propriedades padronizadas
  return (
    <IconComponent 
      size={size} 
      color={color} 
      strokeWidth={strokeWidth} 
    />
  );
}

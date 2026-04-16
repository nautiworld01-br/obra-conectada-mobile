/**
 * Utilitários de Validação Nativa: Garante integridade dos dados antes do envio ao banco.
 */

export type ValidationResult = {
  isValid: boolean;
  error?: string;
};

export const Validator = {
  /**
   * Valida se um campo de texto obrigatorio foi preenchido.
   */
  required: (value: string | null | undefined, fieldName: string): ValidationResult => {
    if (!value || value.trim().length === 0) {
      return { isValid: false, error: `O campo ${fieldName} e obrigatorio.` };
    }
    return { isValid: true };
  },

  /**
   * Valida e normaliza valores numericos (ex: precos, percentuais).
   */
  number: (value: string | number | null | undefined, fieldName: string, min = 0): ValidationResult & { parsedValue: number } => {
    if (value === null || value === undefined || value === "") {
      return { isValid: false, error: `Informe um valor para ${fieldName}.`, parsedValue: 0 };
    }
    
    const parsed = typeof value === "string" ? parseFloat(value.replace(",", ".")) : value;
    
    if (Number.isNaN(parsed)) {
      return { isValid: false, error: `${fieldName} deve ser um numero valido.`, parsedValue: 0 };
    }
    
    if (parsed < min) {
      return { isValid: false, error: `${fieldName} nao pode ser menor que ${min}.`, parsedValue: parsed };
    }

    return { isValid: true, parsedValue: parsed };
  },

  /**
   * Valida o formato de data brasileira (DD/MM/AAAA).
   */
  dateBR: (value: string | null | undefined): ValidationResult => {
    if (!value) return { isValid: true }; // Campo opcional
    const regex = /^\d{2}\/\d{2}\/\d{4}$/;
    if (!regex.test(value)) {
      return { isValid: false, error: "Data deve estar no formato DD/MM/AAAA." };
    }
    return { isValid: true };
  }
};

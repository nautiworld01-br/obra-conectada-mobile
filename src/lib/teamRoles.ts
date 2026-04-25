export const EMPLOYEE_ROLE_OPTIONS = [
  { value: "marinheiro", label: "Marinheiro" },
  { value: "empregada domestica", label: "Empregada doméstica" },
] as const;

export type EmployeeRoleValue = (typeof EMPLOYEE_ROLE_OPTIONS)[number]["value"];

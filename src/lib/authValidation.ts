const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COMMON_EMAIL_DOMAINS = ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "icloud.com"];

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string) {
  return EMAIL_REGEX.test(normalizeEmail(value));
}

function getLevenshteinDistance(source: string, target: string) {
  const matrix = Array.from({ length: source.length + 1 }, () => Array(target.length + 1).fill(0));

  for (let row = 0; row <= source.length; row += 1) {
    matrix[row][0] = row;
  }

  for (let column = 0; column <= target.length; column += 1) {
    matrix[0][column] = column;
  }

  for (let row = 1; row <= source.length; row += 1) {
    for (let column = 1; column <= target.length; column += 1) {
      const cost = source[row - 1] === target[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost,
      );
    }
  }

  return matrix[source.length][target.length];
}

export function getSuggestedEmail(value: string) {
  const normalizedEmail = normalizeEmail(value);
  const [localPart, domainPart] = normalizedEmail.split("@");

  if (!localPart || !domainPart) {
    return null;
  }

  const exactMatch = COMMON_EMAIL_DOMAINS.find((domain) => domain === domainPart);
  if (exactMatch) {
    return null;
  }

  const similarDomain = COMMON_EMAIL_DOMAINS.find((domain) => {
    const distance = getLevenshteinDistance(domainPart, domain);
    return distance > 0 && distance <= 2;
  });

  return similarDomain ? `${localPart}@${similarDomain}` : null;
}

export function validateLoginInput(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return { error: "Informe seu email." };
  }

  if (!isValidEmail(normalizedEmail)) {
    return { error: "Informe um email válido." };
  }

  const suggestedEmail = getSuggestedEmail(normalizedEmail);
  if (suggestedEmail) {
    return { error: `Confira seu email. Você quis dizer ${suggestedEmail}?` };
  }

  if (!password) {
    return { error: "Informe sua senha." };
  }

  return { normalizedEmail };
}

export function validateSignUpInput(
  fullName: string,
  email: string,
  password: string,
  options?: { occupation?: "owner" | "employee"; employeeRole?: string | null },
) {
  const trimmedName = fullName.trim();
  const normalizedEmail = normalizeEmail(email);

  if (!trimmedName || !normalizedEmail || !password) {
    return { error: "Preencha todos os campos." };
  }

  if (trimmedName.length < 3) {
    return { error: "Informe seu nome completo." };
  }

  if (!isValidEmail(normalizedEmail)) {
    return { error: "Informe um email válido." };
  }

  const suggestedEmail = getSuggestedEmail(normalizedEmail);
  if (suggestedEmail) {
    return { error: `Confira seu email. Você quis dizer ${suggestedEmail}?` };
  }

  if (password.length < 8) {
    return { error: "A senha precisa ter pelo menos 8 caracteres." };
  }

  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return { error: "A senha precisa combinar letras e números." };
  }

  if (options?.occupation === "employee" && !options.employeeRole?.trim()) {
    return { error: "Selecione a função do funcionário." };
  }

  return { trimmedName, normalizedEmail };
}

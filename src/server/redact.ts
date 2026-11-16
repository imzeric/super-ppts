export function redactSecrets(message: string, secrets: string[] = []): string {
  let text = message;
  for (const secret of secrets) {
    const trimmed = secret.trim();
    if (trimmed.length >= 4) text = text.split(trimmed).join("［已隐藏］");
  }
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer ［已隐藏］")
    .replace(/\bsk-[A-Za-z0-9]{8,}\b/g, "［已隐藏］")
    .slice(0, 300);
}

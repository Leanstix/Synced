/** Best-effort diagnostic minimization; never intentionally log session payloads. */
export function redactReleaseLog(input: string): string {
  return input
    .replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|$)/g, '[REDACTED PRIVATE KEY]')
    .replace(/synced:\/\/[^\s<>"']+/gi, '[REDACTED INVITATION]')
    .replace(/("(?:secret|password|token|accessToken|refreshToken|controllerNonce|hostNonce|comparison|typedText)"\s*:\s*)"(?:\\.|[^"\\])*"/gi, '$1"[REDACTED]"')
    .replace(/\b(authorization\s*:\s*(?:bearer|basic)\s+)[^\s]+/gi, '$1[REDACTED]')
    .replace(/\b((?:secret|password|token|comparison|typedText)\s*[=:]\s*)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/\b(?:[a-f\d]{2}:){5}[a-f\d]{2}\b/gi, '[REDACTED DEVICE ADDRESS]')
    .replace(/\b(?:10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/g, '[REDACTED LOCAL ADDRESS]');
}

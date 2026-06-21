import type { ChatwootCredentialResolver } from '@opensupport/chatwoot';

export class EnvironmentSecretResolver implements ChatwootCredentialResolver {
  constructor(readonly env: NodeJS.ProcessEnv = process.env) {}

  resolve(reference: string, _tenantId?: string): string {
    if (!reference.startsWith('env:')) {
      throw new Error('Unsupported secret reference');
    }
    const name = reference.slice(4);
    if (!/^[A-Z][A-Z0-9_]{1,127}$/.test(name)) {
      throw new Error('Invalid environment secret reference');
    }
    const value = this.env[name];
    if (value === undefined || value.trim().length === 0) {
      throw new Error(`Secret is unavailable: ${name}`);
    }
    return value;
  }
}

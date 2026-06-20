import type { PIIMaskOperation } from '@opensupport/shared';

export interface MaskPIIOptions {
  preserveValues?: readonly string[] | undefined;
  replacementMapId?: string | undefined;
}

export type MaskPIIOutput = PIIMaskOperation;

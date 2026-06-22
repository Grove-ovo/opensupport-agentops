export type StructuredLog = (
  event: string,
  fields: Readonly<Record<string, unknown>>,
) => void;

export function createStructuredLog(buildVersion: string): StructuredLog {
  return (event, fields) => emitStructuredLog(buildVersion, event, fields);
}

export function writeStructuredLog(
  event: string,
  fields: Readonly<Record<string, unknown>>,
): void {
  emitStructuredLog(
    process.env.AGENTOPS_BUILD_VERSION?.trim() || 'dev',
    event,
    fields,
  );
}

function emitStructuredLog(
  buildVersion: string,
  event: string,
  fields: Readonly<Record<string, unknown>>,
): void {
  process.stdout.write(
    `${JSON.stringify({
      level: 'info',
      time: new Date().toISOString(),
      service: 'worker',
      build_version: buildVersion,
      event,
      ...fields,
    })}\n`,
  );
}

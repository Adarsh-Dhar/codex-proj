export type CompilerResult = {
  archivePath: string;
  files: string[];
  mutations?: Array<{ filename?: string; message?: string }>;
  manifest: Record<string, unknown>;
};

export function compileExtension(description: string, options?: Record<string, unknown>): Promise<CompilerResult>;
export function repairCompiledExtension(
  description: string,
  previousFiles: Record<string, string>,
  violation: { rule?: string; file?: string; detail?: string },
  options?: Record<string, unknown>,
): Promise<CompilerResult>;

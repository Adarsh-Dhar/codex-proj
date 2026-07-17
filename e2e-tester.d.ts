export function testExtension(unpackedPath: string, options?: { screenshotPath?: string; clickSelector?: string; onStage?: (label: string) => void }): Promise<{
  status: "passed" | "failed" | "skipped";
  screenshotPath?: string;
  extensionId?: string;
  message?: string;
  reason?: string;
  interacted?: boolean;
}>;

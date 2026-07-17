export function testExtension(unpackedPath: string, options?: { screenshotPath?: string; clickSelector?: string }): Promise<{
  status: "passed" | "failed" | "skipped";
  screenshotPath?: string;
  extensionId?: string;
  message?: string;
  reason?: string;
  interacted?: boolean;
}>;

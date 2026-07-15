import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { compileExtension } from "./index.js";

const EXIT_COMMANDS = new Set(["exit", "quit"]);

/** Starts an interactive CLI chat for compiling MV3 extension archives. */
export async function startChatbot() {
  const terminal = createInterface({ input, output });
  console.log("MV3 Extension Compiler. Describe an extension, or type 'exit'.");

  try {
    while (true) {
      const prompt = (await terminal.question("You: ")).trim();
      if (!prompt) continue;
      if (EXIT_COMMANDS.has(prompt.toLowerCase())) break;

      try {
        const result = await compileExtension(prompt);
        console.log(`Created: ${result.archivePath}\nFiles: ${result.files.join(", ")}`);
      } catch (error) {
        console.error(`Unable to compile a safe extension: ${error.message}`);
      }
    }
  } finally {
    terminal.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startChatbot().catch((error) => {
    console.error(`Chatbot failed: ${error.message}`);
    process.exitCode = 1;
  });
}

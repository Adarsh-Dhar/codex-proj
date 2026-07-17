"use client";

import { FormEvent, useState } from "react";

type PromptBarProps = { onGenerate: (prompt: string) => Promise<void>; generating: boolean; statusLog: string[] };

export default function PromptBar({ onGenerate, generating, statusLog }: PromptBarProps) {
  const [prompt, setPrompt] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim() || generating) return;
    await onGenerate(prompt.trim());
  }

  return (
    <form className="prompt-bar" onSubmit={submit}>
      <label htmlFor="extension-prompt">Describe an extension to generate</label>
      <div>
        <input id="extension-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="e.g. Track focused work sessions with a popup timer" />
        <button type="submit" disabled={generating || !prompt.trim()}>{generating ? "Generating…" : "Generate"}</button>
      </div>
      {generating ? <div className="prompt-terminal" role="status" aria-live="polite">
        {statusLog.map((entry) => <p key={entry}>› {entry}</p>)}
      </div> : null}
    </form>
  );
}

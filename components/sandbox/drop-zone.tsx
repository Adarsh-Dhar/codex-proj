"use client";

import { useRef, useState } from "react";

type DropZoneProps = {
  onFile: (file: File) => void;
  busy?: boolean;
};

export default function DropZone({ onFile, busy = false }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOver, setIsOver] = useState(false);

  function choose(file?: File) {
    if (file && file.name.toLowerCase().endsWith(".zip")) onFile(file);
  }

  return (
    <section
      className={`drop-zone ${isOver ? "drop-zone--over" : ""} ${busy ? "drop-zone--busy" : ""}`}
      onDragEnter={(event) => { event.preventDefault(); setIsOver(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setIsOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsOver(false);
        choose(event.dataTransfer.files[0]);
      }}
      role="button"
      tabIndex={0}
      aria-label="Choose an extension ZIP file"
      onKeyDown={(event) => event.key === "Enter" && inputRef.current?.click()}
      onClick={() => !busy && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        className="visually-hidden"
        data-testid="zip-input"
        type="file"
        accept=".zip,application/zip"
        onChange={(event) => choose(event.target.files?.[0])}
      />
      <span className="drop-zone__icon" aria-hidden="true">⇧</span>
      <p>{busy ? "Opening extension…" : "Drop an extension ZIP"}</p>
      <span>{busy ? "Reading manifest and surfaces" : "or browse your files"}</span>
    </section>
  );
}

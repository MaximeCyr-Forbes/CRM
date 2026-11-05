"use client";

export default function ToolError({reset}: {reset: () => void}) {
  return <section role="alert"><h1>Outil temporairement indisponible</h1><p>Réessayez de charger cet outil.</p><button type="button" onClick={reset}>Réessayer</button></section>;
}

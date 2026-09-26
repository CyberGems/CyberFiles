import { Monitor } from "lucide-react";
import { useLanguage } from "../locales/LanguageContext";

export function DesktopOnlyNotice() {
  const { language } = useLanguage();
  const isSpanish = language === "es";

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 text-center text-neutral-100">
      <section className="max-w-md rounded-xl border border-neutral-800 bg-neutral-900/70 p-8 shadow-xl">
        <Monitor className="mx-auto h-10 w-10 text-cyan-300" aria-hidden="true" />
        <h1 className="mt-4 text-lg font-semibold">CyberFiles</h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-300">
          {isSpanish
            ? "CyberFiles está diseñado para Windows y funciona como aplicación de escritorio. Inicia el desarrollo con npm run dev."
            : "CyberFiles is designed for Windows and runs as a desktop application. Start development with npm run dev."}
        </p>
      </section>
    </main>
  );
}

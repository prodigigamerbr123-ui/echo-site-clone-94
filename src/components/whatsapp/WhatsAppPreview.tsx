import { useEffect, useState } from "react";
import { Check, CheckCheck } from "lucide-react";
import { replaceNameVar } from "@/lib/phone";

interface Props {
  content: string;
  studentName?: string;
  className?: string;
}

/** Preview visual estilo balão do WhatsApp. */
export function WhatsAppPreview({ content, studentName, className = "" }: Props) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const name = studentName?.trim() || "Maria";
  const rendered = replaceNameVar(content || "", name).trim();
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      className={`rounded-lg border p-3 ${className}`}
      style={{
        background:
          "linear-gradient(135deg, #efeae2 0%, #d9d0c1 100%)",
        backgroundImage:
          "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.4) 0, transparent 40%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.3) 0, transparent 40%)",
      }}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-700 mb-2">
        Preview WhatsApp{" "}
        <span className="text-neutral-500 normal-case font-normal">
          (nome: {name})
        </span>
      </p>
      <div className="flex justify-end">
        <div
          className="relative max-w-[85%] rounded-lg rounded-tr-none px-3 py-2 shadow-sm"
          style={{ backgroundColor: "#d9fdd3", color: "#111b21" }}
        >
          {rendered ? (
            <p className="text-sm whitespace-pre-wrap break-words">{rendered}</p>
          ) : (
            <p className="text-sm italic text-neutral-500">Escreva a mensagem…</p>
          )}
          <div className="flex items-center justify-end gap-1 mt-1">
            <span className="text-[10px] text-neutral-600">{time}</span>
            <CheckCheck className="h-3 w-3 text-blue-500" />
          </div>
        </div>
      </div>
    </div>
  );
}

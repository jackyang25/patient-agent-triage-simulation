import { cn } from "@/lib/utils";
import type { Message, TurnAnnotation } from "@/lib/types";

interface ChatTraceProps {
  messages: Message[];
  annotations?: TurnAnnotation[];
}

function AgentAnnotationBar({ annotation }: { annotation: TurnAnnotation }) {
  const dir = annotation.escalationDirection ?? 0;
  const signals = annotation.signals ?? {};
  const fired = Object.entries(signals).filter(([, v]) => v);

  return (
    <div className="flex items-center gap-2 text-[10px] flex-wrap">
      {fired.map(([id]) => (
        <span
          key={id}
          className={dir > 0 ? "text-green-400" : dir < 0 ? "text-red-400" : "text-blue-400"}
        >
          {id}
        </span>
      ))}
      <span
        className={cn(
          "font-mono",
          dir > 0
            ? "text-green-400"
            : dir < 0
              ? "text-red-400"
              : "text-muted-foreground",
        )}
      >
        {dir > 0 ? "+1" : dir < 0 ? "-1" : "0"}
      </span>
    </div>
  );
}

function PatientAnnotationBar({ annotation }: { annotation: TurnAnnotation }) {
  if (!annotation.disclosedSignificantDetail) return null;
  return (
    <div className="text-[10px] text-amber-400">
      disclosed significant detail
    </div>
  );
}

export function ChatTrace({ messages, annotations }: ChatTraceProps) {
  const annotationMap = new Map(
    (annotations ?? []).map((a) => [a.turnIndex, a]),
  );

  return (
    <div className="space-y-3">
      {messages.map((msg, i) => {
        const isPatient = msg.role === "patient";
        const annotation = annotationMap.get(msg.turnIndex);

        return (
          <div
            key={i}
            className={cn(
              "flex flex-col gap-1 max-w-[85%]",
              isPatient ? "items-start" : "items-end ml-auto",
            )}
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {msg.role}
              </span>
              <span className="text-[10px] text-muted-foreground">
                turn {msg.turnIndex}
              </span>
            </div>

            <div
              className={cn(
                "rounded-lg px-3 py-2 text-sm leading-relaxed",
                isPatient
                  ? "bg-muted text-foreground"
                  : "bg-primary text-primary-foreground",
              )}
            >
              {msg.content}
            </div>

            {annotation && !isPatient && (
              <AgentAnnotationBar annotation={annotation} />
            )}
            {annotation && isPatient && (
              <PatientAnnotationBar annotation={annotation} />
            )}
          </div>
        );
      })}
    </div>
  );
}

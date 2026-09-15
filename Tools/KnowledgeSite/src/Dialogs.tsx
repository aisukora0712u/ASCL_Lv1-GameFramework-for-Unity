import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
type Question = {
  message: string;
  mode: "confirm" | "prompt";
  resolve: (value: string | boolean | null) => void;
};
const DialogContext = createContext<{
  confirmAction: (message: string) => Promise<boolean>;
  promptAction: (message: string) => Promise<string | null>;
}>(null!);
export const useDialogs = () => useContext(DialogContext);
export function Dialogs({ children }: { children: ReactNode }) {
  const [question, setQuestion] = useState<Question>();
  const [text, setText] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  const ask = (message: string, mode: Question["mode"]) =>
    new Promise<any>((resolve) => {
      if (pending.current) {
        resolve(null);
        return;
      }
      pending.current = true;
      setText("");
      setQuestion({ message, mode, resolve });
    });
  const finish = (accepted: boolean) => {
    question?.resolve(
      accepted
        ? question.mode === "prompt"
          ? text
          : true
        : question?.mode === "prompt"
          ? null
          : false,
    );
    pending.current = false;
    setQuestion(undefined);
  };
  useEffect(() => {
    if (!question) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => [
      ...(box.current?.querySelectorAll<HTMLElement>("input,textarea,button") ??
        []),
    ];
    focusable()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      }
      if (event.key === "Tab") {
        const items = focusable();
        const current = items.indexOf(document.activeElement as HTMLElement);
        if (event.shiftKey && current <= 0) {
          event.preventDefault();
          items.at(-1)?.focus();
        } else if (!event.shiftKey && current === items.length - 1) {
          event.preventDefault();
          items[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [question]);
  return (
    <DialogContext.Provider
      value={{
        confirmAction: (message) => ask(message, "confirm"),
        promptAction: (message) => ask(message, "prompt"),
      }}
    >
      {children}
      {question && (
        <div className="modal-backdrop">
          <div
            ref={box}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirmation-title"
            className="modal"
          >
            <h2 id="confirmation-title">
              {question.mode === "prompt" ? "填写复核记录" : "确认操作"}
            </h2>
            <p>{question.message}</p>
            {question.mode === "prompt" && (
              <label>
                复核依据
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={4}
                />
              </label>
            )}
            <div className="toolbar">
              <button onClick={() => finish(false)}>取消</button>
              <button className="primary" onClick={() => finish(true)}>
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

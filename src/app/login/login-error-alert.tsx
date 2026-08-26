import { AlertCircle } from "lucide-react";

export function LoginErrorAlert({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-[10px] border border-destructive/30 bg-destructive/10 px-3 py-2.5"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="text-[12.5px] font-semibold text-destructive">{message}</div>
    </div>
  );
}

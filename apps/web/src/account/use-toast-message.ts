"use client";

import { useCallback, useRef, useState } from "react";

/** A sentence for the status toast and the number of the telling that made it. A second telling of the same sentence has
 *  another `id`, which is what makes the toast announce it again and restart its clock. */
export interface ToastMessage {
  readonly id: number;
  readonly text: string;
}

export interface ToastMessageState {
  readonly message: ToastMessage | undefined;
  readonly tell: (text: string) => void;
  readonly clear: () => void;
}

export function useToastMessage(): ToastMessageState {
  const [message, setMessage] = useState<ToastMessage | undefined>(undefined);
  const tellingCountRef = useRef(0);
  const tell = useCallback((text: string) => {
    tellingCountRef.current += 1;
    setMessage({ id: tellingCountRef.current, text });
  }, []);
  const clear = useCallback(() => {
    setMessage(undefined);
  }, []);
  return { message, tell, clear };
}

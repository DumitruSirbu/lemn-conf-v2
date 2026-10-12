import { useCallback, useEffect, useSyncExternalStore } from "react";

// The one automatic retry: the browser says the connection is back after a send that got no answer. No timer and no
// schedule, so nothing here can send a second request while the first may still be out; the caller's `retry` is the
// same press a customer makes, which keeps the one-in-flight guard, the id and the save wait.

export type ConnectionEvent = "online" | "offline";

/** The browser's word on its connection, as far as the form uses it, so a test hands in its own. */
export interface ConnectionPort {
  readonly isOnline: () => boolean;
  /** Calls the listener at each such event until the returned function is called. */
  readonly listen: (event: ConnectionEvent, listener: () => void) => () => void;
}

export const BROWSER_CONNECTION: ConnectionPort = {
  isOnline: () => navigator.onLine,
  listen: (event, listener) => {
    window.addEventListener(event, listener);
    return () => {
      window.removeEventListener(event, listener);
    };
  },
};

export interface RetryWhenOnline {
  readonly connection: ConnectionPort;
  /** Whether the last send got no answer: the only state the connection's return may retry. */
  readonly isWaitingForConnection: boolean;
  readonly retry: () => void;
}

/** Calls `retry` once per `online` event, and only while the last send is waiting for the connection. */
export function useRetryWhenOnline({
  connection,
  isWaitingForConnection,
  retry,
}: RetryWhenOnline): void {
  useEffect(() => {
    if (!isWaitingForConnection) return undefined;
    return connection.listen("online", retry);
  }, [connection, isWaitingForConnection, retry]);
}

/** Whether the browser says it is online; a server render, which has no connection to ask, says it is. */
export function useIsOnline(
  connection: ConnectionPort = BROWSER_CONNECTION,
): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      const stopOnline = connection.listen("online", notify);
      const stopOffline = connection.listen("offline", notify);
      return () => {
        stopOnline();
        stopOffline();
      };
    },
    [connection],
  );
  return useSyncExternalStore(subscribe, connection.isOnline, isOnlineOnServer);
}

function isOnlineOnServer(): boolean {
  return true;
}

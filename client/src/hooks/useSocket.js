import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

let sharedSocket = null;
function getSocket() {
  if (sharedSocket) return sharedSocket;
  sharedSocket = io({
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1500,
  });
  return sharedSocket;
}

export function useSocket(events) {
  const eventsRef = useRef(events);
  eventsRef.current = events;

  useEffect(() => {
    const socket = getSocket();
    const handlers = {};
    for (const name of Object.keys(eventsRef.current || {})) {
      const h = (payload) => {
        const cb = eventsRef.current?.[name];
        if (cb) cb(payload);
      };
      handlers[name] = h;
      socket.on(name, h);
    }
    return () => {
      for (const [name, h] of Object.entries(handlers)) socket.off(name, h);
    };
    // events ref captures everything; the effect should run once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

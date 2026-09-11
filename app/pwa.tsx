"use client";

import { useEffect } from "react";

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !window.isSecureContext || !("serviceWorker" in navigator)) return Promise.resolve(null);
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker.register("/sw.js", { scope: "/" })
      .then(async () => {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          return await Promise.race([
            navigator.serviceWorker.ready,
            new Promise<null>(resolve => { timeout = setTimeout(() => resolve(null), 8000); }),
          ]);
        } finally { clearTimeout(timeout); }
      })
      .catch(() => null)
      .then(result => { if (!result) registrationPromise = null; return result; });
  }
  return registrationPromise;
}

export default function PwaClient() {
  useEffect(() => { void getServiceWorkerRegistration(); }, []);
  return null;
}

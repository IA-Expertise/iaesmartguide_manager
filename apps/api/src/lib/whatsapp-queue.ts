const chains = new Map<string, Promise<unknown>>();

/** Processa mensagens do mesmo número em série — evita race ao enviar várias fotos seguidas */
export function enqueueForPhone<T>(phone: string, fn: () => Promise<T>): Promise<T> {
  const canonical = phone.replace(/\D/g, "");
  const prev = chains.get(canonical) ?? Promise.resolve();

  const next = prev
    .catch(() => undefined)
    .then(fn)
    .finally(() => {
      if (chains.get(canonical) === next) {
        chains.delete(canonical);
      }
    });

  chains.set(canonical, next);
  return next;
}

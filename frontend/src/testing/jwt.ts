/** Genera un JWT falso (solo el payload importa en el frontend) para pruebas unitarias. */
export function makeToken(expSecondsFromNow: number): string {
  const payload = btoa(JSON.stringify({ sub: '1', exp: Math.floor(Date.now() / 1000) + expSecondsFromNow }));
  return `header.${payload}.firma`;
}

export function demoRoutes(
  value: string | undefined,
): Array<
  | { src: string; dest: string; headers?: Record<string, string> }
  | { handle: string }
>;

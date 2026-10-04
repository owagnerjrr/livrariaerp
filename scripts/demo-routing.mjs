export function demoRoutes(value) {
  let api;
  try {
    api = new URL(value);
  } catch {
    throw new Error(
      "Configure DEMO_API_ORIGIN com a origem HTTPS da API remota.",
    );
  }
  if (
    api.protocol !== "https:" ||
    api.username ||
    api.password ||
    api.search ||
    api.hash ||
    api.pathname !== "/" ||
    ["localhost", "127.0.0.1", "[::1]", "0.0.0.0"].includes(api.hostname) ||
    api.hostname.endsWith(".invalid") ||
    !api.hostname.includes(".")
  )
    throw new Error(
      "DEMO_API_ORIGIN deve ser uma origem HTTPS remota sem credenciais, caminho ou parâmetros.",
    );
  return [
    {
      src: "^/api(?:/(.*))?$",
      dest: `${api.origin}/api/$1`,
      headers: { "Cache-Control": "no-store" },
    },
    { handle: "filesystem" },
    { src: "/.*", dest: "/index.html" },
  ];
}

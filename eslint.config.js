import js from "@eslint/js";
import tseslint from "typescript-eslint";

const nodeGlobals = {
  process: "readonly", console: "readonly", Buffer: "readonly",
  __dirname: "readonly", setTimeout: "readonly", clearTimeout: "readonly",
  setInterval: "readonly", clearInterval: "readonly", URL: "readonly",
  URLSearchParams: "readonly", TextEncoder: "readonly", TextDecoder: "readonly",
  fetch: "readonly", NodeJS: "readonly", crypto: "readonly",
};

/**
 * El dominio es PURO: no importa nada del ecosistema de I/O. Esa es la razón
 * por la que estas 209 pruebas corren sin base de datos, y la que permitirá
 * compartir este paquete con el gateway offline del Sprint 7 (ADR-015).
 */
export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  { languageOptions: { globals: nodeGlobals } },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@gymflow/db", "@prisma/client", "fastify", "next", "pg"],
          message: "El dominio no puede depender de I/O. Si necesitas datos, recíbelos como argumento.",
        }],
      }],
    },
  },
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  { files: ["test/**/*.ts"], rules: { "@typescript-eslint/no-explicit-any": "off" } },
);

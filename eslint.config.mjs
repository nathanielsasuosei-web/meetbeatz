import path from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

// `eslint-config-next` 14.x only ships the legacy (eslintrc) configs, so it has to be
// bridged into flat config with FlatCompat. The `eslint/config` +
// `eslint-config-next/core-web-vitals` imports used here previously only exist for
// ESLint 9 / Next 15, which made `npm run lint` throw ERR_PACKAGE_PATH_NOT_EXPORTED.
const compat = new FlatCompat({
  baseDirectory: path.dirname(fileURLToPath(import.meta.url)),
});

const config = [
  ...compat.extends("next/core-web-vitals"),
  {
    ignores: [".next/**", "out/**", "build/**", "next-env.d.ts"],
  },
];

export default config;

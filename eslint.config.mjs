import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
    ...nextVitals,
    ...nextTs,
    {
        rules: {
            "padding-line-between-statements": [
                "error",
                {
                    blankLine: "always",
                    prev: "*",
                    next: ["return", "block-like", "const", "let"],
                },
                {
                    blankLine: "always",
                    prev: ["block-like", "const", "let", "directive"],
                    next: "*",
                },
                {
                    blankLine: "any",
                    prev: ["const", "let"],
                    next: ["const", "let"],
                },
            ],
        },
    },
]);

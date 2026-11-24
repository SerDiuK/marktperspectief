import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const { session_id, transcript_path, tool_input } = JSON.parse(readFileSync(0, "utf8"));
// Once per session: the retry goes through, so a skill that fails to load never locks Claude out.
const denied = join(tmpdir(), `component-skill-${session_id}`);

if (
    relative(process.env.CLAUDE_PROJECT_DIR, tool_input.file_path).startsWith("src/components/") &&
    !existsSync(tool_input.file_path) &&
    !existsSync(denied) &&
    !skillLoaded()
) {
    writeFileSync(denied, "");
    process.stdout.write(
        JSON.stringify({
            hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: "deny",
                permissionDecisionReason:
                    "A new component starts with the component skill: load it with the Skill tool, then write this file again.",
            },
        }),
    );
}

function skillLoaded() {
    return (
        existsSync(transcript_path) &&
        /"skill":"component"[,}]|<command-name>\/component<\/command-name>/.test(readFileSync(transcript_path, "utf8"))
    );
}

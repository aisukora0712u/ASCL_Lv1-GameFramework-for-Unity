import { readProjectRoadmap } from "./roadmap.ts";
const command = process.argv[2] ?? "validate";
if (!["validate", "summary"].includes(command)) {
  console.error("用法：node server/roadmap-cli.ts validate|summary（只读）");
  process.exitCode = 2;
} else {
  const data = await readProjectRoadmap();
  console.log(
    JSON.stringify(
      {
        valid: data.valid,
        revision: data.revision,
        phases: data.phases.length,
        areas: data.plan?.meta.areas.length ?? 0,
        capabilities: data.coverage.length,
        goals: data.goals.length,
        summary: data.summary,
        phaseProgress: command === "summary" ? data.phaseProgress : undefined,
        diagnostics: data.diagnostics,
      },
      null,
      2,
    ),
  );
  if (!data.valid) process.exitCode = 1;
}

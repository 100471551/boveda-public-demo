import fs from "node:fs/promises";
import path from "node:path";
import { readRecord } from "../engine/persistence.mjs";
import { createProjectReportProjection, renderProjectReportHtml, renderReportPdf } from "../engine/report-export.mjs";

const [projectId, outputFile] = process.argv.slice(2);
if (!projectId || !outputFile) throw new Error("Usage: node scripts/generate-stored-report.mjs <project-id> <output.html|output.pdf>");

const record = await readRecord(projectId);
if (!record) throw new Error(`Stored project not found: ${projectId}`);
const projection = await createProjectReportProjection(record);
const report = renderProjectReportHtml(projection);
const resolved = path.resolve(outputFile);
await fs.mkdir(path.dirname(resolved), { recursive: true });
if (path.extname(resolved).toLowerCase() === ".pdf") await fs.writeFile(resolved, await renderReportPdf(report));
else await fs.writeFile(resolved, report, "utf8");
process.stdout.write(`${resolved}\n`);

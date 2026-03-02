/**
 * E2E API test runner — imports all suites and runs them in order.
 *
 * Flow:
 *   1. Happy path — JSON backup: upload → query → preview → download → restore → content compare
 *   2. Happy path — ZIP backup: upload → extract → preview → download → restore → content compare
 *   3. Happy path — GZ backup: upload → extract → preview → download → restore
 *   4. Happy path — TGZ backup: upload → extract → preview → download
 *   5. Unknown file type: upload → no extract → no preview → download → restore
 *   6. Error paths — invalid auth, empty file, bad environment, 404s
 *   7. Cleanup — delete all test backups, verify deletion
 */

import { results } from "./framework";
import { state } from "./config";

// --- Suite imports ---
import { suiteHealthCheck } from "./suites/health-check";
import { suiteDashboardStats } from "./suites/dashboard-stats";
import { suiteHappyPathJson } from "./suites/happy-path-json";
import { suiteHappyPathZip } from "./suites/happy-path-zip";
import { suiteHappyPathGz } from "./suites/happy-path-gz";
import { suiteHappyPathTgz } from "./suites/happy-path-tgz";
import { suiteUnknownFileType } from "./suites/unknown-file-type";
import { suiteErrorPaths } from "./suites/error-paths";
import { suiteWebhookLogs } from "./suites/webhook-logs";
import { suiteCategoryCrud } from "./suites/category-crud";
import { suiteManualUpload } from "./suites/manual-upload";
import { suiteProjectCrud } from "./suites/project-crud";
import { suiteTokenRegeneration } from "./suites/token-regeneration";
import { suiteWebhookGetStatus } from "./suites/webhook-get-status";
import { suiteCronAutoBackup } from "./suites/cron-auto-backup";
import { suiteBackupListAdvanced } from "./suites/backup-list-advanced";
import { suiteSingleBackupDelete } from "./suites/single-backup-delete";
import { suitePromptGeneration } from "./suites/prompt-generation";
import { suiteLogDeletion } from "./suites/log-deletion";
import { suiteProjectCascadeDelete } from "./suites/project-cascade-delete";
import { suiteCleanup } from "./suites/cleanup";

export async function runE2ETests(url: string): Promise<{ passed: number; failed: number; total: number }> {
  state.baseUrl = url;
  results.length = 0;
  state.createdBackupIds.length = 0;
  state.createdCategoryIds.length = 0;
  state.createdProjectIds.length = 0;

  console.log("🎯 E2E Tests — Backy Self-Bootstrap via backy-test project");
  console.log(`   Base URL: ${state.baseUrl}`);
  console.log(`   Project:  backy-test (mnp039joh6yiala5UY0Hh)`);

  // Verify server is live
  const liveRes = await fetch(`${state.baseUrl}/api/live`);
  if (!liveRes.ok) {
    throw new Error("Server is not responding to health check");
  }

  // Ensure schema is up-to-date (creates webhook_logs table etc.)
  const initRes = await fetch(`${state.baseUrl}/api/db/init`, { method: "POST" });
  if (!initRes.ok) {
    throw new Error(`Schema init failed: ${initRes.status}`);
  }

  // --- Infrastructure suites ---
  await suiteHealthCheck();
  await suiteDashboardStats();

  // --- Core data flow suites ---
  await suiteHappyPathJson();
  await suiteHappyPathZip();
  await suiteHappyPathGz();
  await suiteHappyPathTgz();
  await suiteUnknownFileType();
  await suiteErrorPaths();
  await suiteWebhookLogs();
  await suiteCategoryCrud();
  await suiteManualUpload();

  // --- Project lifecycle suites ---
  await suiteProjectCrud();
  await suiteTokenRegeneration();

  // --- Public API suites ---
  await suiteWebhookGetStatus();

  // --- Cron auto-backup suites ---
  await suiteCronAutoBackup();

  // --- Query & filter suites ---
  await suiteBackupListAdvanced();

  // --- Delete suites ---
  await suiteSingleBackupDelete();

  // --- Utility suites ---
  await suitePromptGeneration();
  await suiteLogDeletion();

  // --- Cascade & cleanup ---
  await suiteProjectCascadeDelete();
  await suiteCleanup();

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return { passed, failed, total: results.length };
}

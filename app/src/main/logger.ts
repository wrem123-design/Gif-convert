import { app } from "electron";
import path from "node:path";
import fs from "fs-extra";
import util from "node:util";

type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

const LOG_DIR_NAME = "logs";
const MAX_LOG_FILES = 14;
const MAX_LOG_AGE_MS = 1000 * 60 * 60 * 24 * 14;
const MAX_TOTAL_LOG_BYTES = 10 * 1024 * 1024;

let activeLogFilePath: string | null = null;
let writeQueue: Promise<void> = Promise.resolve();
let consolePatched = false;
let processHandlersRegistered = false;
let sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function getLogDirPath(): string {
  return path.join(app.getPath("userData"), LOG_DIR_NAME);
}

function getLogFilePath(date = new Date()): string {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return path.join(getLogDirPath(), `app-${yyyy}-${mm}-${dd}.log`);
}

function stringifyLogValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Error) {
    return value.stack || `${value.name}: ${value.message}`;
  }
  return util.inspect(value, { depth: 5, breakLength: 140, compact: false });
}

function formatLogMessage(values: unknown[]): string {
  return values.map((value) => stringifyLogValue(value)).join(" ");
}

function writeLine(line: string): void {
  if (!activeLogFilePath) {
    return;
  }
  writeQueue = writeQueue
    .then(async () => {
      await fs.ensureDir(path.dirname(activeLogFilePath as string));
      await fs.appendFile(activeLogFilePath as string, `${line}\n`, "utf8");
    })
    .catch(() => {
      // Logging must never break the app.
    });
}

function formatLine(level: LogLevel, scope: string, message: string): string {
  return `[${new Date().toISOString()}] [${level}] [${scope}] ${message}`;
}

export function logMain(level: LogLevel, scope: string, ...values: unknown[]): void {
  writeLine(formatLine(level, scope, formatLogMessage(values)));
}

function patchConsole(): void {
  if (consolePatched) {
    return;
  }
  consolePatched = true;

  const original = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console)
  };

  console.log = (...args: unknown[]) => {
    original.log(...args);
    logMain("INFO", "console", ...args);
  };
  console.info = (...args: unknown[]) => {
    original.info(...args);
    logMain("INFO", "console", ...args);
  };
  console.warn = (...args: unknown[]) => {
    original.warn(...args);
    logMain("WARN", "console", ...args);
  };
  console.error = (...args: unknown[]) => {
    original.error(...args);
    logMain("ERROR", "console", ...args);
  };
  console.debug = (...args: unknown[]) => {
    original.debug(...args);
    logMain("DEBUG", "console", ...args);
  };
}

function registerProcessHandlers(): void {
  if (processHandlersRegistered) {
    return;
  }
  processHandlersRegistered = true;

  process.on("uncaughtException", (error) => {
    logMain("ERROR", "process", "uncaughtException", error);
  });
  process.on("unhandledRejection", (reason) => {
    logMain("ERROR", "process", "unhandledRejection", reason);
  });
}

async function cleanupOldLogs(): Promise<void> {
  const logDir = getLogDirPath();
  const exists = await fs.pathExists(logDir);
  if (!exists) {
    return;
  }

  const entries = (await fs.readdir(logDir))
    .filter((name) => name.endsWith(".log"))
    .map((name) => path.join(logDir, name));

  const stats = await Promise.all(entries.map(async (filePath) => ({
    filePath,
    stat: await fs.stat(filePath)
  })));

  const now = Date.now();
  const sorted = stats.sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs);
  let totalBytes = 0;
  const keep = new Set<string>();

  for (const [index, entry] of sorted.entries()) {
    const isFreshEnough = now - entry.stat.mtimeMs <= MAX_LOG_AGE_MS;
    const fitsCount = index < MAX_LOG_FILES;
    const fitsSize = totalBytes + entry.stat.size <= MAX_TOTAL_LOG_BYTES;
    if (isFreshEnough && fitsCount && fitsSize) {
      keep.add(entry.filePath);
      totalBytes += entry.stat.size;
    }
  }

  await Promise.all(sorted
    .filter((entry) => !keep.has(entry.filePath))
    .map(async (entry) => {
      await fs.remove(entry.filePath);
    }));
}

export async function initAppLogging(): Promise<string> {
  activeLogFilePath = getLogFilePath();
  await fs.ensureDir(getLogDirPath());
  await cleanupOldLogs();
  patchConsole();
  registerProcessHandlers();
  logMain(
    "INFO",
    "session",
    `Session started`,
    {
      sessionId,
      pid: process.pid,
      version: app.getVersion(),
      packaged: app.isPackaged
    }
  );
  return getLogDirPath();
}

export function getAppLogDir(): string {
  return getLogDirPath();
}

export async function flushAppLogs(): Promise<void> {
  await writeQueue;
}

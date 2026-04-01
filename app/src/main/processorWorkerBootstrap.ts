import path from "node:path";
import { createRequire } from "node:module";
import { workerData } from "node:worker_threads";

interface WorkerBootstrapData {
  appRoot?: string;
}

const appRoot = (() => {
  const data = workerData as WorkerBootstrapData | undefined;
  if (data && typeof data.appRoot === "string" && data.appRoot) {
    return data.appRoot;
  }
  return path.resolve(__dirname, "..", "..");
})();

const appRequire = createRequire(path.join(appRoot, "package.json"));
appRequire("./dist/main/processorWorker.js");

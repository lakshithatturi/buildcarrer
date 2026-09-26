import { execFile } from "node:child_process";
import { spawn } from "node:child_process";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ollamaUrl = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const modelDirectory = path.join(homedir(), ".northstar", "models");
const ollamaExecutable =
  process.env.OLLAMA_BIN ||
  (process.platform === "win32"
    ? path.join(
        process.env.LOCALAPPDATA || path.join(homedir(), "AppData", "Local"),
        "Programs",
        "Ollama",
        "ollama.exe",
      )
    : "ollama");

const models = [
  {
    filename: "Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
    minimumBytes: 2_300_000_000,
    url: "https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/18727206c51467496bfba014368bd0a30e97f411/Qwen3-4B-Instruct-2507-Q4_K_M.gguf?download=true",
  },
  {
    filename: "nomic-embed-text-v1.5.Q4_K_M.gguf",
    minimumBytes: 80_000_000,
    url: "https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/18d1044f4866e224159fce8c6fc5c4f3920176e7/nomic-embed-text-v1.5.Q4_K_M.gguf?download=true",
  },
];

async function downloadModel(model) {
  const destination = path.join(modelDirectory, model.filename);
  const partialPath = `${destination}.partial`;

  try {
    const existing = await stat(destination);
    if (existing.size >= model.minimumBytes) {
      console.log(`${model.filename} is already downloaded.`);
      return destination;
    }
  } catch {
    // Download the model when no complete file exists yet.
  }

  await new Promise((resolve, reject) => {
    const curl = spawn(
      process.platform === "win32" ? "curl.exe" : "curl",
      [
        "--fail",
        "--location",
        "--retry",
        "5",
        "--retry-all-errors",
        "--continue-at",
        "-",
        "--output",
        partialPath,
        "--progress-bar",
        model.url,
      ],
      { stdio: "inherit", windowsHide: true },
    );

    curl.once("error", reject);
    curl.once("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `curl failed to download ${model.filename} (exit ${code}).`,
          ),
        );
      }
    });
  });

  const downloadedSize = (await stat(partialPath)).size;
  if (downloadedSize < model.minimumBytes) {
    throw new Error(
      `Downloaded ${model.filename} is incomplete (${downloadedSize} bytes). The partial file is preserved so the next run can resume it.`,
    );
  }

  await rename(partialPath, destination);
  console.log(
    `Downloaded ${model.filename} (${(downloadedSize / 1_000_000_000).toFixed(2)} GB).`,
  );
  return destination;
}

async function waitForOllama() {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    try {
      const response = await fetch(`${ollamaUrl}/api/version`);
      if (response.ok) return;
    } catch {
      // The local service may still be starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(
    `Ollama is not running at ${ollamaUrl}. Start the Ollama app and retry.`,
  );
}

async function createOllamaModel(name, modelfile) {
  await execFileAsync(ollamaExecutable, ["create", name, "-f", modelfile], {
    cwd: modelDirectory,
    windowsHide: true,
  });
}

await mkdir(modelDirectory, { recursive: true });
await waitForOllama();

const [qwenPath, nomicPath] = await Promise.all(models.map(downloadModel));
const qwenModelfile = `FROM ./${path.basename(qwenPath)}\nPARAMETER num_ctx 4096\nPARAMETER num_predict 1024\nPARAMETER temperature 0.1\n`;
const nomicModelfile = `FROM ./${path.basename(nomicPath)}\n`;

await writeFile(path.join(modelDirectory, "Modelfile.qwen"), qwenModelfile);
await writeFile(path.join(modelDirectory, "Modelfile.nomic"), nomicModelfile);

console.log("Importing Qwen3 into Ollama...");
await createOllamaModel("northstar-qwen3", "Modelfile.qwen");
console.log("Importing Nomic Embed into Ollama...");
await createOllamaModel("northstar-nomic-embed", "Modelfile.nomic");
console.log("Both local models are ready for Northstar.");

import "./load-env";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";

const host = "127.0.0.1";
const port = numberEnv("VOICE_SAMPLER_PORT", 4317);
const outputDir = path.join(process.cwd(), "tmp", "voice-sampler");
const openAiModel = process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts";
const geminiModel = process.env.GEMINI_TTS_MODEL ?? "gemini-2.5-flash-preview-tts";

type Provider = "openai" | "gemini";

type Sample = {
  id: string;
  provider: Provider;
  title: string;
  subtitle: string;
  model: string;
  voices: string[];
  mode: "single" | "duo";
  generate: () => Promise<Buffer>;
};

type SampleMetadata = {
  id: string;
  provider: Provider;
  title: string;
  subtitle: string;
  model: string;
  voices: string[];
  mode: "single" | "duo";
  generated: boolean;
  audioUrl: string | null;
};

const singlePrompt =
  "Say as a natural weekly tech podcast host, with warm skepticism, crisp pacing, " +
  "and a little conversational texture: The interesting part this week is not the demo. " +
  "It is whether the workflow survives contact with messy data, impatient users, " +
  "and the need to explain itself clearly.";

const duoLines = [
  {
    speaker: "Maya",
    text:
      "The headline this week is not that every AI agent suddenly became useful. " +
      "It is that the economics are forcing a split between impressive demos and durable workflows.",
  },
  {
    speaker: "Leo",
    text:
      "Right, and that split matters. The clips get attention, but the boring parts, " +
      "evals, handoffs, retries, and source checks, are where the product quality actually shows up.",
  },
  {
    speaker: "Maya",
    text:
      "Exactly. NotebookLM works because it sounds like two people thinking through the material, " +
      "not two voices reading a memo. That is the bar we are testing here.",
  },
];

const samples: Sample[] = [
  ...["marin", "cedar", "nova", "onyx"].map((voice) => ({
    id: `openai-${voice}`,
    provider: "openai" as const,
    title: `OpenAI ${voice}`,
    subtitle: "Single-host read with style instructions",
    model: openAiModel,
    voices: [voice],
    mode: "single" as const,
    generate: () => generateOpenAiSpeech(voice, singlePrompt, openAiSingleInstructions),
  })),
  {
    id: "openai-marin-cedar-duo",
    provider: "openai",
    title: "OpenAI marin + cedar",
    subtitle: "Two-host sample stitched from separate TTS calls",
    model: openAiModel,
    voices: ["marin", "cedar"],
    mode: "duo",
    generate: () => generateOpenAiDuo("marin", "cedar"),
  },
  {
    id: "openai-nova-onyx-duo",
    provider: "openai",
    title: "OpenAI nova + onyx",
    subtitle: "Two-host sample stitched from separate TTS calls",
    model: openAiModel,
    voices: ["nova", "onyx"],
    mode: "duo",
    generate: () => generateOpenAiDuo("nova", "onyx"),
  },
  ...[
    ["Puck", "upbeat"],
    ["Charon", "informative"],
    ["Achird", "friendly"],
    ["Sulafat", "warm"],
    ["Aoede", "breezy"],
    ["Sadaltager", "knowledgeable"],
  ].map(([voice, label]) => ({
    id: `gemini-${voice.toLowerCase()}`,
    provider: "gemini" as const,
    title: `Gemini ${voice}`,
    subtitle: `Single-host ${label} voice`,
    model: geminiModel,
    voices: [voice],
    mode: "single" as const,
    generate: () => generateGeminiSingle(voice),
  })),
  {
    id: "gemini-puck-kore-duo",
    provider: "gemini",
    title: "Gemini Puck + Kore",
    subtitle: "Native multi-speaker podcast exchange",
    model: geminiModel,
    voices: ["Puck", "Kore"],
    mode: "duo",
    generate: () => generateGeminiDuo("Puck", "Kore"),
  },
  {
    id: "gemini-achird-sulafat-duo",
    provider: "gemini",
    title: "Gemini Achird + Sulafat",
    subtitle: "Native multi-speaker podcast exchange",
    model: geminiModel,
    voices: ["Achird", "Sulafat"],
    mode: "duo",
    generate: () => generateGeminiDuo("Achird", "Sulafat"),
  },
  {
    id: "gemini-charon-aoede-duo",
    provider: "gemini",
    title: "Gemini Charon + Aoede",
    subtitle: "Native multi-speaker podcast exchange",
    model: geminiModel,
    voices: ["Charon", "Aoede"],
    mode: "duo",
    generate: () => generateGeminiDuo("Charon", "Aoede"),
  },
];

const samplesById = new Map(samples.map((sample) => [sample.id, sample]));

const openAiSingleInstructions =
  "Natural podcast delivery. Avoid announcer polish. Use subtle pauses, conversational " +
  "emphasis, and a thoughtful but lively tone.";

const openAiDuoInstructions = {
  Maya:
    "Analytical female podcast host. Warm, dry, curious, and precise. Sound like you are " +
    "thinking while speaking, not reading copy.",
  Leo:
    "Conversational male podcast co-host. Plain-spoken, skeptical, and lightly amused. " +
    "React naturally while keeping the explanation clear.",
};

async function main() {
  await mkdir(outputDir, { recursive: true });

  const server = createServer(async (request, response) => {
    try {
      await route(request, response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown server error.";
      sendJson(response, 500, { error: message });
    }
  });

  server.listen(port, host, () => {
    console.log(`Voice sampler running at http://${host}:${port}`);
    console.log("Audio samples are generated on demand and stored under tmp/voice-sampler.");
  });
}

async function route(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);

  if (request.method === "GET" && url.pathname === "/") {
    sendHtml(response, renderPage());
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/samples") {
    sendJson(response, 200, await allMetadata());
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/generate") {
    const body = await readJson<{ id?: unknown }>(request);
    if (typeof body.id !== "string") {
      sendJson(response, 400, { error: "Sample id is required." });
      return;
    }

    const sample = samplesById.get(body.id);
    if (!sample) {
      sendJson(response, 404, { error: "Unknown sample id." });
      return;
    }

    await generateAndSave(sample);
    sendJson(response, 200, await metadataFor(sample));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/generate-all") {
    const generated: SampleMetadata[] = [];
    const errors: Array<{ id: string; error: string }> = [];

    for (const sample of samples) {
      try {
        await generateAndSave(sample);
        generated.push(await metadataFor(sample));
      } catch (error) {
        errors.push({
          id: sample.id,
          error: error instanceof Error ? error.message : "Unknown generation error.",
        });
      }
    }

    sendJson(response, errors.length ? 207 : 200, { generated, errors });
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/audio/")) {
    await sendAudio(response, decodeURIComponent(url.pathname.slice("/audio/".length)));
    return;
  }

  sendJson(response, 404, { error: "Not found." });
}

async function generateAndSave(sample: Sample) {
  const buffer = await sample.generate();
  await writeFile(samplePath(sample.id), buffer);
}

async function generateOpenAiSpeech(voice: string, input: string, instructions: string) {
  const apiKey = requiredEnv("OPENAI_API_KEY");
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: openAiModel,
      voice,
      input,
      instructions,
      response_format: "wav",
    }),
  });

  if (!response.ok) {
    throw new Error(await providerError("OpenAI TTS", response));
  }

  return Buffer.from(await response.arrayBuffer());
}

async function generateOpenAiDuo(mayaVoice: string, leoVoice: string) {
  const wavs: Buffer[] = [];

  for (const line of duoLines) {
    const voice = line.speaker === "Maya" ? mayaVoice : leoVoice;
    const instructions =
      line.speaker === "Maya" ? openAiDuoInstructions.Maya : openAiDuoInstructions.Leo;
    wavs.push(await generateOpenAiSpeech(voice, line.text, instructions));
  }

  return concatenateWavs(wavs);
}

async function generateGeminiSingle(voice: string) {
  const prompt =
    "Read this as a natural weekly tech podcast host. Sound thoughtful, lightly skeptical, " +
    "and conversational, with realistic pacing and small pauses.\n\n" +
    singlePrompt.replace(/^Say as .*?: /, "");

  const pcm = await generateGeminiAudio({
    text: prompt,
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: voice,
        },
      },
    },
  });

  return createWav(pcm);
}

async function generateGeminiDuo(mayaVoice: string, leoVoice: string) {
  const transcript = duoLines.map((line) => `${line.speaker}: ${line.text}`).join("\n");
  const prompt =
    "Make Maya sound analytical, warm, precise, and a little dry. " +
    "Make Leo sound plain-spoken, skeptical, and lightly amused. " +
    "Keep the exchange natural, like two hosts thinking through the source material.\n\n" +
    transcript;

  const pcm = await generateGeminiAudio({
    text: prompt,
    speechConfig: {
      multiSpeakerVoiceConfig: {
        speakerVoiceConfigs: [
          {
            speaker: "Maya",
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: mayaVoice,
              },
            },
          },
          {
            speaker: "Leo",
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: leoVoice,
              },
            },
          },
        ],
      },
    },
  });

  return createWav(pcm);
}

async function generateGeminiAudio(input: { text: string; speechConfig: unknown }) {
  const apiKey = requiredEnv("GEMINI_API_KEY");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: input.text,
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: input.speechConfig,
        },
        model: geminiModel,
      }),
    },
  );

  const body = (await response.json().catch(() => null)) as GeminiResponse | null;
  if (!response.ok) {
    throw new Error(providerJsonError("Gemini TTS", response.status, body));
  }

  const data = body?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!data) {
    throw new Error("Gemini TTS did not return inline audio data.");
  }

  return Buffer.from(data, "base64");
}

type GeminiResponse = {
  error?: {
    message?: string;
  };
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: {
          data?: string;
        };
      }>;
    };
  }>;
};

async function providerError(label: string, response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    return providerJsonError(label, response.status, body);
  }
  const text = await response.text().catch(() => "");
  return `${label} failed with status ${response.status}${text ? `: ${text}` : ""}`;
}

function providerJsonError(label: string, statusCode: number, body: { error?: { message?: string } } | null) {
  const message = body?.error?.message;
  return `${label} failed with status ${statusCode}${message ? `: ${message}` : ""}`;
}

function createWav(pcm: Buffer, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

function concatenateWavs(wavs: Buffer[]) {
  const parsed = wavs.map(parseWav);
  const first = parsed[0];

  for (const wav of parsed.slice(1)) {
    if (
      wav.audioFormat !== first.audioFormat ||
      wav.channels !== first.channels ||
      wav.sampleRate !== first.sampleRate ||
      wav.bitsPerSample !== first.bitsPerSample
    ) {
      throw new Error("OpenAI returned incompatible WAV formats for stitching.");
    }
  }

  return createWav(
    Buffer.concat(parsed.map((wav) => wav.data)),
    first.sampleRate,
    first.channels,
    first.bitsPerSample,
  );
}

function parseWav(buffer: Buffer) {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Provider did not return WAV audio.");
  }

  let offset = 12;
  let audioFormat = 1;
  let channels = 1;
  let sampleRate = 24000;
  let bitsPerSample = 16;
  let data: Buffer | null = null;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;

    if (chunkEnd > buffer.length) break;

    if (chunkId === "fmt ") {
      audioFormat = buffer.readUInt16LE(chunkStart);
      channels = buffer.readUInt16LE(chunkStart + 2);
      sampleRate = buffer.readUInt32LE(chunkStart + 4);
      bitsPerSample = buffer.readUInt16LE(chunkStart + 14);
    }

    if (chunkId === "data") {
      data = buffer.subarray(chunkStart, chunkEnd);
    }

    offset = chunkEnd + (chunkSize % 2);
  }

  if (!data) {
    throw new Error("WAV response did not include a data chunk.");
  }

  return { audioFormat, channels, sampleRate, bitsPerSample, data };
}

async function allMetadata() {
  return Promise.all(samples.map(metadataFor));
}

async function metadataFor(sample: Sample): Promise<SampleMetadata> {
  const generated = await exists(samplePath(sample.id));
  return {
    id: sample.id,
    provider: sample.provider,
    title: sample.title,
    subtitle: sample.subtitle,
    model: sample.model,
    voices: sample.voices,
    mode: sample.mode,
    generated,
    audioUrl: generated ? `/audio/${sample.id}.wav` : null,
  };
}

async function sendAudio(response: ServerResponse, fileName: string) {
  const allowed = new Set(samples.map((sample) => `${sample.id}.wav`));
  if (!allowed.has(fileName)) {
    sendJson(response, 404, { error: "Unknown audio file." });
    return;
  }

  const filePath = path.join(outputDir, fileName);
  if (!(await exists(filePath))) {
    sendJson(response, 404, { error: "Audio has not been generated yet." });
    return;
  }

  const buffer = await readFile(filePath);
  response.writeHead(200, {
    "content-type": "audio/wav",
    "content-length": String(buffer.length),
    "cache-control": "no-store",
  });
  response.end(buffer);
}

function samplePath(id: string) {
  return path.join(outputDir, `${id}.wav`);
}

async function exists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return (raw ? JSON.parse(raw) : {}) as T;
}

function sendHtml(response: ServerResponse, html: string) {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(html);
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function renderPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Voice Sampler</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f6f2;
      --text: #1f2933;
      --muted: #637083;
      --line: #d9dde5;
      --panel: #ffffff;
      --accent: #0f766e;
      --accent-dark: #115e59;
      --danger: #9f1239;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    main {
      width: min(1180px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 32px 0 44px;
    }
    header {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 20px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--line);
    }
    h1 {
      margin: 0;
      font-size: clamp(1.8rem, 4vw, 3rem);
      line-height: 1;
      letter-spacing: 0;
    }
    p {
      margin: 8px 0 0;
      color: var(--muted);
      line-height: 1.5;
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    button {
      min-height: 40px;
      border: 1px solid var(--line);
      border-radius: 7px;
      background: var(--panel);
      color: var(--text);
      padding: 0 14px;
      font: inherit;
      cursor: pointer;
    }
    button.primary {
      border-color: var(--accent);
      background: var(--accent);
      color: white;
    }
    button:hover { border-color: var(--accent-dark); }
    button:disabled {
      cursor: wait;
      opacity: 0.64;
    }
    .status {
      margin: 16px 0;
      min-height: 24px;
      color: var(--muted);
    }
    .status.error { color: var(--danger); }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(270px, 1fr));
      gap: 14px;
    }
    article {
      min-height: 238px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      padding: 16px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 14px;
    }
    .meta {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 10px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      border-radius: 999px;
      padding: 0 9px;
      background: #eef3f0;
      color: #25534c;
      font-size: 0.78rem;
      line-height: 1;
    }
    h2 {
      margin: 0;
      font-size: 1.02rem;
      line-height: 1.25;
      letter-spacing: 0;
    }
    .small {
      margin-top: 8px;
      font-size: 0.86rem;
    }
    audio {
      width: 100%;
      height: 42px;
    }
    .card-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    @media (max-width: 720px) {
      header {
        align-items: flex-start;
        flex-direction: column;
      }
      main { width: min(100vw - 24px, 1180px); }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>Voice Sampler</h1>
        <p>OpenAI and Gemini Flash TTS samples for weekly podcast voices.</p>
      </div>
      <div class="actions">
        <button class="primary" id="generate-all">Generate all</button>
        <button id="refresh">Refresh</button>
      </div>
    </header>
    <div class="status" id="status"></div>
    <section class="grid" id="samples"></section>
  </main>
  <script>
    const grid = document.querySelector("#samples");
    const statusEl = document.querySelector("#status");
    const generateAllButton = document.querySelector("#generate-all");
    const refreshButton = document.querySelector("#refresh");
    let busy = new Set();

    function setStatus(message, isError = false) {
      statusEl.textContent = message || "";
      statusEl.classList.toggle("error", isError);
    }

    async function loadSamples() {
      const response = await fetch("/api/samples");
      if (!response.ok) throw new Error("Could not load samples.");
      render(await response.json());
    }

    function render(samples) {
      grid.innerHTML = samples.map((sample) => {
        const audio = sample.audioUrl
          ? '<audio controls preload="metadata" src="' + sample.audioUrl + '?t=' + Date.now() + '"></audio>'
          : '<p class="small">Not generated yet.</p>';
        const disabled = busy.has(sample.id) ? "disabled" : "";
        const label = busy.has(sample.id) ? "Generating" : sample.generated ? "Regenerate" : "Generate";
        return '<article>' +
          '<div>' +
            '<div class="meta">' +
              '<span class="badge">' + escapeHtml(sample.provider) + '</span>' +
              '<span class="badge">' + escapeHtml(sample.mode) + '</span>' +
            '</div>' +
            '<h2>' + escapeHtml(sample.title) + '</h2>' +
            '<p class="small">' + escapeHtml(sample.subtitle) + '</p>' +
            '<p class="small">' + escapeHtml(sample.model) + ' / ' + escapeHtml(sample.voices.join(" + ")) + '</p>' +
          '</div>' +
          '<div>' +
            audio +
            '<div class="card-actions">' +
              '<button data-id="' + escapeHtml(sample.id) + '" ' + disabled + '>' + label + '</button>' +
            '</div>' +
          '</div>' +
        '</article>';
      }).join("");
    }

    async function generate(id) {
      busy.add(id);
      setStatus("Generating " + id + "...");
      await loadSamples();
      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Generation failed.");
        setStatus("Generated " + id + ".");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Generation failed.", true);
      } finally {
        busy.delete(id);
        await loadSamples();
      }
    }

    grid.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      const id = target.getAttribute("data-id");
      if (id) void generate(id);
    });

    generateAllButton.addEventListener("click", async () => {
      generateAllButton.disabled = true;
      setStatus("Generating all samples...");
      try {
        const response = await fetch("/api/generate-all", { method: "POST" });
        const body = await response.json();
        if (body.errors?.length) {
          setStatus("Generated with " + body.errors.length + " error(s). First: " + body.errors[0].error, true);
        } else {
          setStatus("Generated all samples.");
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Generation failed.", true);
      } finally {
        generateAllButton.disabled = false;
        await loadSamples();
      }
    });

    refreshButton.addEventListener("click", () => {
      void loadSamples();
    });

    function escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    void loadSamples().catch((error) => {
      setStatus(error instanceof Error ? error.message : "Could not load samples.", true);
    });
  </script>
</body>
</html>`;
}

void main();

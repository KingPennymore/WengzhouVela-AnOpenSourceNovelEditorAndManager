"use strict";
(() => {
  // src/protocol.ts
  var PROTOCOL_VERSION = 1;
  function bundleProvidingPackage(inventory, packageName) {
    const bundles = inventory.bundles;
    if (bundles === void 0 || packageName.length === 0) return void 0;
    const want = packageName.toLowerCase();
    for (const b of bundles) {
      if (b.aliasOf !== void 0 || b.provides === void 0) continue;
      for (const p of b.provides) {
        if (p.toLowerCase() === want) return b.name;
      }
    }
    return void 0;
  }
  function initializedMessage(jobId) {
    return { type: "initialized", v: PROTOCOL_VERSION, jobId };
  }
  function logMessage(jobId, stream, line) {
    return { type: "log", v: PROTOCOL_VERSION, jobId, stream, line };
  }
  function progressMessage(jobId, phase) {
    return { type: "progress", v: PROTOCOL_VERSION, jobId, phase };
  }
  function resultMessage(jobId, fields) {
    return {
      type: "result",
      v: PROTOCOL_VERSION,
      jobId,
      ok: fields.ok,
      exitCode: fields.exitCode,
      log: fields.log,
      stats: fields.stats,
      ...fields.pdf !== void 0 ? { pdf: fields.pdf } : {},
      ...fields.synctex !== void 0 ? { synctex: fields.synctex } : {}
    };
  }
  function fatalMessage(jobId, code, message, detail) {
    return {
      type: "fatal",
      v: PROTOCOL_VERSION,
      jobId,
      code,
      message,
      ...detail !== void 0 ? { detail } : {}
    };
  }
  function isPlainRecord(x) {
    return typeof x === "object" && x !== null && !Array.isArray(x);
  }
  function isJobIdString(x) {
    return typeof x === "string" && x.length > 0;
  }
  function isInt(x) {
    return typeof x === "number" && Number.isInteger(x);
  }
  function isStringArray(x) {
    return Array.isArray(x) && x.every((e) => typeof e === "string");
  }
  var ENGINE_NAMES = ["xetex", "pdftex", "luatex"];
  function isEngineName(x) {
    return typeof x === "string" && ENGINE_NAMES.includes(x);
  }
  function isAutoOff(x) {
    return x === "auto" || x === "off";
  }
  function isPassPolicy(x) {
    return x === "auto" || isInt(x) && x >= 1 && x <= 5;
  }
  function isProjectFile(x) {
    return typeof x === "string" || x instanceof Uint8Array;
  }
  function isNonEmptyString(x) {
    return typeof x === "string" && x.length > 0;
  }
  function isSafeProjectPath(x) {
    if (typeof x !== "string" || x.length === 0) return false;
    for (const segment of x.split("/")) {
      if (segment === "" || segment === "..") return false;
    }
    return true;
  }
  function parseProjectFiles(x) {
    if (!isPlainRecord(x)) return null;
    const out = {};
    for (const key of Object.keys(x)) {
      if (key === "__proto__") continue;
      if (!isSafeProjectPath(key)) return null;
      const value = x[key];
      if (!isProjectFile(value)) return null;
      out[key] = value;
    }
    return out;
  }
  function parseAssetEntry(x) {
    if (!isPlainRecord(x)) return null;
    if (!isNonEmptyString(x["path"])) return null;
    const bytes = x["bytes"];
    const sha256 = x["sha256"];
    const role = x["role"];
    const url = x["url"];
    return {
      path: x["path"],
      ...isInt(bytes) && bytes >= 0 ? { bytes } : {},
      ...typeof sha256 === "string" ? { sha256 } : {},
      ...typeof role === "string" ? { role } : {},
      // The client's locateAsset override (DESIGN.md §5.1). Carried ONLY when a
      // non-empty string — a blank/typed-wrong url is dropped so the worker falls
      // back to baseUrl+path rather than fetching `''`. Not a filesystem key.
      ...isNonEmptyString(url) ? { url } : {}
    };
  }
  function parseBundleManifestEntry(x) {
    if (!isPlainRecord(x)) return null;
    if (!isNonEmptyString(x["name"])) return null;
    const files = x["files"];
    const bytes = x["bytes"];
    const provides = x["provides"];
    const aliasOf = x["aliasOf"];
    return {
      name: x["name"],
      ...isStringArray(files) ? { files: [...files] } : {},
      ...isInt(bytes) && bytes >= 0 ? { bytes } : {},
      ...isStringArray(provides) ? { provides: [...provides] } : {},
      ...isNonEmptyString(aliasOf) ? { aliasOf } : {}
    };
  }
  function parseTexliveSnapshot(x) {
    if (!isPlainRecord(x)) return null;
    const release = x["release"];
    const tlpdbRevision = x["tlpdbRevision"];
    const sourceDateEpoch = x["sourceDateEpoch"];
    const freeze = x["freeze"];
    return {
      ...isNonEmptyString(release) ? { release } : {},
      ...isInt(tlpdbRevision) ? { tlpdbRevision } : {},
      ...isInt(sourceDateEpoch) ? { sourceDateEpoch } : {},
      ...isNonEmptyString(freeze) ? { freeze } : {}
    };
  }
  function parseAssetsInventory(x) {
    if (!isPlainRecord(x)) return null;
    const rawAssets = x["assets"];
    if (!Array.isArray(rawAssets)) return null;
    const assets = [];
    for (const raw of rawAssets) {
      const entry = parseAssetEntry(raw);
      if (entry === null) return null;
      assets.push(entry);
    }
    const schemaVersion = x["schemaVersion"];
    const generated = x["generated"];
    const engines = x["engines"];
    const rawBundles = x["bundles"];
    const rawSnapshot = x["texliveSnapshot"];
    let bundles;
    if (Array.isArray(rawBundles)) {
      bundles = [];
      for (const raw of rawBundles) {
        const entry = parseBundleManifestEntry(raw);
        if (entry !== null) bundles.push(entry);
      }
    }
    const snapshot = parseTexliveSnapshot(rawSnapshot);
    return {
      ...isInt(schemaVersion) ? { schemaVersion } : {},
      ...typeof generated === "string" ? { generated } : {},
      ...snapshot !== null ? { texliveSnapshot: snapshot } : {},
      ...isStringArray(engines) ? { engines: [...engines] } : {},
      ...bundles !== void 0 ? { bundles } : {},
      assets
    };
  }
  function parseBundleSelection(x) {
    if (!isPlainRecord(x)) return null;
    const preload = x["preload"];
    const onDemand = x["onDemand"];
    if (!isStringArray(preload) || !isStringArray(onDemand)) return null;
    return { preload: [...preload], onDemand: [...onDemand] };
  }
  function parseAssetsConfig(x) {
    if (!isPlainRecord(x)) return null;
    if (!isNonEmptyString(x["baseUrl"])) return null;
    const inventory = parseAssetsInventory(x["inventory"]);
    if (inventory === null) return null;
    const bundles = parseBundleSelection(x["bundles"]);
    if (bundles === null) return null;
    return { baseUrl: x["baseUrl"], inventory, bundles };
  }
  function parseInit(fields, jobId) {
    const assets = parseAssetsConfig(fields["assets"]);
    if (assets === null) return null;
    return { type: "init", v: PROTOCOL_VERSION, jobId, assets };
  }
  function parseCompile(fields, jobId) {
    const files = parseProjectFiles(fields["files"]);
    if (files === null) return null;
    const entry = fields["entry"];
    const engine = fields["engine"];
    const passes = fields["passes"];
    const bibliography = fields["bibliography"];
    const index = fields["index"];
    const synctex = fields["synctex"];
    if (!isSafeProjectPath(entry)) return null;
    if (!isEngineName(engine)) return null;
    if (!isPassPolicy(passes)) return null;
    if (!isAutoOff(bibliography)) return null;
    if (!isAutoOff(index)) return null;
    if (typeof synctex !== "boolean") return null;
    return {
      type: "compile",
      v: PROTOCOL_VERSION,
      jobId,
      files,
      entry,
      engine,
      passes,
      bibliography,
      index,
      synctex
    };
  }
  var CLIENT_PARSERS = {
    init: parseInit,
    compile: parseCompile
  };
  function parseClientMessage(data) {
    try {
      if (!isPlainRecord(data)) return null;
      if (data["v"] !== PROTOCOL_VERSION) return null;
      const jobId = data["jobId"];
      if (!isJobIdString(jobId)) return null;
      const type = data["type"];
      if (typeof type !== "string") return null;
      const parser = Object.hasOwn(CLIENT_PARSERS, type) ? CLIENT_PARSERS[type] : void 0;
      return parser ? parser(data, jobId) : null;
    } catch {
      return null;
    }
  }
  function transferablesOf(msg) {
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    switch (msg.type) {
      case "compile":
        for (const file of Object.values(msg.files)) {
          if (file instanceof Uint8Array) collectBuffer(out, seen, file);
        }
        break;
      case "result":
        if (msg.pdf) collectBuffer(out, seen, msg.pdf);
        if (msg.synctex) collectBuffer(out, seen, msg.synctex);
        break;
      default:
        break;
    }
    return out;
  }
  function collectBuffer(out, seen, view) {
    const buffer = view.buffer;
    if (buffer instanceof ArrayBuffer && !seen.has(buffer)) {
      seen.add(buffer);
      out.push(buffer);
    }
  }

  // worker/sequencing.ts
  var NO_FS_FACTS = {
    auxRequestsBib: false,
    idxNonEmpty: false,
    auxChanged: false,
    tocChanged: false
  };
  var HARD_PASS_CAP = 5;
  var BIBTEX_ABORT_EXIT = 2;
  var RERUN_MARKERS = [
    "Rerun to get",
    "Label(s) may have changed",
    "There were undefined references"
  ];
  function normalizeWhitespace(text) {
    return text.replace(/\s+/g, " ");
  }
  function needsRerunFromTranscript(transcript) {
    const normalized = normalizeWhitespace(transcript);
    return RERUN_MARKERS.some((marker) => normalized.includes(marker));
  }
  function normalize(options) {
    const autoPasses = options.passes === "auto";
    return {
      engine: options.engine,
      bib: options.bibliography === "auto",
      index: options.index === "auto",
      autoPasses,
      maxPasses: autoPasses ? HARD_PASS_CAP : options.passes
    };
  }
  function issue(state, step) {
    return { state: { ...state, last: step }, step };
  }
  function done(state) {
    return issue(state, { kind: "done" });
  }
  function abort(state, reason) {
    return issue(state, { kind: "abort", reason });
  }
  function finalize(state) {
    return state.options.engine === "xetex" ? issue(state, { kind: "xdvipdfmx" }) : done(state);
  }
  function engineOrFinalize(state, rerunWanted) {
    const underCap = state.enginePasses < state.options.maxPasses;
    const rerun = state.options.autoPasses ? rerunWanted && underCap : underCap;
    if (!rerun) return finalize(state);
    const pass = state.enginePasses + 1;
    return issue({ ...state, enginePasses: pass }, { kind: "engine", pass });
  }
  function decideNext(state, rerunWanted) {
    if (!state.bibResolved) {
      const resolved = { ...state, bibResolved: true };
      if (resolved.options.bib && resolved.auxRequestsBib) {
        return issue(resolved, { kind: "bibtex8" });
      }
      return decideNext(resolved, rerunWanted);
    }
    if (!state.indexResolved) {
      const resolved = { ...state, indexResolved: true };
      if (resolved.options.index && resolved.idxNonEmpty) {
        return issue(resolved, { kind: "makeindex" });
      }
      return decideNext(resolved, rerunWanted);
    }
    return engineOrFinalize(state, rerunWanted);
  }
  function beginSequence(options) {
    const first = { kind: "engine", pass: 1 };
    const state = {
      enginePasses: 1,
      options: normalize(options),
      last: first,
      bibResolved: false,
      indexResolved: false,
      auxRequestsBib: false,
      idxNonEmpty: false
    };
    return { state, step: first };
  }
  function advanceSequence(state, observation) {
    const last = state.last;
    switch (last.kind) {
      case "engine": {
        if (observation.exitCode !== 0) {
          return abort(state, `engine pass ${last.pass} exited ${observation.exitCode}`);
        }
        const updated = {
          ...state,
          auxRequestsBib: observation.fs.auxRequestsBib,
          idxNonEmpty: observation.fs.idxNonEmpty
        };
        const rerunWanted = needsRerunFromTranscript(observation.transcript) || observation.fs.auxChanged || observation.fs.tocChanged;
        return decideNext(updated, rerunWanted);
      }
      case "bibtex8": {
        if (observation.exitCode >= BIBTEX_ABORT_EXIT) {
          return abort(state, `bibtex8 exited ${observation.exitCode} (error; see transcript)`);
        }
        return decideNext({ ...state, bibResolved: true }, true);
      }
      case "makeindex": {
        if (observation.exitCode !== 0) {
          return abort(state, `makeindex exited ${observation.exitCode}`);
        }
        return decideNext({ ...state, indexResolved: true }, true);
      }
      case "xdvipdfmx": {
        if (observation.exitCode !== 0) {
          return abort(state, `xdvipdfmx exited ${observation.exitCode}`);
        }
        return done(state);
      }
      default:
        return { state, step: last };
    }
  }

  // src/diagnostics.ts
  var MAX_MISSING_FILES = 64;
  var MISSING_FILE = /File `([^'\n]+)' not found|I can't find file `([^'\n]+)'/g;
  function extractMissingFiles(log) {
    const out = [];
    if (typeof log !== "string" || log.length === 0) return out;
    const seen = /* @__PURE__ */ new Set();
    MISSING_FILE.lastIndex = 0;
    let match;
    while ((match = MISSING_FILE.exec(log)) !== null) {
      const name = (match[1] ?? match[2] ?? "").trim();
      if (name.length === 0 || seen.has(name)) continue;
      if (out.length >= MAX_MISSING_FILES) break;
      seen.add(name);
      out.push(name);
    }
    return out;
  }

  // worker/bundle-resolution.ts
  var SCAN_EXTENSIONS = /* @__PURE__ */ new Set(["tex", "ltx", "sty", "cls", "def", "clo"]);
  var MAX_SCANNED_NAMES = 256;
  var decoder = new TextDecoder();
  function asText(value) {
    if (typeof value === "string") return value;
    if (value instanceof Uint8Array) return decoder.decode(value);
    return null;
  }
  function basenameLower(path) {
    return path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  }
  function extensionOf(path) {
    const base = basenameLower(path);
    const dot = base.lastIndexOf(".");
    return dot <= 0 ? "" : base.slice(dot + 1);
  }
  function stripTexComment(line) {
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === "%") return line.slice(0, i);
    }
    return line;
  }
  var PACKAGE_DECL = /\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\]\s*)?\{([^}]*)\}/g;
  function scanRequiredPackages(files, entry) {
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    const addFrom = (content) => {
      for (const rawLine of content.split(/\r\n|\r|\n/)) {
        if (out.length >= MAX_SCANNED_NAMES) return;
        if (!rawLine.includes("\\")) continue;
        const line = stripTexComment(rawLine);
        PACKAGE_DECL.lastIndex = 0;
        let m;
        while ((m = PACKAGE_DECL.exec(line)) !== null) {
          for (const raw of (m[1] ?? "").split(",")) {
            const name = raw.trim();
            if (name.length === 0 || seen.has(name)) continue;
            if (out.length >= MAX_SCANNED_NAMES) return;
            seen.add(name);
            out.push(name);
          }
        }
      }
    };
    const entryText = asText(files[entry]);
    if (entryText !== null) addFrom(entryText);
    for (const [path, content] of Object.entries(files)) {
      if (path === entry) continue;
      if (!SCAN_EXTENSIONS.has(extensionOf(path))) continue;
      const text = asText(content);
      if (text !== null) addFrom(text);
    }
    return out;
  }
  function projectLocalStyleBasenames(files) {
    const set = /* @__PURE__ */ new Set();
    for (const path of Object.keys(files)) {
      const base = basenameLower(path);
      if (base.endsWith(".sty") || base.endsWith(".cls")) set.add(base);
    }
    return set;
  }
  function selectBundlesForPackages(names, inventory, files, onDemand, handled) {
    const onDemandSet = new Set(onDemand);
    const local = projectLocalStyleBasenames(files);
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (const name of names) {
      const lower = name.toLowerCase();
      if (local.has(`${lower}.sty`) || local.has(`${lower}.cls`)) continue;
      const bundle = bundleProvidingPackage(inventory, name);
      if (bundle === void 0) continue;
      if (!onDemandSet.has(bundle)) continue;
      if (handled.has(bundle) || seen.has(bundle)) continue;
      seen.add(bundle);
      out.push(bundle);
    }
    return out;
  }
  function selectBundlesForMissingFiles(missingFiles, onDemand, handled) {
    if (missingFiles.length === 0) return [];
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (const name of onDemand) {
      if (handled.has(name) || seen.has(name)) continue;
      seen.add(name);
      out.push(name);
    }
    return out;
  }

  // worker/core.ts
  var EngineAborted = class extends Error {
    constructor(message) {
      super(message);
      this.name = "EngineAborted";
    }
  };
  var SUPPORTED_ENGINES = /* @__PURE__ */ new Set(["xetex", "pdftex"]);
  var FORMAT_XELATEX = "/texlive/texmf-dist/texmf-var/web2c/xetex/xelatex.fmt";
  var FORMAT_PDFLATEX = "/texlive/texmf-dist/texmf-var/web2c/pdftex/pdflatex.fmt";
  function basename(path) {
    const slash = path.lastIndexOf("/");
    return slash < 0 ? path : path.slice(slash + 1);
  }
  function dirname(path) {
    const slash = path.lastIndexOf("/");
    return slash <= 0 ? "" : path.slice(0, slash);
  }
  function jobnameOf(entryBasename) {
    return entryBasename.endsWith(".tex") ? entryBasename.slice(0, -".tex".length) : entryBasename;
  }
  function sequencingOptionsOf(msg) {
    return {
      engine: msg.engine,
      // luatex rejected before this point
      passes: msg.passes,
      bibliography: msg.bibliography,
      index: msg.index
    };
  }
  function progressOf(step) {
    switch (step.kind) {
      case "engine":
        return { kind: "engine", pass: step.pass };
      case "bibtex8":
        return { kind: "bibtex8" };
      case "makeindex":
        return { kind: "makeindex" };
      case "xdvipdfmx":
        return { kind: "xdvipdfmx" };
    }
  }
  function engineCollect(ctx) {
    const base = [`${ctx.jobname}.aux`, `${ctx.jobname}.toc`, `${ctx.jobname}.idx`];
    return ctx.engine === "pdftex" ? [...base, `${ctx.jobname}.pdf`] : base;
  }
  function toRunStep(step, ctx, stage) {
    const withStage = (s) => stage ? { ...s, stage } : s;
    switch (step.kind) {
      case "engine":
        return ctx.engine === "pdftex" ? withStage({
          applet: "pdflatex",
          // pdfTeX writes the PDF directly — no xdvipdfmx step.
          argv: [
            "--no-shell-escape",
            "--interaction=nonstopmode",
            "--halt-on-error",
            "--output-format=pdf",
            "--fmt",
            FORMAT_PDFLATEX,
            ctx.entryBase
          ],
          collect: engineCollect(ctx)
        }) : withStage({
          applet: "xelatex",
          // nonstopmode (not batchmode): TeX then prints its full transcript —
          // crucially the "! …" error lines with l.N AND the "Rerun to get …"
          // markers the machine reads — to the terminal, which the host
          // captures and streams. batchmode would write them only to <job>.log.
          argv: [
            "--no-shell-escape",
            "--interaction=nonstopmode",
            "--halt-on-error",
            "--no-pdf",
            "--fmt",
            FORMAT_XELATEX,
            ctx.entryBase
          ],
          collect: engineCollect(ctx)
        });
      case "bibtex8":
        return { applet: "bibtex8", argv: ["--8bit", `${ctx.jobname}.aux`], collect: [] };
      case "makeindex":
        return { applet: "makeindex", argv: [`${ctx.jobname}.idx`], collect: [] };
      case "xdvipdfmx":
        return {
          applet: "xdvipdfmx",
          argv: ["-o", `${ctx.jobname}.pdf`, `${ctx.jobname}.xdv`],
          collect: [`${ctx.jobname}.pdf`]
        };
    }
  }
  function bytesEqual(a, b) {
    if (a === void 0 || b === void 0) return a === b;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
  function describeError(error) {
    if (error instanceof Error && typeof error.message === "string") return error.message;
    return String(error);
  }
  function createWorkerCore(deps) {
    const { host, post: post2 } = deps;
    const now = deps.now ?? Date.now;
    let loaded = false;
    let assetsConfig = null;
    const handledBundles = /* @__PURE__ */ new Set();
    const bundlesLoaded = [];
    async function ensureBundle(name, onLine) {
      if (bundlesLoaded.includes(name)) return true;
      if (handledBundles.has(name)) return false;
      handledBundles.add(name);
      try {
        await host.loadBundle(name);
        bundlesLoaded.push(name);
        return true;
      } catch (error) {
        onLine(
          "stderr",
          `wasmtex: on-demand bundle '${name}' could not be loaded (${describeError(error)}); continuing without it`
        );
        return false;
      }
    }
    async function onInit(msg) {
      if (loaded) {
        post2(initializedMessage(msg.jobId));
        return;
      }
      try {
        await host.load(msg.assets);
        handledBundles.clear();
        bundlesLoaded.length = 0;
        for (const name of msg.assets.bundles.preload) {
          if (handledBundles.has(name)) continue;
          handledBundles.add(name);
          bundlesLoaded.push(name);
        }
        assetsConfig = msg.assets;
        loaded = true;
        post2(initializedMessage(msg.jobId));
      } catch (error) {
        loaded = false;
        post2(fatalMessage(msg.jobId, "init-failed", describeError(error)));
      }
    }
    async function onCompile(msg) {
      const { jobId, engine } = msg;
      if (!SUPPORTED_ENGINES.has(engine)) {
        post2(
          fatalMessage(
            jobId,
            "unsupported-engine",
            `engine '${engine}' is not implemented in v1 (XeTeX-first; '${engine}' is a reserved enum value)`
          )
        );
        return;
      }
      if (!loaded || assetsConfig === null) {
        post2(fatalMessage(jobId, "internal", "compile received before the engine was initialised"));
        return;
      }
      const config = assetsConfig;
      const startedAt = now();
      const transcript = [];
      const onLine = (stream, line) => {
        transcript.push(line);
        post2(logMessage(jobId, stream, line));
      };
      if (msg.synctex) {
        onLine(
          "stderr",
          "wasmtex: synctex output was requested but is not yet implemented in this build; continuing without it"
        );
      }
      const entryBase = basename(msg.entry);
      const ctx = {
        engine: msg.engine,
        // luatex rejected above
        entryBase,
        jobname: jobnameOf(entryBase),
        cwd: dirname(msg.entry) || "."
      };
      const stageInfo = { files: msg.files, cwd: ctx.cwd };
      const decoder2 = new TextDecoder();
      const collected = /* @__PURE__ */ new Map();
      let lastExit = 0;
      let prevAux;
      let prevToc;
      let hasPrevEngine = false;
      let staged = false;
      if (config.bundles.onDemand.length > 0) {
        const names = scanRequiredPackages(msg.files, msg.entry);
        const preselect = selectBundlesForPackages(
          names,
          config.inventory,
          msg.files,
          config.bundles.onDemand,
          handledBundles
        );
        for (const name of preselect) await ensureBundle(name, onLine);
      }
      const MAX_STEPS = 5 + 3 + 2;
      let steps = 0;
      let { state, step } = beginSequence(sequencingOptionsOf(msg));
      try {
        while (step.kind !== "done" && step.kind !== "abort") {
          if (++steps > MAX_STEPS) {
            post2(fatalMessage(jobId, "internal", "sequencing exceeded the step bound (machine invariant regression)"));
            return;
          }
          post2(progressMessage(jobId, progressOf(step)));
          const stage = staged ? void 0 : stageInfo;
          staged = true;
          const runStep = toRunStep(step, ctx, stage);
          const logMark = transcript.length;
          let result = host.run(runStep, onLine);
          if (result.exitCode !== 0 && config.bundles.onDemand.length > 0) {
            const missing = extractMissingFiles(`${result.stdout}
${result.stderr}`);
            const toLoad = selectBundlesForMissingFiles(missing, config.bundles.onDemand, handledBundles);
            if (toLoad.length > 0) {
              const probeLines = transcript.length - logMark;
              let mounted = false;
              for (const name of toLoad) if (await ensureBundle(name, onLine)) mounted = true;
              if (mounted) {
                result = host.run(runStep, onLine);
                transcript.splice(logMark, probeLines);
              }
            }
          }
          lastExit = result.exitCode;
          for (const [path, bytes] of result.outputs) collected.set(path, bytes);
          let fs = NO_FS_FACTS;
          if (step.kind === "engine") {
            const curAux = result.outputs.get(`${ctx.jobname}.aux`);
            const curToc = result.outputs.get(`${ctx.jobname}.toc`);
            const curIdx = result.outputs.get(`${ctx.jobname}.idx`);
            const auxText = curAux ? decoder2.decode(curAux) : "";
            fs = {
              // v1 limitation (documented, journal item 6): only the ROOT aux is
              // scanned. In \include projects LaTeX writes \citation lines into
              // the chapter's own .aux (root has \@input{chapter.aux}), so the
              // bib gate misses them and citations render [?]. Fix would scan
              // \@input-referenced aux files; deferred (needs dynamic collect).
              auxRequestsBib: auxText.includes("\\citation") && auxText.includes("\\bibdata"),
              idxNonEmpty: curIdx !== void 0 && decoder2.decode(curIdx).trim().length > 0,
              auxChanged: hasPrevEngine && !bytesEqual(curAux, prevAux),
              tocChanged: hasPrevEngine && !bytesEqual(curToc, prevToc)
            };
            prevAux = curAux;
            prevToc = curToc;
            hasPrevEngine = true;
          }
          const observation = { exitCode: result.exitCode, transcript: `${result.stdout}
${result.stderr}`, fs };
          ({ state, step } = advanceSequence(state, observation));
        }
      } catch (error) {
        const code = error instanceof EngineAborted ? "engine-aborted" : "internal";
        post2(fatalMessage(jobId, code, describeError(error)));
        return;
      }
      const succeeded = step.kind === "done";
      const pdf = succeeded ? collected.get(`${ctx.jobname}.pdf`) : void 0;
      const ok = succeeded && pdf !== void 0;
      const fields = {
        ok,
        exitCode: succeeded ? 0 : lastExit,
        log: transcript.join("\n"),
        stats: {
          passes: state.enginePasses,
          elapsedMs: now() - startedAt,
          bundlesLoaded: [...bundlesLoaded]
        },
        ...pdf !== void 0 ? { pdf } : {}
      };
      post2(resultMessage(jobId, fields));
    }
    return {
      async handle(message) {
        switch (message.type) {
          case "init":
            await onInit(message);
            return;
          case "compile":
            await onCompile(message);
            return;
        }
      }
    };
  }

  // worker/engine-host.ts
  function mountViaRunDependencies(module, execute) {
    return new Promise((resolve, reject) => {
      const previous = module.monitorRunDependencies;
      let settled = false;
      const finish = (done2) => {
        if (settled) return;
        settled = true;
        module.monitorRunDependencies = previous;
        done2();
      };
      module.monitorRunDependencies = (remaining) => {
        if (typeof previous === "function") previous(remaining);
        if (remaining === 0) finish(resolve);
      };
      try {
        execute();
      } catch (error) {
        finish(() => reject(error instanceof Error ? error : new Error(String(error))));
      }
    });
  }
  var BIN_BUSYTEX = "/bin/busytex";
  var PROJECT_DIR = "/home/web_user/project_dir";
  var MEM_HEADER_SIZE = 2 ** 26;
  var ENGINE_ENV = {
    TEXMFDIST: "/texlive/texmf-dist:/texmf/texmf-dist",
    TEXMFVAR: "/texlive/texmf-dist/texmf-var",
    TEXMFCNF: "/texlive/texmf-dist/web2c",
    TEXMFLOG: "/tmp/texmf.log",
    FONTCONFIG_PATH: "/texlive"
  };
  function joinLocation(base, path) {
    return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
  }
  function basenameOf(path) {
    const slash = path.lastIndexOf("/");
    return slash < 0 ? path : path.slice(slash + 1);
  }
  function dirnameOf(path) {
    const slash = path.lastIndexOf("/");
    return slash <= 0 ? "" : path.slice(0, slash);
  }
  function joinPath(dir, name) {
    return `${dir.replace(/\/+$/, "")}/${name.replace(/^\/+/, "")}`;
  }
  function resolveAssetLocation(base, entry) {
    const url = entry.url;
    if (typeof url === "string" && url.length > 0) return url;
    return joinLocation(base, entry.path);
  }
  function entryLocationByRole(base, inventory, role) {
    const matches = inventory.assets.filter((a) => a.role === role);
    if (matches.length === 0) throw new Error(`assets.json has no entry with role '${role}'`);
    const entry = matches[0];
    if (entry === void 0 || typeof entry.path !== "string" || entry.path.length === 0) {
      throw new Error(`assets.json role '${role}' entry has no usable path`);
    }
    return resolveAssetLocation(base, entry);
  }
  function locateNameLocation(base, inventory, requestedName) {
    const match = inventory.assets.find(
      (a) => a.path === requestedName || basenameOf(a.path) === requestedName
    );
    return match ? resolveAssetLocation(base, match) : joinLocation(base, requestedName);
  }
  function resolveBundleJsLocation(base, inventory, name) {
    const match = inventory.assets.find((a) => {
      if (a.role !== "bundle-js") return false;
      const b = basenameOf(a.path);
      return b === name || b === `${name}.js` || b.replace(/\.js$/, "") === name;
    });
    if (!match) {
      throw new Error(`bundle '${name}' has no matching bundle-js asset in the inventory`);
    }
    return resolveAssetLocation(base, match);
  }
  function canonicalBundleName(inventory, name) {
    const bundles = inventory.bundles;
    if (bundles === void 0) return name;
    for (const b of bundles) {
      if (b.name === name) {
        return typeof b.aliasOf === "string" && b.aliasOf.length > 0 ? b.aliasOf : name;
      }
    }
    return name;
  }
  function preloadBundleLocations(base, assets) {
    return assets.bundles.preload.map((name) => resolveBundleJsLocation(base, assets.inventory, name));
  }
  function mkdirp(fs, dir) {
    if (dir === "" || dir === "/") return;
    let current = "";
    for (const part of dir.split("/")) {
      if (part === "") continue;
      current += `/${part}`;
      try {
        fs.mkdir(current);
      } catch {
      }
    }
  }
  function isExitStatus(error) {
    if (typeof error !== "object" || error === null) return false;
    const e = error;
    return e.name === "ExitStatus" || typeof e.status === "number";
  }
  var NOOP_SINK = () => {
  };
  var EmscriptenEngineHost = class {
    constructor(loader) {
      this.loader = loader;
    }
    loader;
    module = null;
    memHeader = null;
    /** Retained from {@link load} so {@link loadBundle} can resolve an on-demand tier NAME to its bundle-js location. */
    assets = null;
    /** CANONICAL bundle names already mounted (preload tiers seeded at load; on-demand tiers added by {@link loadBundle}) — makes loadBundle idempotent. */
    loadedBundles = /* @__PURE__ */ new Set();
    /** In-flight mounts, keyed by CANONICAL name, so concurrent {@link loadBundle} calls share one mount (no double LZ4.loadPackage → EEXIST). Cleared on settle. */
    inflightBundles = /* @__PURE__ */ new Map();
    // Per-run transcript wiring. `print`/`printErr` are installed once on the
    // Module and route here; `sink`/`capture` are swapped in around each callMain
    // so the SAME closures serve every run (and drop load-time engine chatter).
    sink = NOOP_SINK;
    capture = null;
    async load(assets) {
      const base = assets.baseUrl;
      const inventory = assets.inventory;
      const engineJsLocation = entryLocationByRole(base, inventory, "engine-js");
      const bundleJsLocations = preloadBundleLocations(base, assets);
      const factory = await this.loader.loadFactory(engineJsLocation);
      const module = {
        thisProgram: BIN_BUSYTEX,
        noInitialRun: true,
        locateFile: (name) => locateNameLocation(base, inventory, name),
        print: (text) => this.emit("stdout", text),
        printErr: (text) => this.emit("stderr", text),
        preRun: [
          () => {
            Object.assign(module.ENV, ENGINE_ENV);
            try {
              module.FS.mkdir(PROJECT_DIR);
            } catch {
            }
          }
        ]
      };
      for (const location of bundleJsLocations) {
        this.loader.installDataPackage(module, location);
      }
      const instance = await factory(module);
      const heap = instance.HEAPU8;
      if (heap.length < MEM_HEADER_SIZE || MEM_HEADER_SIZE % 4 !== 0) {
        throw new Error("engine linear memory smaller than the reset header, or misaligned");
      }
      const tail = instance.HEAP32.subarray(MEM_HEADER_SIZE / 4);
      let firstNonZero = -1;
      for (let i = 0; i < tail.length; i++) {
        if (tail[i] !== 0) {
          firstNonZero = i;
          break;
        }
      }
      if (firstNonZero !== -1) {
        throw new Error(
          `engine static memory extends past the ${MEM_HEADER_SIZE}-byte reset header (non-zero at word ${firstNonZero} beyond it): MEM_HEADER_SIZE in engine-host.ts must grow to cover the new static segment, or the post-callMain reset will zero live state`
        );
      }
      this.memHeader = heap.slice(0, MEM_HEADER_SIZE);
      this.module = instance;
      this.assets = assets;
      this.loadedBundles.clear();
      this.inflightBundles.clear();
      for (const name of assets.bundles.preload) {
        this.loadedBundles.add(canonicalBundleName(assets.inventory, name));
      }
    }
    /**
     * Mount an on-demand tier into the LIVE engine, AFTER {@link load} took the
     * memory snapshot (DESIGN.md §5.4). Idempotent: a name already mounted (a
     * preload tier, or one loaded earlier) is a no-op. Resolves once the tier's
     * files are FS-visible (kpathsea then finds them — core already ships the full
     * ls-R, so no filename-database refresh is needed).
     *
     * NO re-snapshot is taken. The file_packager mount is a JS-HEAP operation — the
     * MEMFS nodes, the LZ4 metadata, and the compressed `.data` all live in the JS
     * heap, orthogonal to the snapshotted linear memory — so the mounted tier
     * survives every post-`callMain` reset exactly as the preload tier does. Proven
     * by the item-5 spike (docs/plans/M4-journal.md): after a post-init mount the
     * low-64 MiB header is byte-identical to the snapshot AND the zero-past-header
     * invariant still holds, i.e. the mount touches no linear memory.
     */
    async loadBundle(name) {
      const module = this.requireModule();
      const assets = this.assets;
      if (assets === null) throw new Error("engine host used before load() resolved");
      const canonical = canonicalBundleName(assets.inventory, name);
      if (this.loadedBundles.has(canonical)) return;
      const pending = this.inflightBundles.get(canonical);
      if (pending !== void 0) return pending;
      const location = resolveBundleJsLocation(assets.baseUrl, assets.inventory, canonical);
      const mount = this.loader.mountDataPackage(module, location).then(() => {
        this.loadedBundles.add(canonical);
      }).finally(() => {
        this.inflightBundles.delete(canonical);
      });
      this.inflightBundles.set(canonical, mount);
      return mount;
    }
    run(step, onLine) {
      const module = this.requireModule();
      this.sink = onLine;
      if (step.stage) this.openJob(module, step.stage);
      const stdout = [];
      const stderr = [];
      this.capture = { stdout, stderr };
      let exitCode;
      try {
        const rc = module.callMain([step.applet, ...step.argv]);
        exitCode = typeof rc === "number" ? rc : 0;
      } catch (error) {
        if (isExitStatus(error)) {
          exitCode = typeof error.status === "number" ? error.status : 0;
        } else {
          throw new EngineAborted(`applet '${step.applet}' aborted: ${describeError(error)}`);
        }
      } finally {
        this.flushStreams(module);
        this.resetMemory(module);
        this.sink = NOOP_SINK;
        this.capture = null;
      }
      const outputs = this.collect(module, step);
      return { exitCode, stdout: stdout.join("\n"), stderr: stderr.join("\n"), outputs };
    }
    requireModule() {
      if (this.module === null) throw new Error("engine host used before load() resolved");
      return this.module;
    }
    /** Open a fresh job: remount a clean MEMFS at the job dir, stage files, chdir. */
    openJob(module, stage) {
      this.resetMemory(module);
      const fs = module.FS;
      const info = fs.analyzePath(PROJECT_DIR);
      if (info.exists && info.object?.mount?.mountpoint === PROJECT_DIR) {
        fs.unmount(PROJECT_DIR);
      } else if (!info.exists) {
        mkdirp(fs, PROJECT_DIR);
      }
      fs.mount(fs.filesystems.MEMFS, {}, PROJECT_DIR);
      for (const [path, contents] of Object.entries(stage.files)) {
        const absolute = joinPath(PROJECT_DIR, path);
        mkdirp(fs, dirnameOf(absolute));
        fs.writeFile(absolute, contents);
      }
      const cwd = stage.cwd === "." || stage.cwd === "" ? PROJECT_DIR : joinPath(PROJECT_DIR, stage.cwd);
      fs.chdir(cwd);
    }
    /** Read back the step's `collect` outputs (relative to the current cwd). */
    collect(module, step) {
      const outputs = /* @__PURE__ */ new Map();
      for (const rel of step.collect ?? []) {
        if (module.FS.analyzePath(rel).exists) {
          outputs.set(rel, module.FS.readFile(rel));
        }
      }
      return outputs;
    }
    /** Flush libc stdio to print/printErr so the run's final partial line surfaces. */
    flushStreams(module) {
      const flush = module._flush_streams;
      if (typeof flush !== "function") return;
      try {
        flush();
      } catch {
      }
    }
    /** Restore the clean low-memory header and zero the rest (the reset trick). */
    resetMemory(module) {
      if (this.memHeader === null) return;
      const heap = module.HEAPU8;
      heap.fill(0);
      heap.set(this.memHeader);
    }
    /** Route one Emscripten print/printErr call to the active sink + capture, per line. */
    emit(stream, text) {
      const value = String(text);
      const lines = value.includes("\n") ? value.split("\n") : [value];
      for (const line of lines) {
        this.sink(stream, line);
        if (this.capture) this.capture[stream].push(line);
      }
    }
  };
  function createWorkerModuleLoader() {
    const scope2 = globalThis;
    if (typeof scope2.importScripts !== "function") {
      throw new Error("createWorkerModuleLoader requires a classic Worker (importScripts unavailable)");
    }
    const importScripts = scope2.importScripts.bind(scope2);
    return {
      async loadFactory(engineJsLocation) {
        importScripts(engineJsLocation);
        const factory = scope2.busytex;
        if (typeof factory !== "function") {
          throw new Error(`engine JS at ${engineJsLocation} did not define the 'busytex' factory`);
        }
        return factory;
      },
      installDataPackage(module, dataPackageLocation) {
        scope2.BusytexPipeline = module;
        importScripts(dataPackageLocation);
      },
      mountDataPackage(module, dataPackageLocation) {
        return mountViaRunDependencies(module, () => {
          scope2.BusytexPipeline = module;
          importScripts(dataPackageLocation);
        });
      }
    };
  }

  // worker/entry.ts
  var scope = globalThis;
  function post(message) {
    scope.postMessage(message, transferablesOf(message));
  }
  function recoverJobId(data) {
    if (typeof data !== "object" || data === null) return null;
    const jobId = data.jobId;
    return typeof jobId === "string" && jobId.length > 0 ? jobId : null;
  }
  var core = createWorkerCore({
    host: new EmscriptenEngineHost(createWorkerModuleLoader()),
    post
  });
  var chain = Promise.resolve();
  scope.onmessage = (event) => {
    const message = parseClientMessage(event.data);
    if (message === null) {
      const jobId = recoverJobId(event.data);
      if (jobId !== null) {
        post(fatalMessage(jobId, "protocol", "unparseable or unsupported client message"));
      }
      return;
    }
    chain = chain.then(() => core.handle(message)).catch(() => {
    });
  };
})();
//# sourceMappingURL=worker.js.map

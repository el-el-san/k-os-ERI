const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { exec, spawn } = require('child_process');
const { createSession: createPtySession } = require('./ptyManager');

const PROJECT_ROOT = path.join(__dirname, '..');
const SAAS_DIR = path.join(PROJECT_ROOT, 'data', 'saas');

// .envファイルを読み込む（dotenvパッケージなしで実装）
function loadEnv() {
    const envPath = path.join(__dirname, '..', '.env');
    try {
        const envFile = fs.readFileSync(envPath, 'utf8');
        envFile.split('\n').forEach(rawLine => {
            const line = rawLine.trim();
            if (!line || line.startsWith('#')) return;
            const idx = line.indexOf('=');
            if (idx === -1) return;
            const key = line.slice(0, idx).trim();
            const value = line.slice(idx + 1).trim();
            if (key) process.env[key] = value;
        });
        console.log(`Loaded environment from: ${envPath}`);
    } catch (err) {
        console.log(`No .env file found at project root, using defaults`);
        // デフォルト値を設定
        process.env.PORT = process.env.PORT || '7777';
        process.env.SCAN_PATH = process.env.SCAN_PATH || path.join(__dirname, '..', 'static', 'images');
    }
}
loadEnv();

function safeSaasFilename(filename) {
    if (typeof filename !== 'string') return null;
    const trimmed = filename.trim();
    if (!/^[\w.-]+$/.test(trimmed)) return null;
    if (!trimmed.endsWith('.yaml') && !trimmed.endsWith('.yml')) return null;
    return trimmed;
}

function extractYamlTitle(source) {
    if (!source) return '';
    const lines = source.split(/\r?\n/).slice(0, 50);
    for (const line of lines) {
        const match = line.match(/^\s*title\s*:\s*(.+)$/i);
        if (match) {
            return match[1].replace(/^"|"$/g, '').trim();
        }
    }
    return '';
}

function summarizeYamlContent(source, limit = 240) {
    if (!source) return '';
    const compact = source.replace(/\r?\n+/g, '\n').trim();
    if (compact.length <= limit) return compact;
    return `${compact.slice(0, limit)}\n...`;
}

function createPromptPreview(text, limit = 12) {
    if (!text) return '';
    const lines = String(text).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const first = lines.length ? lines[0] : String(text).trim();
    if (!first) return '';
    if (first.length <= limit) return first;
    const safeLimit = Math.max(0, limit - 1);
    return `${first.slice(0, safeLimit)}…`;
}

const PRIORITY_LEVELS = new Set(['low', 'medium', 'high']);
function normalizePriorityLevel(value, fallback = null) {
    if (value == null) return fallback;
    const raw = String(value).trim();
    if (!raw) return fallback;
    const lower = raw.toLowerCase();
    if (PRIORITY_LEVELS.has(lower)) return lower;

    if (raw === '高' || raw === '重要' || raw === '緊急' || lower === 'urgent' || lower === 'high' || lower === 'critical' || lower === 'h' || lower === '3') {
        return 'high';
    }
    if (raw === '中' || raw === '普通' || lower === 'medium' || lower === 'mid' || lower === 'm' || lower === '2') {
        return 'medium';
    }
    if (raw === '低' || raw === '低い' || lower === 'low' || lower === 'l' || lower === '1') {
        return 'low';
    }
    return fallback;
}

function resolvePriorityLevel(value, fallback = 'medium') {
    const normalized = normalizePriorityLevel(value, fallback);
    return normalized == null ? fallback : normalized;
}

function listSaasYamlFiles() {
    try {
        const entries = fs.readdirSync(SAAS_DIR, { withFileTypes: true });
        const files = [];
        for (const entry of entries) {
            if (!entry.isFile()) continue;
            const safe = safeSaasFilename(entry.name);
            if (!safe) continue;
            const filePath = path.join(SAAS_DIR, safe);
            const stat = fs.statSync(filePath);
            let title = '';
            let sample = '';
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                title = extractYamlTitle(content);
                sample = summarizeYamlContent(content, 280);
            } catch (err) {
                console.warn('[SAAS] Failed to read yaml sample', safe, err.message);
            }
            const baseId = path.basename(safe, path.extname(safe));
            files.push({
                file: safe,
                id: baseId,
                title: title,
                size: stat.size,
                mtime: stat.mtimeMs,
                path: `/data/saas/${safe}`,
                summary: sample
            });
        }
        files.sort((a, b) => a.file.localeCompare(b.file));
        return files;
    } catch (err) {
        console.warn('[SAAS] Failed to list yaml files:', err.message);
        return [];
    }
}

function readSaasYamlFile(filename) {
    const safe = safeSaasFilename(filename);
    if (!safe) return null;
    const absolute = path.join(SAAS_DIR, safe);
    if (!absolute.startsWith(SAAS_DIR)) return null; // directory traversal guard
    if (!fs.existsSync(absolute)) return null;
    const content = fs.readFileSync(absolute, 'utf8');
    return {
        file: safe,
        path: `/data/saas/${safe}`,
        title: extractYamlTitle(content),
        content
    };
}

function logSanitizedEnv() {
    const key = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '';
    if (!key) {
        console.log('[ENV] Anthropic API key not detected');
    } else {
        const masked = key.length <= 10 ? `${key.slice(0, 2)}****` : `${key.slice(0, 6)}****${key.slice(-4)}`;
        console.log(`[ENV] Anthropic API key loaded (mask=${masked}, length=${key.length})`);
    }
    if (process.env.CLAUDE_SKIP_PERMISSIONS) {
        console.log(`[ENV] CLAUDE_SKIP_PERMISSIONS=${process.env.CLAUDE_SKIP_PERMISSIONS}`);
    }
    if (process.env.CLAUDE_DEBUG) {
        console.log(`[ENV] CLAUDE_DEBUG=${process.env.CLAUDE_DEBUG}`);
    }
    if (process.env.CLAUDE_MAX_TURNS) {
        console.log(`[ENV] CLAUDE_MAX_TURNS=${process.env.CLAUDE_MAX_TURNS}`);
    }
}
logSanitizedEnv();

// Claude Code CLI 設定
const DEFAULT_CLAUDE_MCP_CONFIG = process.env.CLAUDE_MCP_CONFIG_PATH;
console.log(`[ENV] CLAUDE_MCP_CONFIG_PATH=${DEFAULT_CLAUDE_MCP_CONFIG || '(not set)'}`);
if (DEFAULT_CLAUDE_MCP_CONFIG && fs.existsSync(DEFAULT_CLAUDE_MCP_CONFIG)) {
    console.log(`[ENV] MCP config file exists at ${DEFAULT_CLAUDE_MCP_CONFIG}`);
} else if (DEFAULT_CLAUDE_MCP_CONFIG) {
    console.error(`[ENV] WARNING: MCP config file NOT found at ${DEFAULT_CLAUDE_MCP_CONFIG}`);
}

// タスク管理（メモリ内）
const tasks = {};
let nextTaskId = 1;

// タスク永続化設定
const TASKS_STATE_FILE = path.join(__dirname, 'tasks-state.json');
const TASKS_STATE_VERSION = 2;
const TASKS_PERSIST_DEBOUNCE_MS = 1200;
let tasksPersistTimer = null;
let tasksPersistDirty = false;
let lastTasksPersistAt = null;

function serializeTaskForPersist(task) {
    if (!task || typeof task !== 'object') return null;
    const base = {
        id: task.id,
        status: task.status,
        prompt: task.prompt,
        command: task.command,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        endedAt: task.endedAt,
        exitCode: task.exitCode,
        urls: Array.isArray(task.urls) ? task.urls : [],
        files: Array.isArray(task.files) ? task.files : [],
        lastActivityAt: task.lastActivityAt,
        durationMs: task.durationMs,
        provider: task.provider || null,
        model: task.model || null,
        type: task.type || null,
        importance: resolvePriorityLevel(task.importance),
        urgency: resolvePriorityLevel(task.urgency),
        resultText: task.resultText || '',
        resultMeta: task.resultMeta || null,
        logs: Array.isArray(task.logs) ? task.logs.slice(-200) : [],
        stdout: typeof task.stdout === 'string' ? task.stdout : '',
        stderr: typeof task.stderr === 'string' ? task.stderr : '',
        stdoutBytes: task.stdoutBytes || 0,
        stderrBytes: task.stderrBytes || 0,
        manualDone: !!task.manualDone,
        completionSummary: typeof task.completionSummary === 'string' ? task.completionSummary : '',
        completionSummaryPending: !!task.completionSummaryPending,
        codexPollingDisabled: !!task.codexPollingDisabled,
        codexIdleChecks: Number.isFinite(task.codexIdleChecks) ? task.codexIdleChecks : 0,
        codexHasSeenWorking: !!task.codexHasSeenWorking,
        externalTerminal: task.externalTerminal && typeof task.externalTerminal === 'object' ? task.externalTerminal : null
    };
    return base;
}

function writeTasksSnapshot() {
    try {
        const snapshot = Object.values(tasks)
            .map(serializeTaskForPersist)
            .filter(Boolean);
        const savedAt = new Date().toISOString();
        const payload = {
            version: TASKS_STATE_VERSION,
            savedAt,
            nextTaskId,
            tasks: snapshot
        };
        fs.writeFileSync(TASKS_STATE_FILE, JSON.stringify(payload, null, 2), 'utf8');
        tasksPersistDirty = false;
        lastTasksPersistAt = savedAt;
    } catch (err) {
        console.error('[Tasks] Failed to persist snapshot:', err.message);
    }
}

function persistTasksImmediate(reason = 'immediate') {
    if (tasksPersistTimer) {
        clearTimeout(tasksPersistTimer);
        tasksPersistTimer = null;
    }
    tasksPersistDirty = true;
    writeTasksSnapshot();
}

function scheduleTasksPersist(reason = 'schedule') {
    tasksPersistDirty = true;
    if (tasksPersistTimer) return;
    tasksPersistTimer = setTimeout(() => {
        tasksPersistTimer = null;
        if (!tasksPersistDirty) return;
        writeTasksSnapshot();
    }, TASKS_PERSIST_DEBOUNCE_MS);
}

function rehydrateTaskFromPersisted(record) {
    if (!record || record.id == null) return null;
    const id = String(record.id);
    const createdAt = record.createdAt || new Date().toISOString();
    const updatedAt = record.updatedAt || createdAt;
    const restored = {
        id,
        status: typeof record.status === 'string' && record.status ? record.status : 'completed',
        prompt: record.prompt || '',
        command: record.command || '',
        pid: null,
        proc: null,
        createdAt,
        updatedAt,
        endedAt: record.endedAt || null,
        exitCode: record.exitCode != null ? record.exitCode : null,
        logs: Array.isArray(record.logs) ? record.logs.map(String) : [],
        urls: Array.isArray(record.urls) ? record.urls.map(String) : [],
        files: Array.isArray(record.files) ? record.files.map(String) : [],
        monitor: null,
        stdout: typeof record.stdout === 'string' ? record.stdout : '',
        stderr: typeof record.stderr === 'string' ? record.stderr : '',
        resultMeta: record.resultMeta && typeof record.resultMeta === 'object' ? record.resultMeta : null,
        lastActivityAt: record.lastActivityAt || updatedAt,
        durationMs: Number.isFinite(record.durationMs) ? record.durationMs : null,
        heartbeatIntervalId: null,
        resultText: record.resultText || '',
        stdoutBytes: Number.isFinite(record.stdoutBytes) ? record.stdoutBytes : Buffer.byteLength((record.stdout || ''), 'utf8'),
        stderrBytes: Number.isFinite(record.stderrBytes) ? record.stderrBytes : Buffer.byteLength((record.stderr || ''), 'utf8'),
        provider: record.provider || null,
        model: record.model || null,
        type: record.type || null,
        importance: normalizePriorityLevel(record.importance, 'medium'),
        urgency: normalizePriorityLevel(record.urgency, 'medium'),
        manualDone: !!record.manualDone,
        completionSummary: typeof record.completionSummary === 'string' ? record.completionSummary : '',
        completionSummaryPending: !!record.completionSummaryPending,
        codexPollingDisabled: !!record.codexPollingDisabled,
        codexIdleChecks: Number.isFinite(record.codexIdleChecks) ? record.codexIdleChecks : 0,
        codexHasSeenWorking: !!record.codexHasSeenWorking,
        externalTerminal: record.externalTerminal && typeof record.externalTerminal === 'object' ? record.externalTerminal : null
    };
    if (restored.status === 'running') {
        restored.status = 'failed';
        const message = 'サーバー再起動によりタスクが中断されました。';
        restored.resultText = restored.resultText ? `${restored.resultText}\n${message}` : message;
        restored.exitCode = restored.exitCode != null ? restored.exitCode : -1;
        restored.endedAt = restored.endedAt || new Date().toISOString();
        restored.updatedAt = restored.endedAt;
    }
    return restored;
}

function loadPersistedTasks() {
    if (!fs.existsSync(TASKS_STATE_FILE)) return;
    try {
        const raw = fs.readFileSync(TASKS_STATE_FILE, 'utf8');
        if (!raw.trim()) return;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return;
        const list = Array.isArray(parsed.tasks) ? parsed.tasks : [];
        let restoredCount = 0;
        list.forEach((record) => {
            const restored = rehydrateTaskFromPersisted(record);
            if (!restored) return;
            tasks[restored.id] = restored;
            restoredCount += 1;
        });
        if (restoredCount) {
            console.log(`[Tasks] Restored ${restoredCount} task(s) from local snapshot`);
        }
        if (parsed && parsed.nextTaskId && Number.isFinite(Number(parsed.nextTaskId))) {
            nextTaskId = Math.max(nextTaskId, Number(parsed.nextTaskId));
        } else {
            const numericIds = Object.keys(tasks)
                .map((key) => Number(key))
                .filter((value) => Number.isFinite(value));
            if (numericIds.length) {
                nextTaskId = Math.max(nextTaskId, Math.max(...numericIds) + 1);
            }
        }
        if (parsed && parsed.savedAt) {
            lastTasksPersistAt = parsed.savedAt;
        }
    } catch (err) {
        console.error('[Tasks] Failed to load persisted snapshot:', err.message);
    }
}

loadPersistedTasks();

// サーバーログ（リングバッファ + 任意でファイルにも保存）
const serverLogs = [];
const SERVER_LOG_LIMIT = 1000;
const SERVER_STARTED_AT = new Date().toISOString();
const LOG_FILE_PATH = path.join(__dirname, 'backend.log');
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const PTY_ALLOWED_COMMANDS = new Set(['claude', 'codex']);
const ptyWebsocketContexts = new Set();
const MAX_WS_MESSAGE_BYTES = 2 * 1024 * 1024; // 2MB safety cap for incoming frames
const terminalSessions = new Map();
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const hasMeaningfulText = (text) => typeof text === 'string' && /[A-Za-z0-9\u3040-\u30FF\u3400-\u9FFF]/.test(text);
const SUMMARY_MIN_CAPTURE_MS = 20000;
const SUMMARY_MAX_CAPTURE_MS = 60000;

function cleanTerminalSummary(raw, promptText) {
    if (!raw) return '';
    let text = raw.replace(/\u001B\[[0-9;?]*[A-Za-z]/g, '').replace(/\r/g, '');
    const normalizedPrompt = promptText ? promptText.trim().replace(/\r/g, '') : '';
    if (normalizedPrompt) {
        const idx = text.indexOf(normalizedPrompt);
        if (idx !== -1) {
            text = text.slice(idx + normalizedPrompt.length);
        }
    }
    const promptLines = normalizedPrompt
        ? normalizedPrompt.split('\n').map(line => line.trim()).filter(Boolean)
        : [];
    const promptLineSet = new Set(promptLines);
    const lines = text.split('\n');
    const filtered = [];
    for (let line of lines) {
        const trimEnd = line.replace(/\s+$/g, '');
        const trimmed = trimEnd.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith('▌')) break;
        if (/<<<KAMUI_SUMMARY_\d+>>>/.test(trimmed)) continue;
        const lineWithoutPromptMarker = trimmed.replace(/^>+\s?/, '').trim();
        if (promptLineSet.has(trimmed) || promptLineSet.has(lineWithoutPromptMarker)) continue;
        if (/^'+$/.test(trimmed)) continue;
        if (/^(send|⌫|↵|⇧|token|Esc\b|Prompt:|stdout:|stderr:|Stdout:|Stderr:|>>?>|~)/i.test(trimmed)) continue;
        if (/transcript|newline|token usage|Ctrl\+|^\^/i.test(trimmed) && trimmed.length <= 60) continue;
        // 追加のノイズフィルタ
        if (/^(Type|Press|Click|Enter|Return|Tab|Space|Delete|Backspace|Arrow)/i.test(trimmed)) continue;
        if (/^(printf|echo|cat|ls|cd|pwd|exit|clear)/i.test(trimmed) && trimmed.length <= 30) continue;
        if (/^\[\d+m|\x1b\[/i.test(trimmed)) continue; // ANSIエスケープシーケンス
        if (/^(OK|Done|Complete|Finished|Success|Failed|Error:|Warning:)/i.test(trimmed) && trimmed.length <= 20) continue;
        filtered.push(trimEnd);
    }
    // 複数行を1文にまとめる
    let result = filtered.join(' ').replace(/\s+/g, ' ').trim();
    // \n文字列として表示されているものを削除
    result = result.replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
    if (!hasMeaningfulText(result)) {
        const fallback = lines
            .map(line => line.replace(/^\s*>+\s?/, '').trim())
            .filter(line => line)
            .filter(line => !promptLineSet.has(line))
            .filter(line => !/<<<KAMUI_SUMMARY_\d+>>>/.test(line))
            .filter(line => !/^'+$/.test(line))
            .filter(line => !(/^(send|⌫|↵|⇧|token|Esc\b|Prompt:|stdout:|stderr:|Stdout:|Stderr:|>>?>|~)/i.test(line)))
            .filter(line => !( /transcript|newline|token usage|Ctrl\+|^\^/i.test(line) && line.length <= 60));
        // fallbackも1文にまとめる
        const fallbackText = fallback.join(' ').replace(/\s+/g, ' ').trim();
        // \n文字列として表示されているものを削除
        const cleanedFallback = fallbackText.replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
        result = hasMeaningfulText(cleanedFallback) ? cleanedFallback : '';
    }
    return result;
}

function summarizePromptForTab(prompt, maxLength = 48) {
    if (!prompt || typeof prompt !== 'string') return '';
    const normalized = prompt.replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength - 3)}...`;
}

const CODEX_JAPANESE_INSTRUCTION = '日本語で対応すること。画像生成、動画生成、音声生成などクリエイティブ系タスクはcurlなどでダウンロードを必ずするように。';
function writeLogLine(line) {
    try { fs.appendFileSync(LOG_FILE_PATH, line + '\n'); } catch (_) {}
}
function pushServerLog(level, message) {
    const ts = new Date().toISOString();
    const line = `[${ts}] [${level}] ${message}`;
    serverLogs.push(line);
    if (serverLogs.length > SERVER_LOG_LIMIT) serverLogs.splice(0, serverLogs.length - SERVER_LOG_LIMIT);
    writeLogLine(line);
}
const originalLog = console.log;
const originalError = console.error;
console.log = (...args) => { originalLog(...args); pushServerLog('INFO', args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')); };
console.error = (...args) => { originalError(...args); pushServerLog('ERROR', args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')); };

function createTaskId() {
    const id = String(nextTaskId++);
    return id;
}

function appendAndParseOutput(task, chunk) {
    const text = chunk.toString();
    task.logs.push(text);
    const nowIso = new Date().toISOString();
    task.updatedAt = nowIso;
    task.lastActivityAt = nowIso;
    // URL抽出
    const urlRegex = /(https?:\/\/[^\s"'<>\)]+)/g;
    let m;
    while ((m = urlRegex.exec(text)) !== null) {
        const url = m[1];
        if (!task.urls.includes(url)) task.urls.push(url);
    }
    // 絶対パスらしきものを抽出（mac/Linux）
    const pathRegex = /(?:\/[A-Za-z0-9._\-]+)+\.[A-Za-z0-9._\-]+/g;
    let p;
    while ((p = pathRegex.exec(text)) !== null) {
        const filePath = p[0];
        if (!task.files.includes(filePath)) task.files.push(filePath);
    }
    scheduleTasksPersist('output');
}

function startClaudeTask({ prompt, mcpConfigPath, cwd, extraArgs, importance, urgency }) {
    const id = createTaskId();
    const resolvedMcp = mcpConfigPath || DEFAULT_CLAUDE_MCP_CONFIG;
    const priorityImportance = resolvePriorityLevel(importance);
    const priorityUrgency = resolvePriorityLevel(urgency);
    
    if (!resolvedMcp) {
        console.error('[ERROR] CLAUDE_MCP_CONFIG_PATH environment variable is not set');
        throw new Error('MCP configuration path is required. Set CLAUDE_MCP_CONFIG_PATH environment variable.');
    }
    
    // CLIコマンドの構築
    const args = [];

    // --verboseオプションを常に追加（詳細なログ出力のため）
    args.push('--verbose');

    if (process.env.CLAUDE_SKIP_PERMISSIONS === '1' || process.env.CLAUDE_SKIP_PERMISSIONS === 'true') {
        args.push('--dangerously-skip-permissions');
    }

    if (process.env.CLAUDE_DEBUG) {
        args.push('--debug');
        if (process.env.CLAUDE_DEBUG !== '1' && process.env.CLAUDE_DEBUG !== 'true') {
            args.push(process.env.CLAUDE_DEBUG);
        }
    }

    const extraArgKeys = extraArgs && typeof extraArgs === 'object' ? Object.keys(extraArgs) : [];
    const hasOutputFormat = extraArgKeys.some(k => k === 'output-format' || k === 'outputFormat');
    const defaultOutputFormat = process.env.CLAUDE_OUTPUT_FORMAT || 'stream-json';
    if (!hasOutputFormat && defaultOutputFormat) {
        args.push('--output-format', defaultOutputFormat);
    }

    args.push('--mcp-config', resolvedMcp);

    const hasMaxTurns = extraArgKeys.some(k => k === 'max-turns' || k === 'maxTurns');
    if (!hasMaxTurns && process.env.CLAUDE_MAX_TURNS) {
        args.push('--max-turns', String(process.env.CLAUDE_MAX_TURNS));
    }
    
    if (extraArgs && typeof extraArgs === 'object') {
        Object.entries(extraArgs).forEach(([k, v]) => {
            args.push(`--${k}`);
            if (v !== null && v !== undefined && v !== '') {
                args.push(String(v));
            }
        });
    }
    
    // ヘッドレスモード (-p) でプロンプトを引数として追加
    args.push('-p', prompt);
    
    const cmd = `claude ${args.join(' ')}`;
    console.log(`[TASK ${id}] Starting: ${cmd}`);
    console.log(`[TASK ${id}] Prompt: ${prompt}`);
    
    // 直接 claude コマンドを実行（bash経由を避ける）
    const child = spawn('claude', args, {
        env: { ...process.env, PATH: `${process.env.PATH || ''}:/opt/homebrew/bin:/usr/local/bin:/usr/bin` },
        cwd: cwd && typeof cwd === 'string' ? cwd : process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // ヘッドレスモードではstdinは使わない
    child.stdin.end();
    
    const nowIso = new Date().toISOString();
    const task = {
        id,
        status: 'running',
        prompt: String(prompt || ''),
        command: cmd,
        pid: child.pid,
        proc: child,
        createdAt: nowIso,
        updatedAt: nowIso,
        endedAt: null,
        exitCode: null,
        logs: [],
        urls: [],
        files: [],
        monitor: null,
        stdout: '',
        stderr: '',
        resultMeta: null,
        lastActivityAt: nowIso,
        durationMs: null,
        heartbeatIntervalId: null,
        resultText: null,
        stdoutBytes: 0,
        stderrBytes: 0,
        provider: 'claude',
        model: 'claude-headless',
        type: 'claude_cli',
        importance: priorityImportance,
        urgency: priorityUrgency
    };
    tasks[id] = task;
    scheduleTasksPersist('task_created');
    console.log(`[TASK ${id}] Child PID: ${child.pid}`);
    const mcpExists = resolvedMcp && fs.existsSync(resolvedMcp);
    console.log(`[TASK ${id}] MCP config path=${resolvedMcp} (exists=${mcpExists})`);
    
    if (!mcpExists) {
        console.error(`[TASK ${id}] ERROR: MCP config file not found at ${resolvedMcp}`);
        task.status = 'failed';
        task.exitCode = -1;
        task.endedAt = new Date().toISOString();
        task.updatedAt = task.endedAt;
        task.logs.push(`ERROR: MCP config file not found at ${resolvedMcp}`);
        return task;
    }

    const heartbeatMs = Number(process.env.CLAUDE_HEARTBEAT_MS || 10000);
    if (!Number.isNaN(heartbeatMs) && heartbeatMs > 0) {
        task.heartbeatIntervalId = setInterval(() => {
            const lastTs = task.lastActivityAt ? new Date(task.lastActivityAt).getTime() : Date.now();
            const sinceSec = Math.round((Date.now() - lastTs) / 1000);
            console.log(`[TASK ${id}] Heartbeat: status=${task.status}, lastActivity=${sinceSec}s ago, pid=${task.pid}, stdoutBytes=${task.stdoutBytes}, stderrBytes=${task.stderrBytes}`);
        }, heartbeatMs);
    }

    child.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        const preview = text.length > 200 ? `${text.slice(0, 200)}...` : text;
        console.log(`[TASK ${id}] STDOUT (${text.length} bytes): ${preview}`);
        task.stdout += text;
        task.stdoutBytes += Buffer.byteLength(chunk);
        appendAndParseOutput(task, chunk);
    });

    child.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        console.log(`[TASK ${id}] STDERR (${text.length} bytes): ${text}`); // 全文を表示
        task.stderr += text;
        task.stderrBytes += Buffer.byteLength(chunk);
        appendAndParseOutput(task, chunk);
    });

    child.on('close', (code) => {
        console.log(`[TASK ${id}] Process closed with code: ${code}`);
        task.status = code === 0 ? 'completed' : 'failed';
        task.exitCode = code;
        task.endedAt = new Date().toISOString();
        task.updatedAt = task.endedAt;
        if (task.heartbeatIntervalId) {
            clearInterval(task.heartbeatIntervalId);
            task.heartbeatIntervalId = null;
        }
        if (task.createdAt) {
            task.durationMs = new Date(task.endedAt).getTime() - new Date(task.createdAt).getTime();
        }
        const stdoutTrimmed = task.stdout.trim();
        if (stdoutTrimmed.startsWith('{')) {
            try {
                const parsed = JSON.parse(stdoutTrimmed);
                task.resultMeta = parsed;
                const turns = parsed.num_turns ?? parsed.numTurns ?? null;
                if (turns !== null) {
                    console.log(`[TASK ${id}] Result: turns=${turns}`);
                }
                const resultText = typeof parsed.result === 'string'
                    ? parsed.result
                    : Array.isArray(parsed.messages)
                        ? parsed.messages.map((msg) => {
                            if (!msg || typeof msg !== 'object') return '';
                            if (Array.isArray(msg.content)) {
                                return msg.content.map((entry) => entry && typeof entry === 'object' && typeof entry.text === 'string' ? entry.text : '').join('\n');
                            }
                            if (typeof msg.content === 'string') return msg.content;
                            if (typeof msg.text === 'string') return msg.text;
                            return '';
                        }).join('\n').trim()
                        : null;
                if (resultText) {
                    task.resultText = resultText;
                    const preview = resultText.length > 400 ? `${resultText.slice(0, 400)}...` : resultText;
                    console.log(`[TASK ${id}] AI Result: ${preview}`);
                    task.logs.push(`\n[AI Result]\n${resultText}\n`);
                }
                if (parsed.duration_ms || parsed.durationMs) {
                    console.log(`[TASK ${id}] Result duration(ms): ${parsed.duration_ms || parsed.durationMs}`);
                }
                if (parsed.total_cost_usd !== undefined) {
                    console.log(`[TASK ${id}] Result cost(USD): ${parsed.total_cost_usd}`);
                }
            } catch (err) {
                console.log(`[TASK ${id}] Result JSON parse error: ${err.message}`);
            }
        }
        persistTasksImmediate('task_closed');
    });

    child.on('error', (err) => {
        console.log(`[TASK ${id}] Process error: ${err.message}`);
        appendAndParseOutput(task, String(err.message || err));
        task.status = 'failed';
        task.exitCode = -1;
        task.endedAt = new Date().toISOString();
        task.updatedAt = task.endedAt;
        if (task.heartbeatIntervalId) {
            clearInterval(task.heartbeatIntervalId);
            task.heartbeatIntervalId = null;
        }
        persistTasksImmediate('task_error');
    });
    
    return task;
}

function normalizeBooleanEnv(value) {
    if (value == null) return false;
    if (typeof value === 'boolean') return value;
    const lowered = String(value).trim().toLowerCase();
    return lowered === '1' || lowered === 'true' || lowered === 'yes' || lowered === 'on';
}

function createTerminalSessionId(prefix = 'codex-term') {
    const random = crypto.randomBytes(6).toString('hex');
    return `${prefix}-${Date.now()}-${random}`;
}

function escapeAppleScriptString(value) {
    if (value == null) return '';
    return String(value)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n');
}

function shellQuoteArgs(args) {
    if (!Array.isArray(args)) return '';
    return args.map((arg) => {
        const str = String(arg);
        if (!/[^A-Za-z0-9@%_+=:,./-]/.test(str)) {
            return str;
        }
        return `'${str.replace(/'/g, `'\\''`)}'`;
    }).join(' ');
}

function runAppleScript(script, { captureOutput = false } = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn('osascript', ['-e', script]);
        let stderr = '';
        let stdout = '';
        if (captureOutput && child.stdout) {
            child.stdout.on('data', (chunk) => {
                stdout += chunk.toString();
            });
        }
        if (child.stderr) {
            child.stderr.on('data', (chunk) => {
                stderr += chunk.toString();
            });
        }
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) {
                resolve(captureOutput ? stdout.trim() : undefined);
            } else {
                const error = new Error(stderr.trim() || `osascript_exit_${code}`);
                error.code = code;
                reject(error);
            }
        });
    });
}

async function focusItermSession(sessionId, appleSessionId = null) {
    const escapedId = escapeAppleScriptString(sessionId);
    const escapedAppleId = appleSessionId ? escapeAppleScriptString(String(appleSessionId)) : null;
    const script = `
        tell application "iTerm"
            activate
            set targetId to "${escapedId}"
            ${escapedAppleId ? `set targetAppleId to "${escapedAppleId}"` : 'set targetAppleId to missing value'}
            set foundSession to missing value
            set foundTab to missing value
            set foundWindow to missing value
            repeat with w in windows
                repeat with t in tabs of w
                    repeat with s in sessions of t
                        if ((targetAppleId is not missing value and (id of s as string) is equal to targetAppleId) or (name of s contains targetId)) then
                            set foundSession to s
                            set foundTab to t
                            set foundWindow to w
                            exit repeat
                        end if
                    end repeat
                    if foundSession is not missing value then exit repeat
                end repeat
                if foundSession is not missing value then exit repeat
            end repeat
            if foundSession is missing value then error "session_not_found"
            select foundWindow
            select foundTab
            select foundSession
            activate
        end tell
    `;
    await runAppleScript(script);
}

async function terminateItermSession(sessionId, appleSessionId = null) {
    const escapedId = escapeAppleScriptString(sessionId);
    const escapedAppleId = appleSessionId ? escapeAppleScriptString(String(appleSessionId)) : null;
    const script = `
        tell application "iTerm"
            set targetId to "${escapedId}"
            ${escapedAppleId ? `set targetAppleId to "${escapedAppleId}"` : 'set targetAppleId to missing value'}
            set closedSession to false
            repeat with w in windows
                repeat with t in tabs of w
                    repeat with s in sessions of t
                        if ((targetAppleId is not missing value and (id of s as string) is equal to targetAppleId) or (name of s contains targetId)) then
                            try
                                tell s to terminate
                            end try
                            delay 0.1
                            try
                                tell s to write text "exit"
                            end try
                            delay 0.1
                            try
                                close s
                            on error
                                try
                                    close t
                                end try
                            end try
                            set closedSession to true
                            exit repeat
                        end if
                    end repeat
                    if closedSession then exit repeat
                end repeat
                if closedSession then exit repeat
            end repeat
            if closedSession then
                return "terminated"
            else
                error "session_not_found"
            end if
        end tell
    `;
    await runAppleScript(script, { captureOutput: true });
}

async function sendTextToItermSession(sessionId, appleSessionId = null, text = '') {
    if (sessionId == null) return;
    const rawText = text == null ? '' : (typeof text === 'string' ? text : String(text));
    const escapedId = escapeAppleScriptString(sessionId);
    const escapedAppleId = appleSessionId ? escapeAppleScriptString(String(appleSessionId)) : null;
    const hasVisibleChars = /\S/.test(rawText);
    const escapedText = escapeAppleScriptString(rawText);
    const writeCommand = hasVisibleChars
        ? `tell foundSession to write text "${escapedText}"`
        : 'tell foundSession to write text ""';
    const script = `
        tell application "iTerm"
            set targetId to "${escapedId}"
            ${escapedAppleId ? `set targetAppleId to "${escapedAppleId}"` : 'set targetAppleId to missing value'}
            set foundSession to missing value
            repeat with w in windows
                repeat with t in tabs of w
                    repeat with s in sessions of t
                        if ((targetAppleId is not missing value and (id of s as string) is equal to targetAppleId) or (name of s contains targetId)) then
                            set foundSession to s
                            exit repeat
                        end if
                    end repeat
                    if foundSession is not missing value then exit repeat
                end repeat
                if foundSession is not missing value then exit repeat
            end repeat
            if foundSession is missing value then error "session_not_found"
            ${writeCommand}
        end tell
    `;
    await runAppleScript(script, { captureOutput: false });
}

async function getItermSessionContent(sessionId, appleSessionId = null) {
    const escapedId = escapeAppleScriptString(sessionId);
    const escapedAppleId = appleSessionId ? escapeAppleScriptString(String(appleSessionId)) : null;
    const script = `
        tell application "iTerm"
            set targetId to "${escapedId}"
            ${escapedAppleId ? `set targetAppleId to "${escapedAppleId}"` : 'set targetAppleId to missing value'}
            set foundSession to missing value
            repeat with w in windows
                repeat with t in tabs of w
                    repeat with s in sessions of t
                        if ((targetAppleId is not missing value and (id of s as string) is equal to targetAppleId) or (name of s contains targetId)) then
                            set foundSession to s
                            exit repeat
                        end if
                    end repeat
                    if foundSession is not missing value then exit repeat
                end repeat
                if foundSession is not missing value then exit repeat
            end repeat
            if foundSession is missing value then error "session_not_found"
            contents of foundSession
        end tell
    `;
    const output = await runAppleScript(script, { captureOutput: true });
    return typeof output === 'string' ? output : '';
}

function resolvePtyCommandConfig(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const rawCommand = payload.command || payload.id || payload.name;
    if (!rawCommand || typeof rawCommand !== 'string') return null;
    const commandId = rawCommand.trim().toLowerCase();
    if (!PTY_ALLOWED_COMMANDS.has(commandId)) {
        console.warn(`[PTY] Command not allowed: ${rawCommand}`);
        return null;
    }

    if (commandId === 'claude') {
        const args = [];
        args.push('--verbose');
        if (process.env.CLAUDE_SKIP_PERMISSIONS === '1' || process.env.CLAUDE_SKIP_PERMISSIONS === 'true') {
            args.push('--dangerously-skip-permissions');
        }
        if (process.env.CLAUDE_DEBUG) {
            args.push('--debug');
            if (process.env.CLAUDE_DEBUG !== '1' && process.env.CLAUDE_DEBUG !== 'true') {
                args.push(process.env.CLAUDE_DEBUG);
            }
        }

        const providedMcp = payload.mcpConfigPath && typeof payload.mcpConfigPath === 'string'
            ? payload.mcpConfigPath.trim()
            : null;
        const resolvedMcp = providedMcp || process.env.CLAUDE_MCP_CONFIG_PATH || null;
        if (resolvedMcp) {
            args.push('--mcp-config', resolvedMcp);
        } else {
            console.warn('[PTY] CLAUDE_MCP_CONFIG_PATH is not set; interactive session may lack MCP context');
        }

        const maxTurnsEnv = process.env.CLAUDE_MAX_TURNS;
        if (maxTurnsEnv && maxTurnsEnv.toString().trim()) {
            args.push('--max-turns', String(maxTurnsEnv).trim());
        }

        if (payload.subcommand && typeof payload.subcommand === 'string' && payload.subcommand.trim()) {
            args.unshift(payload.subcommand.trim());
        }

        if (Array.isArray(payload.args)) {
            payload.args.filter(arg => typeof arg === 'string' && arg.trim() !== '').forEach(arg => {
                args.push(arg);
            });
        }

        return {
            command: 'claude',
            args,
            meta: { mcpConfigPath: resolvedMcp }
        };
    }

    if (commandId === 'codex') {
        const args = [];
        const subcommand = payload.subcommand && typeof payload.subcommand === 'string'
            ? payload.subcommand.trim()
            : '';
        if (subcommand) {
            args.push(subcommand);
        }

        const configOverrides = Array.isArray(payload.configOverrides)
            ? payload.configOverrides
            : (typeof payload.configOverrides === 'string'
                ? payload.configOverrides.split(/[;,\n]+/).map(entry => entry.trim()).filter(Boolean)
                : []);
        configOverrides.forEach(entry => {
            args.push('-c', entry);
        });
        if (Array.isArray(payload.args)) {
            payload.args.filter(arg => typeof arg === 'string' && arg.trim() !== '').forEach(arg => {
                args.push(arg);
            });
        }
        return {
            command: 'codex',
            args,
            meta: {
                model: null,
                profile: null,
                sandbox: null
            }
        };
    }

    return null;
}

function startCodexTask({ prompt, model, profile, sandbox, cwd, configOverrides, extraArgs, skipGitCheck, importance, urgency }) {
    if (!prompt || !String(prompt).trim()) {
        throw new Error('Prompt is required for Codex task');
    }

    const id = createTaskId();
    const codexArgs = ['exec', '--json'];

    const resolvedModel = (model || process.env.CODEX_MODEL || process.env.CODEX_DEFAULT_MODEL || '').trim();
    if (resolvedModel) {
        codexArgs.push('--model', resolvedModel);
    }

    const resolvedProfile = profile || process.env.CODEX_PROFILE;
    if (resolvedProfile) {
        codexArgs.push('--profile', resolvedProfile);
    }

    const defaultSandbox = process.env.CODEX_SANDBOX || process.env.CODEX_DEFAULT_SANDBOX || 'danger-full-access';
    const resolvedSandbox = sandbox || defaultSandbox;
    if (resolvedSandbox) {
        codexArgs.push('--sandbox', resolvedSandbox);
    }

    const effectiveSkipGit = skipGitCheck !== undefined
        ? normalizeBooleanEnv(skipGitCheck)
        : normalizeBooleanEnv(process.env.CODEX_SKIP_GIT_CHECK);
    if (effectiveSkipGit) {
        codexArgs.push('--skip-git-repo-check');
    }

    const configList = Array.isArray(configOverrides)
        ? configOverrides
        : (typeof configOverrides === 'string' && configOverrides.trim()
            ? configOverrides.split(/[;,\n]+/).map(entry => entry.trim()).filter(Boolean)
            : []);
    if (!configList.length && typeof process.env.CODEX_CONFIG_OVERRIDES === 'string') {
        const envOverrides = process.env.CODEX_CONFIG_OVERRIDES.split(/[;,\n]+/).map(entry => entry.trim()).filter(Boolean);
        configList.push(...envOverrides);
    }
    for (const entry of configList) {
        codexArgs.push('-c', entry);
    }

    if (extraArgs) {
        if (Array.isArray(extraArgs)) {
            extraArgs.filter(arg => typeof arg === 'string' && arg.trim() !== '').forEach(arg => {
                codexArgs.push(arg);
            });
        } else if (typeof extraArgs === 'object') {
            // Convert key-value object into CLI flags
            Object.entries(extraArgs).forEach(([key, value]) => {
                if (!key) return;
                codexArgs.push(`--${key}`);
                if (value !== null && value !== undefined && value !== '') {
                    codexArgs.push(String(value));
                }
            });
        }
    }

    codexArgs.push(String(prompt));

    const quoteArg = (arg) => {
        if (arg === undefined || arg === null) return '';
        const str = String(arg);
        return /\s/.test(str) ? `'${str.replace(/'/g, "'\\''")}'` : str;
    };

    const displayCmd = `codex ${codexArgs.map(quoteArg).join(' ')}`;
    console.log(`[CODEX ${id}] Starting: ${displayCmd}`);

    const child = spawn('codex', codexArgs, {
        env: { ...process.env },
        cwd: cwd && typeof cwd === 'string' ? cwd : process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe']
    });

    const nowIso = new Date().toISOString();
    const priorityImportance = resolvePriorityLevel(importance);
    const priorityUrgency = resolvePriorityLevel(urgency);
    const task = {
        id,
        status: 'running',
        prompt: String(prompt),
        command: displayCmd,
        pid: child.pid,
        proc: child,
        createdAt: nowIso,
        updatedAt: nowIso,
        endedAt: null,
        exitCode: null,
        logs: [],
        urls: [],
        files: [],
        monitor: null,
        stdout: '',
        stderr: '',
        resultMeta: null,
        lastActivityAt: nowIso,
        durationMs: null,
        heartbeatIntervalId: null,
        resultText: null,
        stdoutBytes: 0,
        stderrBytes: 0,
        provider: 'codex',
        model: resolvedModel || null,
        type: 'codex_exec',
        importance: priorityImportance,
        urgency: priorityUrgency
    };

    tasks[id] = task;
    scheduleTasksPersist('codex_created');

    const codexContext = {
        buffer: '',
        events: [],
        assistantMessages: [],
        reasoning: [],
        lastTokenInfo: null,
        errors: []
    };

    let resolveCompletion;
    let rejectCompletion;
    task.completionPromise = new Promise((resolve, reject) => {
        resolveCompletion = resolve;
        rejectCompletion = reject;
    });

    const pushLog = (text) => {
        if (!text) return;
        appendAndParseOutput(task, `${text}\n`);
    };

    const processEvent = (event) => {
        codexContext.events.push(event);
        const msg = event && event.msg ? event.msg : null;
        if (!msg || typeof msg !== 'object') {
            return;
        }

        const extractText = (payload) => {
            if (!payload) return '';
            if (typeof payload === 'string') return payload;
            if (Array.isArray(payload)) {
                return payload.map(extractText).filter(Boolean).join('\n');
            }
            if (typeof payload === 'object') {
                if (typeof payload.text === 'string') return payload.text;
                if (Array.isArray(payload.content)) return extractText(payload.content);
                if (typeof payload.message === 'string') return payload.message;
            }
            return '';
        };

        switch (msg.type) {
            case 'agent_message': {
                const text = extractText(msg.message || msg.text || msg);
                if (text) {
                    codexContext.assistantMessages.push(text);
                    pushLog(`[CODEX CHAT] ${text}`);
                }
                break;
            }
            case 'agent_reasoning':
            case 'agent_thought':
            case 'agent_reasoning_section_break': {
                const text = extractText(msg.text || msg.message || msg);
                if (text) {
                    codexContext.reasoning.push(text);
                    pushLog(`[CODEX REASONING] ${text}`);
                }
                break;
            }
            case 'task_started': {
                pushLog('[CODEX] Task started');
                break;
            }
            case 'command_started': {
                const text = [`Command: ${msg.command || ''}`, msg.description ? `Description: ${msg.description}` : null].filter(Boolean).join(' | ');
                if (text) pushLog(`[CODEX COMMAND] ${text}`);
                break;
            }
            case 'command_output': {
                const text = extractText(msg.output || msg.text || msg);
                if (text) pushLog(`[CODEX OUTPUT] ${text}`);
                break;
            }
            case 'command_completed': {
                const text = extractText(msg.summary || msg.output || msg);
                if (text) pushLog(`[CODEX COMMAND DONE] ${text}`);
                break;
            }
            case 'token_count': {
                codexContext.lastTokenInfo = msg.info || msg;
                break;
            }
            case 'error': {
                const text = extractText(msg.message || msg);
                if (text) {
                    codexContext.errors.push(text);
                    pushLog(`[CODEX ERROR] ${text}`);
                }
                break;
            }
            case 'result': {
                const text = extractText(msg.output || msg.text || msg.result || msg);
                if (text) {
                    codexContext.assistantMessages.push(text);
                    pushLog(`[CODEX RESULT] ${text}`);
                }
                break;
            }
            default: {
                const text = extractText(msg.message || msg.text);
                if (text) {
                    pushLog(`[CODEX ${msg.type}] ${text}`);
                }
            }
        }
    };

    const processBuffer = () => {
        let newlineIndex;
        while ((newlineIndex = codexContext.buffer.indexOf('\n')) !== -1) {
            const line = codexContext.buffer.slice(0, newlineIndex).trim();
            codexContext.buffer = codexContext.buffer.slice(newlineIndex + 1);
            if (!line) continue;
            try {
                const event = JSON.parse(line);
                processEvent(event);
            } catch (err) {
                pushLog(line);
            }
        }
    };

    child.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        task.stdout += text;
        task.stdoutBytes += Buffer.byteLength(chunk);
        codexContext.buffer += text;
        processBuffer();
    });

    child.stdout.on('end', () => {
        if (codexContext.buffer.trim()) {
            const leftover = codexContext.buffer.trim();
            try {
                const event = JSON.parse(leftover);
                processEvent(event);
            } catch (err) {
                pushLog(leftover);
            }
        }
        codexContext.buffer = '';
    });

    child.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        task.stderr += text;
        task.stderrBytes += Buffer.byteLength(chunk);
        pushLog(`[CODEX STDERR] ${text.trim()}`);
    });

    child.on('close', (code) => {
        console.log(`[CODEX ${id}] Process closed with code: ${code}`);
        task.status = code === 0 ? 'completed' : 'failed';
        task.exitCode = code;
        task.endedAt = new Date().toISOString();
        task.updatedAt = task.endedAt;
        if (task.createdAt) {
            task.durationMs = new Date(task.endedAt).getTime() - new Date(task.createdAt).getTime();
        }

        const resultText = codexContext.assistantMessages.join('\n').trim();
        if (resultText) {
            task.resultText = resultText;
        }

        const meta = {
            provider: 'codex',
            model: resolvedModel || null,
            profile: resolvedProfile || null,
            sandbox: resolvedSandbox || null,
            token_usage: codexContext.lastTokenInfo || null,
            errors: codexContext.errors.length ? codexContext.errors : undefined,
            reasoning: codexContext.reasoning.length ? codexContext.reasoning : undefined,
            exit_code: code
        };
        task.resultMeta = meta;

        if (code === 0) {
            resolveCompletion({
                resultText,
                meta,
                logs: Array.isArray(task.logs) ? task.logs.slice(-500) : []
            });
        } else {
            const err = new Error(`Codex exited with code ${code}`);
            codexContext.errors.push(err.message);
            rejectCompletion(err);
        }
        persistTasksImmediate('codex_closed');
    });

    child.on('error', (err) => {
        console.log(`[CODEX ${id}] Process error: ${err.message}`);
        pushLog(`[CODEX ERROR] ${err.message}`);
        task.status = 'failed';
        task.exitCode = -1;
        task.endedAt = new Date().toISOString();
        task.updatedAt = task.endedAt;
        rejectCompletion(err);
        persistTasksImmediate('codex_error');
    });

    return task;
}

function startMonitor(task, { intervalSec = 10, callbackUrl } = {}) {
    if (!task || task.monitor) return task;
    const intervalMs = Math.max(1, Number(intervalSec)) * 1000;
    const monitor = {
        intervalMs,
        intervalSec: intervalMs / 1000,
        startedAt: new Date().toISOString(),
        nextCheckAt: new Date(Date.now() + intervalMs).toISOString(),
        checks: 0,
        callbackUrl: typeof callbackUrl === 'string' ? callbackUrl : null,
        intervalId: null
    };
    function postCallbackIfNeeded(final = false) {
        if (!monitor.callbackUrl) return;
        try {
            const payload = JSON.stringify({ final, task: publicTaskView(task, final) });
            const url = new URL(monitor.callbackUrl);
            const client = url.protocol === 'https:' ? require('https') : require('http');
            const req = client.request({
                method: 'POST',
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname + (url.search || ''),
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                }
            });
            req.on('error', () => {});
            req.write(payload);
            req.end();
        } catch (_) {}
    }
    monitor.intervalId = setInterval(() => {
        monitor.checks += 1;
        monitor.nextCheckAt = new Date(Date.now() + intervalMs).toISOString();
        // 子プロセスの状態はイベントで更新されるが、ここでは心拍のようなメタ情報のみ更新
        task.updatedAt = new Date().toISOString();
        if (task.status === 'completed' || task.status === 'failed') {
            clearInterval(monitor.intervalId);
            monitor.intervalId = null;
            postCallbackIfNeeded(true);
        } else {
            postCallbackIfNeeded(false);
        }
    }, intervalMs);
    task.monitor = monitor;
    return task;
}

function composeTaskCopyBundle(task) {
    if (!task) return null;
    const prompt = typeof task.prompt === 'string' ? task.prompt.trim() : '';
    const responseSource = typeof task.resultText === 'string' && task.resultText.trim()
        ? task.resultText
        : (typeof task.stdout === 'string' ? task.stdout.trim() : '');
    const response = responseSource.trim();
    const summary = typeof task.completionSummary === 'string' ? task.completionSummary.trim() : '';
    const metaLines = [];
    if (task.id != null) metaLines.push(`タスクID: ${task.id}`);
    if (task.status) metaLines.push(`ステータス: ${task.status}`);
    if (task.model || task.provider) {
        const providerLabel = task.provider ? ` / ${task.provider}` : '';
        metaLines.push(`モデル: ${(task.model || '(不明)')}${providerLabel}`);
    }
    if (task.createdAt) metaLines.push(`開始: ${task.createdAt}`);
    if (task.updatedAt) metaLines.push(`更新: ${task.updatedAt}`);
    if (task.exitCode != null) metaLines.push(`終了コード: ${task.exitCode}`);
    if (task.externalTerminal && task.externalTerminal.command) {
        metaLines.push(`外部コマンド: ${task.externalTerminal.command}`);
    }
    const sections = [];
    if (prompt) sections.push(`【プロンプト】\n${prompt}`);
    if (response) sections.push(`【AIレスポンス】\n${response}`);
    if (summary) sections.push(`【完了まとめ】\n${summary}`);
    const parts = [];
    if (metaLines.length) parts.push(metaLines.join('\n'));
    if (sections.length) parts.push(sections.join('\n\n'));
    const full = parts.join('\n\n').trim();
    return {
        prompt,
        response,
        summary,
        meta: metaLines,
        full
    };
}

function publicTaskView(task, includeLogs = false) {
    if (!task) return null;
    const joinedLogs = (task.logs || []).join('\n');
    const maxLen = 20000;
    const takeTail = (value) => {
        if (!value) return '';
        return value.length > maxLen ? value.slice(-maxLen) : value;
    };
    const logs = includeLogs ? takeTail(joinedLogs) : undefined;
    const stdout = includeLogs ? takeTail(task.stdout || '') : undefined;
    const stderr = includeLogs ? takeTail(task.stderr || '') : undefined;
    const promptPreview = createPromptPreview(task.prompt || '', 12);
    const copyBundle = composeTaskCopyBundle(task);
    return {
        id: task.id,
        status: task.status,
        prompt: task.prompt,
        promptPreview,
        command: task.command,
        pid: task.pid,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        endedAt: task.endedAt,
        exitCode: task.exitCode,
        urls: task.urls,
        files: task.files,
        lastActivityAt: task.lastActivityAt,
        durationMs: task.durationMs,
        provider: task.provider || null,
        model: task.model || null,
        type: task.type || null,
        importance: resolvePriorityLevel(task.importance),
        urgency: resolvePriorityLevel(task.urgency),
        numTurns: task.resultMeta ? (task.resultMeta.num_turns ?? task.resultMeta.numTurns ?? null) : null,
        resultText: task.resultText,
        manualDone: task.manualDone ? true : false,
        completionSummary: typeof task.completionSummary === 'string' ? task.completionSummary : undefined,
        completionSummaryPending: task.completionSummaryPending ? true : false,
        copyBundle,
        resultMeta: includeLogs ? task.resultMeta : undefined,
        monitor: task.monitor ? {
            intervalSec: task.monitor.intervalSec,
            checks: task.monitor.checks,
            nextCheckAt: task.monitor.nextCheckAt,
            startedAt: task.monitor.startedAt,
            callbackUrl: task.monitor.callbackUrl || undefined
        } : null,
        logs,
        stdout,
        stderr,
        stdoutBytes: task.stdoutBytes,
        stderrBytes: task.stderrBytes
    };
}

// メディア/ドキュメント/コードなどの拡張子
const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'];
const videoExtensions = ['mp4', 'mov', 'avi', 'mkv', 'webm'];
const audioExtensions = ['mp3', 'wav', 'ogg', 'flac', 'm4a'];
const htmlExtensions  = ['html', 'htm'];
const yamlExtensions  = ['yml', 'yaml'];
const jsonExtensions  = ['json'];
const textExtensions  = ['txt', 'md', 'markdown', 'log'];
const codeExtensions  = ['js', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cc', 'cpp', 'h', 'hpp', 'cs', 'php', 'sh', 'bash', 'zsh', 'fish'];
const docExtensions   = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'tsv'];

// ディレクトリをスキャンする関数
function scanDirectory(dirPath, baseDir = null, depth = 0, maxDepth = 5) {
    if (depth > maxDepth) return { files: [], folders: [] };
    
    if (!baseDir) baseDir = dirPath;
    
    const result = {
        files: [],
        folders: []
    };
    
    try {
        const items = fs.readdirSync(dirPath);
        
        items.forEach(item => {
            // 隠しファイルやシステムファイルをスキップ
            if (item.startsWith('.') || item === 'node_modules') return;
            
            const fullPath = path.join(dirPath, item);
            const relativePath = path.relative(baseDir, fullPath);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                const subItems = scanDirectory(fullPath, baseDir, depth + 1, maxDepth);
                result.folders.push({
                    name: item,
                    path: relativePath,
                    items: subItems
                });
            } else if (stat.isFile()) {
                const ext = path.extname(item).toLowerCase().slice(1);
                let type = 'other';
                
                if (imageExtensions.includes(ext)) type = 'image';
                else if (videoExtensions.includes(ext)) type = 'video';
                else if (audioExtensions.includes(ext)) type = 'audio';
                else if (htmlExtensions.includes(ext)) type = 'html';
                else if (yamlExtensions.includes(ext)) type = 'yaml';
                else if (jsonExtensions.includes(ext)) type = 'json';
                else if (codeExtensions.includes(ext)) type = 'code';
                else if (textExtensions.includes(ext)) type = 'text';
                else if (docExtensions.includes(ext)) type = 'doc';
                
                // すべてのタイプ（other含む）を返す
                result.files.push({
                    name: item,
                    path: relativePath,
                    fullPath: fullPath,
                    type: type,
                    ext: ext,
                    size: stat.size,
                    modified: stat.mtime
                });
            }
        });
    } catch (err) {
        console.error('Error scanning directory:', dirPath, err);
    }
    
    return result;
}

function resolveFileKind(type, ext) {
    if (type && type !== 'other') return type;
    const lowered = String(ext || '').toLowerCase();
    if (imageExtensions.includes(lowered)) return 'image';
    if (videoExtensions.includes(lowered)) return 'video';
    if (audioExtensions.includes(lowered)) return 'audio';
    if (htmlExtensions.includes(lowered)) return 'html';
    if (yamlExtensions.includes(lowered)) return 'yaml';
    if (jsonExtensions.includes(lowered)) return 'json';
    if (codeExtensions.includes(lowered)) return 'code';
    if (textExtensions.includes(lowered)) return 'text';
    if (docExtensions.includes(lowered)) return 'doc';
    return 'other';
}

const GRAPH_GROUP_MAP = {
    root: 1,
    folder: 2,
    image: 3,
    video: 4,
    audio: 5,
    html: 6,
    yaml: 7,
    json: 8,
    code: 9,
    other: 10,
    text: 11,
    doc: 12
};

function buildDirectoryGraph(scanResult, baseDir) {
    const nodes = [];
    const links = [];
    let nodeId = 0;
    const stats = {
        folders: 0,
        files: 0,
        images: 0,
        videos: 0,
        audio: 0,
        html: 0,
        yaml: 0,
        json: 0,
        code: 0,
        text: 0,
        doc: 0,
        other: 0
    };

    const rootId = nodeId++;
    nodes.push({
        id: rootId,
        name: 'ROOT',
        type: 'root',
        path: baseDir,
        group: GRAPH_GROUP_MAP.root
    });

    function processDirectory(entry, parentId, depth = 0) {
        if (!entry || typeof entry !== 'object') return;

        const folders = Array.isArray(entry.folders) ? entry.folders : [];
        folders.forEach(folder => {
            const folderId = nodeId++;
            const childFolders = Array.isArray(folder?.items?.folders)
                ? folder.items.folders.map(child => child.name).filter(Boolean)
                : [];
            const childFiles = Array.isArray(folder?.items?.files)
                ? folder.items.files.map(child => child.name).filter(Boolean)
                : [];

            nodes.push({
                id: folderId,
                name: folder.name,
                type: 'folder',
                path: folder.path,
                group: GRAPH_GROUP_MAP.folder,
                depth,
                childFolders: childFolders.slice(0, 20),
                childFiles: childFiles.slice(0, 20),
                childFolderCount: childFolders.length,
                childFileCount: childFiles.length
            });
            links.push({ source: parentId, target: folderId });
            stats.folders += 1;

            if (folder.items) {
                processDirectory(folder.items, folderId, depth + 1);
            }
        });

        const files = Array.isArray(entry.files) ? entry.files : [];
        files.forEach(file => {
            const fileId = nodeId++;
            const ext = (file.ext || path.extname(file.name).slice(1) || '').toLowerCase();
            const resolvedType = resolveFileKind(file.type, ext);
            const group = GRAPH_GROUP_MAP[resolvedType] || GRAPH_GROUP_MAP.other;

            nodes.push({
                id: fileId,
                name: file.name,
                type: resolvedType,
                path: file.path,
                size: file.size,
                group,
                depth,
                ext,
                rawType: file.type || resolvedType
            });
            links.push({ source: parentId, target: fileId });
            stats.files += 1;

            switch (resolvedType) {
                case 'image':
                    stats.images += 1; break;
                case 'video':
                    stats.videos += 1; break;
                case 'audio':
                    stats.audio += 1; break;
                case 'html':
                    stats.html += 1; break;
                case 'yaml':
                    stats.yaml += 1; break;
                case 'json':
                    stats.json += 1; break;
                case 'code':
                    stats.code += 1; break;
                case 'text':
                    stats.text += 1; break;
                case 'doc':
                    stats.doc += 1; break;
                default:
                    stats.other += 1;
            }
        });
    }

    processDirectory(scanResult, rootId);

    return {
        baseDir,
        nodes,
        links,
        stats,
        totals: {
            nodes: nodes.length,
            links: links.length
        }
    };
}

// HTTPサーバーの作成
const server = http.createServer((req, res) => {
    // CORS設定
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // OPTIONS リクエストへの対応（CORS preflight）
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // 設定情報のエンドポイント
    if (req.url === '/api/config') {
        if (!process.env.PORT || !process.env.SCAN_PATH) {
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(500);
            res.end(JSON.stringify({
                error: 'Missing required environment variables: PORT and/or SCAN_PATH'
            }));
            return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(JSON.stringify({
            port: process.env.PORT,
            scanPath: process.env.SCAN_PATH
        }));
        return;
    }
    
    // 静的ファイルの配信（画像、動画、音声）
    if (req.method === 'GET' && !req.url.startsWith('/api/')) {
        // index.htmlの配信
        if (req.url === '/' || req.url === '/index.html') {
            const indexPath = path.join(__dirname, 'index.html');
            fs.readFile(indexPath, (err, data) => {
                if (err) {
                    res.writeHead(404);
                    res.end('Not found');
                    return;
                }
                res.setHeader('Content-Type', 'text/html');
                res.writeHead(200);
                res.end(data);
            });
            return;
        }
        
        // メディアファイルの配信
        if (!process.env.SCAN_PATH) {
            res.writeHead(500);
            res.end('ERROR: SCAN_PATH environment variable is not set');
            return;
        }
        const baseDir = process.env.SCAN_PATH;
        const filePath = decodeURIComponent(req.url.substring(1)); // 先頭の/を削除
        const fullPath = path.join(baseDir, filePath);
        
        // ファイルの存在確認
        fs.stat(fullPath, (err, stats) => {
            if (err || !stats.isFile()) {
                res.writeHead(404);
                res.end('File not found');
                return;
            }
            
            // MIMEタイプの設定
            const ext = path.extname(fullPath).toLowerCase();
            const mimeTypes = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.svg': 'image/svg+xml',
                '.webp': 'image/webp',
                '.mp4': 'video/mp4',
                '.mov': 'video/quicktime',
                '.avi': 'video/x-msvideo',
                '.mkv': 'video/x-matroska',
                '.webm': 'video/webm',
                '.mp3': 'audio/mpeg',
                '.wav': 'audio/wav',
                '.ogg': 'audio/ogg',
                '.flac': 'audio/flac',
                '.m4a': 'audio/mp4',
                '.html': 'text/html; charset=utf-8',
                '.htm': 'text/html; charset=utf-8'
            };
            
            const contentType = mimeTypes[ext] || 'application/octet-stream';
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=3600');
            
            // ファイルをストリーミング
            const stream = fs.createReadStream(fullPath);
            stream.pipe(res);
            stream.on('error', () => {
                res.writeHead(500);
                res.end('Internal server error');
            });
        });
        return;
    }
    
    res.setHeader('Content-Type', 'application/json');
    const requestUrl = new URL(req.url, 'http://localhost');
    
    if (requestUrl.pathname === '/api/scan' && req.method === 'GET') {
        // .envで指定された絶対パスをスキャン
        if (!process.env.SCAN_PATH) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'SCAN_PATH environment variable is not set' }));
            return;
        }
        const currentDir = process.env.SCAN_PATH;
        console.log('Scanning directory:', currentDir);
        const mediaFiles = scanDirectory(currentDir);

        res.writeHead(200);
        res.end(JSON.stringify({
            baseDir: currentDir,
            data: mediaFiles
        }));
    } else if (requestUrl.pathname === '/api/directory-graph' && req.method === 'GET') {
        if (!process.env.SCAN_PATH) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'SCAN_PATH environment variable is not set' }));
            return;
        }
        const currentDir = process.env.SCAN_PATH;
        console.log('Building directory graph for:', currentDir);
        const mediaTree = scanDirectory(currentDir);
        const graph = buildDirectoryGraph(mediaTree, currentDir);
        res.writeHead(200);
        res.end(JSON.stringify(graph));
    } else if (requestUrl.pathname === '/api/open-file' && req.method === 'POST') {
        // ファイルを開く
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const { path: filePath } = JSON.parse(body);
                if (!process.env.SCAN_PATH) {
            res.writeHead(500);
            res.end('ERROR: SCAN_PATH environment variable is not set');
            return;
        }
        const baseDir = process.env.SCAN_PATH;
                const fullPath = path.join(baseDir, filePath);
                
                // macOSの場合
                if (process.platform === 'darwin') {
                    exec(`open "${fullPath}"`, (error) => {
                        if (error) {
                            console.error('Error opening file:', error);
                            res.writeHead(500);
                            res.end(JSON.stringify({ error: 'Failed to open file' }));
                        } else {
                            res.writeHead(200);
                            res.end(JSON.stringify({ success: true }));
                        }
                    });
                }
                // Windowsの場合
                else if (process.platform === 'win32') {
                    exec(`start "" "${fullPath}"`, (error) => {
                        if (error) {
                            console.error('Error opening file:', error);
                            res.writeHead(500);
                            res.end(JSON.stringify({ error: 'Failed to open file' }));
                        } else {
                            res.writeHead(200);
                            res.end(JSON.stringify({ success: true }));
                        }
                    });
                }
                // Linuxの場合
                else {
                    exec(`xdg-open "${fullPath}"`, (error) => {
                        if (error) {
                            console.error('Error opening file:', error);
                            res.writeHead(500);
                            res.end(JSON.stringify({ error: 'Failed to open file' }));
                        } else {
                            res.writeHead(200);
                            res.end(JSON.stringify({ success: true }));
                        }
                    });
                }
            } catch (err) {
                console.error('Error parsing request:', err);
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Invalid request' }));
            }
        });
    } else if (requestUrl.pathname === '/api/open-file-absolute' && req.method === 'POST') {
        // 絶対パスのファイルを開く
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const { path: filePath } = JSON.parse(body);
                if (!filePath || !filePath.startsWith('/')) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Invalid absolute path' }));
                    return;
                }
                
                // macOSの場合
                if (process.platform === 'darwin') {
                    exec(`open "${filePath}"`, (error) => {
                        if (error) {
                            console.error('Error opening file:', error);
                            res.writeHead(500);
                            res.end(JSON.stringify({ error: 'Failed to open file' }));
                        } else {
                            res.writeHead(200);
                            res.end(JSON.stringify({ success: true }));
                        }
                    });
                }
                // Windowsの場合
                else if (process.platform === 'win32') {
                    exec(`start "" "${filePath}"`, (error) => {
                        if (error) {
                            console.error('Error opening file:', error);
                            res.writeHead(500);
                            res.end(JSON.stringify({ error: 'Failed to open file' }));
                        } else {
                            res.writeHead(200);
                            res.end(JSON.stringify({ success: true }));
                        }
                    });
                }
                // Linuxの場合
                else {
                    exec(`xdg-open "${filePath}"`, (error) => {
                        if (error) {
                            console.error('Error opening file:', error);
                            res.writeHead(500);
                            res.end(JSON.stringify({ error: 'Failed to open file' }));
                        } else {
                            res.writeHead(200);
                            res.end(JSON.stringify({ success: true }));
                        }
                    });
                }
            } catch (err) {
                console.error('Error parsing request:', err);
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Invalid request' }));
            }
        });
    } else if (requestUrl.pathname === '/api/open-folder-absolute' && req.method === 'POST') {
        // 絶対パスのフォルダを開く
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const { path: folderPath } = JSON.parse(body);
                if (!folderPath || !folderPath.startsWith('/')) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Invalid absolute path' }));
                    return;
                }
                
                // macOSの場合
                if (process.platform === 'darwin') {
                    exec(`open "${folderPath}"`, (error) => {
                        if (error) {
                            console.error('Error opening folder:', error);
                            res.writeHead(500);
                            res.end(JSON.stringify({ error: 'Failed to open folder' }));
                        } else {
                            res.writeHead(200);
                            res.end(JSON.stringify({ success: true }));
                        }
                    });
                }
                // Windowsの場合
                else if (process.platform === 'win32') {
                    exec(`explorer "${folderPath}"`, (error) => {
                        if (error) {
                            console.error('Error opening folder:', error);
                            res.writeHead(500);
                            res.end(JSON.stringify({ error: 'Failed to open folder' }));
                        } else {
                            res.writeHead(200);
                            res.end(JSON.stringify({ success: true }));
                        }
                    });
                }
                // Linuxの場合
                else {
                    exec(`xdg-open "${folderPath}"`, (error) => {
                        if (error) {
                            console.error('Error opening folder:', error);
                            res.writeHead(500);
                            res.end(JSON.stringify({ error: 'Failed to open folder' }));
                        } else {
                            res.writeHead(200);
                            res.end(JSON.stringify({ success: true }));
                        }
                    });
                }
            } catch (err) {
                console.error('Error parsing request:', err);
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Invalid request' }));
            }
        });
    } else if (requestUrl.pathname === '/api/open-folder' && req.method === 'POST') {
        // フォルダを開く
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const { path: folderPath } = JSON.parse(body);
                if (!process.env.SCAN_PATH) {
            res.writeHead(500);
            res.end('ERROR: SCAN_PATH environment variable is not set');
            return;
        }
        const baseDir = process.env.SCAN_PATH;
                const fullPath = path.join(baseDir, folderPath);
                
                // macOSの場合
                if (process.platform === 'darwin') {
                    exec(`open "${fullPath}"`, (error) => {
                        if (error) {
                            console.error('Error opening folder:', error);
                            res.writeHead(500);
                            res.end(JSON.stringify({ error: 'Failed to open folder' }));
                        } else {
                            res.writeHead(200);
                            res.end(JSON.stringify({ success: true }));
                        }
                    });
                }
                // Windowsの場合
                else if (process.platform === 'win32') {
                    exec(`explorer "${fullPath}"`, (error) => {
                        if (error) {
                            console.error('Error opening folder:', error);
                            res.writeHead(500);
                            res.end(JSON.stringify({ error: 'Failed to open folder' }));
                        } else {
                            res.writeHead(200);
                            res.end(JSON.stringify({ success: true }));
                        }
                    });
                }
                // Linuxの場合
                else {
                    exec(`xdg-open "${fullPath}"`, (error) => {
                        if (error) {
                            console.error('Error opening folder:', error);
                            res.writeHead(500);
                            res.end(JSON.stringify({ error: 'Failed to open folder' }));
                        } else {
                            res.writeHead(200);
                            res.end(JSON.stringify({ success: true }));
                        }
                    });
                }
            } catch (err) {
                console.error('Error parsing request:', err);
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Invalid request' }));
            }
        });
    } else if (requestUrl.pathname === '/api/pty/open-iterm' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', async () => {
            if (process.platform !== 'darwin') {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'unsupported_platform' }));
                return;
            }

            let targetPath = PROJECT_ROOT;
            if (body) {
                try {
                    const payload = JSON.parse(body);
                    if (payload && typeof payload.cwd === 'string') {
                        const trimmed = payload.cwd.trim();
                        if (trimmed.startsWith('/')) {
                            targetPath = trimmed;
                        }
                    }
                } catch (_) {
                    // ignore invalid JSON payloads; fallback to default path
                }
            }

            try {
                const launchCandidates = ['iTerm', 'iTerm2'];
                let launchedApp = null;
                let lastError = null;
                for (const appName of launchCandidates) {
                    try {
                        await new Promise((resolve, reject) => {
                            const child = spawn('open', ['-a', appName, targetPath], { stdio: 'ignore' });
                            child.on('error', reject);
                            child.on('close', (code) => {
                                if (code === 0) resolve();
                                else reject(new Error(`open_exit_${code}`));
                            });
                        });
                        launchedApp = appName;
                        break;
                    } catch (err) {
                        lastError = err;
                    }
                }

                if (!launchedApp) {
                    throw lastError || new Error('iTerm_not_available');
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, app: launchedApp, path: targetPath }));
            } catch (err) {
                console.error('[PTY] Failed to open iTerm:', err.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'failed_to_open_iterm', message: err.message }));
            }
        });
    } else if (requestUrl.pathname === '/api/terminal/codex/status' && req.method === 'POST') {
        // Codexターミナルセッションのステータスを取得
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', async () => {
            let payload = {};
            if (body) {
                try {
                    payload = JSON.parse(body);
                } catch (err) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'invalid_json', message: err.message }));
                    return;
                }
            }
            
            const sessionId = payload && typeof payload.sessionId === 'string' ? payload.sessionId.trim() : '';
            const appleSessionId = payload && typeof payload.appleSessionId === 'string' ? payload.appleSessionId.trim() : null;
            
            if (!sessionId) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'missing_session_id' }));
                return;
            }
            
            if (process.platform !== 'darwin') {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'unsupported_platform' }));
                return;
            }
            
            try {
                const content = await getItermSessionContent(sessionId, appleSessionId);
                const isWorking = content && content.toLowerCase().includes('working');
                console.log(`[Codex Status Check] Session ${sessionId}: Working=${isWorking}, Content length=${content ? content.length : 0}`);
                if (isWorking && content) {
                    // Workingが見つかった場合、その部分を抽出してログに表示
                    const workingIndex = content.toLowerCase().indexOf('working');
                    const excerpt = content.slice(Math.max(0, workingIndex - 50), Math.min(content.length, workingIndex + 50));
                    console.log(`[Codex Status Check] Working excerpt: ${excerpt}`);
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    success: true, 
                    sessionId,
                    isWorking,
                    content: content ? content.slice(-2000) : '' // 最後の2000文字だけ返す
                }));
            } catch (err) {
                const message = err && err.message ? err.message : String(err || 'failed');
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'get_content_failed', message }));
            }
        });
    } else if (requestUrl.pathname === '/api/terminal/codex' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', async () => {
            let payload = {};
            if (body) {
                try {
                    payload = JSON.parse(body);
                } catch (err) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'invalid_json', message: err.message }));
                    return;
                }
            }

            const actionRaw = typeof payload.action === 'string' ? payload.action.toLowerCase() : 'launch';

            if (actionRaw === 'focus') {
                const sessionId = payload && typeof payload.sessionId === 'string' ? payload.sessionId.trim() : '';
                if (!sessionId) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'missing_session_id' }));
                    return;
                }
                const providedAppleId = payload && typeof payload.appleSessionId === 'string' && payload.appleSessionId.trim()
                    ? payload.appleSessionId.trim()
                    : null;
                const session = terminalSessions.get(sessionId);
                if (!session) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'session_not_found' }));
                    return;
                }
                if (providedAppleId && !session.appleSessionId) {
                    session.appleSessionId = providedAppleId;
                }
                try {
                    await focusItermSession(sessionId, providedAppleId || session.appleSessionId || null);
                    session.lastFocusedAt = new Date().toISOString();
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                } catch (err) {
                    const message = err && err.message ? err.message : String(err || 'focus_failed');
                    const notFound = /session_not_found/i.test(message);
                    if (notFound) {
                        terminalSessions.delete(sessionId);
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'session_not_found' }));
                        return;
                    }
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'focus_failed', message }));
                }
                return;
            }

            if (actionRaw === 'terminate') {
                const sessionId = payload && typeof payload.sessionId === 'string' ? payload.sessionId.trim() : '';
                if (!sessionId) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'missing_session_id' }));
                    return;
                }
                const providedAppleId = payload && typeof payload.appleSessionId === 'string' && payload.appleSessionId.trim()
                    ? payload.appleSessionId.trim()
                    : null;
                const session = terminalSessions.get(sessionId);
                const appleId = providedAppleId || (session && session.appleSessionId) || null;
                try {
                    await terminateItermSession(sessionId, appleId);
                    terminalSessions.delete(sessionId);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                } catch (err) {
                    const message = err && err.message ? err.message : String(err || 'terminate_failed');
                    if (/session_not_found/i.test(message)) {
                        terminalSessions.delete(sessionId);
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'session_not_found' }));
                    } else {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'terminate_failed', message }));
                    }
                }
                return;
            }

            if (actionRaw === 'summary') {
                const basePrompt = payload && typeof payload.basePrompt === 'string' ? payload.basePrompt : null;
                const taskPrompt = payload && typeof payload.taskPrompt === 'string' ? payload.taskPrompt : null;
                const sessionIdForSummary = payload && typeof payload.sessionId === 'string' ? payload.sessionId.trim() : null;
                const appleSessionIdForSummary = payload && typeof payload.appleSessionId === 'string' ? payload.appleSessionId.trim() : null;
                const safeBase = basePrompt && basePrompt.trim().length ? basePrompt.trim() : '完了済みにする際に自動でterminalにこれまでの作業をまとめて、特に編集、生成したファイルパスを必ず記述すること';
                const promptLines = [safeBase];
                if (taskPrompt && taskPrompt.trim()) {
                    promptLines.push(`参考: 元のタスク/プロンプト\n${taskPrompt.trim()}`);
                }
                promptLines.push('出力は日本語で記述してください。');
                const promptText = promptLines.join('\n\n');
                let summary = '';
                if (process.platform === 'darwin' && sessionIdForSummary) {
                try {
                    const sentinel = `<<<KAMUI_SUMMARY_${Date.now()}>>>`;
                    await sendTextToItermSession(sessionIdForSummary, appleSessionIdForSummary, `printf '${sentinel}\\n'`);
                    let baseline = await getItermSessionContent(sessionIdForSummary, appleSessionIdForSummary) || '';
                    const sentinelDeadline = Date.now() + 5000;
                    while (!baseline.includes(sentinel) && Date.now() < sentinelDeadline) {
                        await sleep(400);
                        baseline = await getItermSessionContent(sessionIdForSummary, appleSessionIdForSummary) || '';
                    }
                    // プロンプトを送信し、少し待機してから改行を送信
                    await sendTextToItermSession(sessionIdForSummary, appleSessionIdForSummary, promptText);
                    await sleep(300); // プロンプトが完全に入力されるのを待つ
                    await sendTextToItermSession(sessionIdForSummary, appleSessionIdForSummary, ''); // 改行を送信してプロンプトを実行
                    let bestCapture = '';
                    let lastCapture = '';
                    let stableCount = 0;
                    let meaningfulContentFound = false;
                    const captureStart = Date.now();
                    const minCompleteAt = captureStart + SUMMARY_MIN_CAPTURE_MS;
                    const deadline = captureStart + SUMMARY_MAX_CAPTURE_MS;
                    
                    // 最初の意味のあるコンテンツが見つかるまでのタイムアウト
                    const firstContentTimeout = captureStart + 30000; // 30秒
                    
                    while (Date.now() < deadline) {
                        await sleep(800);
                        const latest = await getItermSessionContent(sessionIdForSummary, appleSessionIdForSummary) || '';
                        if (!latest.includes(sentinel)) continue;
                        const markerIndex = latest.lastIndexOf(sentinel);
                        if (markerIndex === -1) continue;
                        const rawDiff = latest.slice(markerIndex + sentinel.length);
                        const cleaned = cleanTerminalSummary(rawDiff, promptText);
                        
                        if (!cleaned) {
                            // まだ意味のあるコンテンツが見つかっていない場合、タイムアウトをチェック
                            if (!meaningfulContentFound && Date.now() > firstContentTimeout) {
                                console.log('[Terminal] No meaningful content found within 30 seconds, continuing...');
                            }
                            continue;
                        }
                        
                        if (cleaned === lastCapture) {
                            stableCount += 1;
                        } else {
                            lastCapture = cleaned;
                            stableCount = 1;
                        }
                        
                        if (hasMeaningfulText(cleaned)) {
                            bestCapture = cleaned;
                            meaningfulContentFound = true;
                        }
                        
                        // 終了条件：
                        // 1. 意味のあるコンテンツが見つかっている
                        // 2. 最小待機時間（20秒）が経過している
                        // 3. 出力が安定している（3回以上同じ内容）
                        if (meaningfulContentFound && stableCount >= 3 && Date.now() >= minCompleteAt) {
                            console.log(`[Terminal] Summary capture complete after ${Math.round((Date.now() - captureStart) / 1000)}s`);
                            break;
                        }
                    }
                    if (hasMeaningfulText(bestCapture)) {
                        summary = bestCapture;
                    }
                } catch (err) {
                    console.warn('[Terminal] Failed to capture terminal summary:', err.message);
                }
                }
                if (!summary) {
                    summary = '完了プロンプトを送信しましたが、ターミナルからの応答を取得できませんでした。必要に応じて手動で追記してください。';
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ summary }));
                return;
            }

            if (process.platform !== 'darwin') {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'unsupported_platform' }));
                return;
            }

            const sessionId = createTerminalSessionId();
            const rawPrompt = typeof payload.prompt === 'string' ? payload.prompt : '';
            const prompt = rawPrompt.trim();
            const linesToSend = [];
            if (prompt) linesToSend.push(prompt);
            if (!prompt || !/日本語で対応すること/.test(prompt)) {
                linesToSend.push(CODEX_JAPANESE_INSTRUCTION);
            }
            const promptSegments = linesToSend.map(line => `"${escapeAppleScriptString(line)}"`);
            const promptExpression = promptSegments.length
                ? (promptSegments.length === 1 ? promptSegments[0] : promptSegments.join(' & return & '))
                : null;
            const customArgs = Array.isArray(payload.args)
                ? payload.args.filter(arg => typeof arg === 'string' && arg.trim() !== '')
                : [];
            const baseCommand = payload && typeof payload.command === 'string' && payload.command.trim()
                ? payload.command.trim()
                : 'codex';
            const commandArgs = customArgs.length ? `${baseCommand} ${shellQuoteArgs(customArgs)}` : baseCommand;
            const cwdCandidate = payload && typeof payload.cwd === 'string' && payload.cwd.trim()
                ? payload.cwd.trim()
                : PROJECT_ROOT;
            const resolvedCwd = cwdCandidate.startsWith('/') ? cwdCandidate : PROJECT_ROOT;

            const sessionLookupToken = `@Codex+terminal:${sessionId}`;
            const summarySeed = prompt || CODEX_JAPANESE_INSTRUCTION;
            const promptSummary = summarizePromptForTab(summarySeed);
            const sessionLabel = promptSummary ? `${promptSummary} :: ${sessionLookupToken}` : sessionLookupToken;
            const escapedLabel = escapeAppleScriptString(sessionLabel);
            const escapedCommand = escapeAppleScriptString(commandArgs);
            const escapedCwdForAppleScript = escapeAppleScriptString(resolvedCwd);

            const scriptLines = [
                'tell application "iTerm"',
                '    activate',
                '    set theSession to missing value',
                '    if (count of windows) = 0 then',
                '        set newWindow to create window with default profile',
                '        set theSession to current session of newWindow',
                '    else',
                '        set newWindow to current window',
                '        tell newWindow',
                '            create tab with default profile',
                '            set theSession to current session of current tab',
                '        end tell',
                '    end if',
                '    if theSession is missing value then',
                '        set newWindow to create window with default profile',
                '        set theSession to current session of newWindow',
                '    end if',
                `    set name of theSession to "${escapedLabel}"`,
                '    tell theSession'
            ];
            scriptLines.push(`        write text "cd " & quoted form of "${escapedCwdForAppleScript}"`);
            scriptLines.push(`        write text "${escapedCommand}"`);
            scriptLines.push('    end tell');
            if (promptExpression) {
                scriptLines.push('    delay 1.0');
                scriptLines.push(`    tell theSession to write text (${promptExpression})`);
                
                // 2秒待ってから、1秒間隔で2回だけ、改行とスペースを送信
                scriptLines.push('    delay 2.0'); // 最初は2秒待機
                for (let i = 1; i <= 2; i++) {
                    scriptLines.push('    tell theSession to write text ""'); // 空文字列で改行
                    scriptLines.push('    tell theSession to write text return'); // 明示的な改行
                    scriptLines.push('    tell theSession to write text " "'); // スペース
                    if (i < 2) {
                        scriptLines.push('    delay 1.0'); // 次の繰り返しまで1秒待機
                    }
                }
            }
            scriptLines.push('    set sessionIdentifier to id of theSession as string');
            scriptLines.push('    sessionIdentifier');
            scriptLines.push('end tell');
            const script = scriptLines.join('\n');

            try {
                const appleSessionId = await runAppleScript(script, { captureOutput: true });
                const sessionRecord = {
                    id: sessionId,
                    app: 'iTerm',
                    command: commandArgs,
                    prompt,
                    cwd: resolvedCwd,
                    createdAt: new Date().toISOString(),
                    model: payload && typeof payload.model === 'string' ? payload.model : null,
                    appleSessionId: appleSessionId || null,
                    label: sessionLabel
                };
                terminalSessions.set(sessionId, sessionRecord);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, sessionId, appleSessionId, app: sessionRecord.app, command: sessionRecord.command }));
            } catch (err) {
                const message = err && err.message ? err.message : String(err || 'launch_failed');
                console.error('[Terminal] Failed to open Codex session:', message);
                console.error('[Terminal] AppleScript payload:', script);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'launch_failed', message }));
            }
        });
    } else if (requestUrl.pathname === '/api/health' && req.method === 'GET') {
        const all = Object.values(tasks);
        const stats = all.reduce((acc, t) => {
            acc.total++;
            acc[t.status] = (acc[t.status] || 0) + 1;
            return acc;
        }, { total: 0, running: 0, completed: 0, failed: 0 });
        res.writeHead(200);
        res.end(JSON.stringify({
            status: 'ok',
            port: process.env.PORT,
            scanPath: process.env.SCAN_PATH,
            pid: process.pid,
            startedAt: SERVER_STARTED_AT,
            uptimeSeconds: Math.floor(process.uptime()),
            tasks: stats
        }));
    } else if (requestUrl.pathname === '/api/logs' && req.method === 'GET') {
        const limitParam = requestUrl.searchParams.get('limit');
        const limit = Math.max(1, Math.min(1000, Number(limitParam) || 200));
        const since = requestUrl.searchParams.get('since');
        let lines = serverLogs.slice(-limit);
        if (since) {
            const idx = serverLogs.findIndex(l => l.startsWith(`[${since}`));
            if (idx >= 0) lines = serverLogs.slice(idx);
        }
        res.writeHead(200);
        res.end(JSON.stringify({ lines, count: lines.length }));
    } else if (requestUrl.pathname === '/api/agent/submit' && req.method === 'POST') {
        // タスクを新規作成して実行
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const payload = body ? JSON.parse(body) : {};
                const prompt = payload.prompt || '';
                const mcpConfigPath = payload.mcpConfigPath;
                const cwd = payload.cwd;
                const extraArgs = payload.extraArgs;
                const task = startClaudeTask({ prompt, mcpConfigPath, cwd, extraArgs, importance: payload.importance, urgency: payload.urgency });
                res.writeHead(202);
                res.end(JSON.stringify({ task: publicTaskView(task, false) }));
            } catch (err) {
                console.error('Submit parse error:', err);
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Invalid request' }));
            }
        });
    } else if (requestUrl.pathname === '/api/agent/status' && req.method === 'GET') {
        // タスクの状態を返す（id指定がなければ一覧）
        const id = requestUrl.searchParams.get('id');
        if (id) {
            const task = tasks[id];
            if (!task) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Task not found' }));
                return;
            }
            res.writeHead(200);
            res.end(JSON.stringify({ task: publicTaskView(task, false), persistedAt: lastTasksPersistAt }));
        } else {
            const list = Object.values(tasks).map(t => publicTaskView(t, false));
            // サマリー統計
            const stats = list.reduce((acc, t) => {
                acc.total++;
                acc[t.status] = (acc[t.status] || 0) + 1;
                return acc;
            }, { total: 0, running: 0, completed: 0, failed: 0 });
            res.writeHead(200);
            res.end(JSON.stringify({ tasks: list, stats, persistedAt: lastTasksPersistAt }));
        }
    } else if (requestUrl.pathname === '/api/agent/result' && req.method === 'GET') {
        // タスク結果詳細（ログ含む）
        const id = requestUrl.searchParams.get('id');
        const includeLogs = requestUrl.searchParams.get('logs') === '1' || requestUrl.searchParams.get('logs') === 'true';
        if (!id) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Missing id' }));
            return;
        }
        const task = tasks[id];
        if (!task) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Task not found' }));
            return;
        }
        res.writeHead(200);
        res.end(JSON.stringify({ task: publicTaskView(task, includeLogs), persistedAt: lastTasksPersistAt }));
    } else if (requestUrl.pathname === '/api/claude/chat' && req.method === 'POST') {
        // Claude headlessモードエンドポイント（Python SDKサーバーの代替）
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        let chatTaskId = null;
        let taskRecord = null;
        req.on('end', async () => {
            try {
                const payload = body ? JSON.parse(body) : {};
                const prompt = payload.prompt || '';
                const priorityImportance = resolvePriorityLevel(payload.importance);
                const priorityUrgency = resolvePriorityLevel(payload.urgency);
                
                if (!prompt.trim()) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Prompt is required' }));
                    return;
                }
                
                const mcpConfigPath = process.env.CLAUDE_MCP_CONFIG_PATH;
                if (!mcpConfigPath || !fs.existsSync(mcpConfigPath)) {
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: 'MCP configuration not found', path: mcpConfigPath }));
                    return;
                }
                
                chatTaskId = createTaskId();
                const createdIso = new Date().toISOString();
                taskRecord = {
                    id: chatTaskId,
                    status: 'running',
                    prompt,
                    createdAt: createdIso,
                    updatedAt: createdIso,
                    logs: [],
                    urls: [],
                    files: [],
                    resultMeta: null,
                    resultText: '',
                    type: 'claude_chat',
                    importance: priorityImportance,
                    urgency: priorityUrgency
                };
                tasks[chatTaskId] = taskRecord;
                scheduleTasksPersist('claude_chat_created');

                // Claude CLIをheadlessモードで実行（stream-jsonフォーマットを使用）
                // システムプロンプトを日本語で追加
                const systemPrompt = "あなたはコマンドラインヘルパーです。ユーザーがリソースを要求した場合、curlでダウンロードし、明示的なローカルファイルパスに保存して、最終メッセージでそのパスを報告してください。URLが生成された場合は、保存されたファイルパスと一緒に最終レスポンスに含めてください。リクエストは提供されたMCPツール（Imagen4関連のエンドポイントなど）のみを使用して満たす必要があり、非MCPサービスにフォールバックしてはいけません。MCPツールが使用できない場合は、別のプロバイダーに切り替えるのではなく、明示的なエラーを返してください。ステータスチェックが必要な場合は、10秒単位でsleepコマンドを使用してチェックを行ってください。";
                
                const args = [
                    '-p', // --print (non-interactive mode)
                    prompt, // プロンプトは-pの直後に配置
                    '--output-format', 'stream-json',
                    '--verbose',
                    '--mcp-config', mcpConfigPath,
                    '--append-system-prompt', systemPrompt
                ];
                
                if (process.env.CLAUDE_MAX_TURNS) {
                    args.push('--max-turns', process.env.CLAUDE_MAX_TURNS);
                }
                
                if (process.env.CLAUDE_SKIP_PERMISSIONS === '1' || process.env.CLAUDE_SKIP_PERMISSIONS === 'true') {
                    args.push('--dangerously-skip-permissions');
                }
                
                console.log('[CLAUDE CHAT] Starting headless execution:', 'claude', args.join(' '));
                
                // Promiseでラップして同期的に処理
                const execution = await new Promise((resolve, reject) => {
                    const child = spawn('claude', args, {
                        env: { ...process.env, PATH: `${process.env.PATH || ''}:/opt/homebrew/bin:/usr/local/bin:/usr/bin` },
                        cwd: process.cwd()
                    });
                    
                    const messages = [];
                    let buffer = '';
                    let finalResult = null;
                    const assistantLogs = [];
                    taskRecord.pid = child.pid;
                    
                    // headlessモードではstdinは使わない
                    child.stdin.end();
                    
                    child.stdout.on('data', (chunk) => {
                        buffer += chunk.toString();
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || ''; // 最後の不完全な行を保持
                        
                        for (const line of lines) {
                            if (line.trim()) {
                                try {
                                    const msg = JSON.parse(line);
                                    messages.push(msg);
                                    
                                    // アシスタントのテキストメッセージを収集
                                    if (msg.type === 'assistant' && msg.message && msg.message.content) {
                                        for (const content of msg.message.content) {
                                            if (content.type === 'text') {
                                                const formatted = `[CLAUDE CHAT] ${content.text}`;
                                                console.log('[CLAUDE CHAT] Assistant response:', content.text);
                                                assistantLogs.push(formatted);
                                                taskRecord.logs.push(formatted);
                                                taskRecord.updatedAt = new Date().toISOString();
                                                if (taskRecord.logs.length > 500) {
                                                    taskRecord.logs = taskRecord.logs.slice(-500);
                                                }
                                            }
                                        }
                                    }
                                    
                                    // 最終結果を保存
                                    if (msg.type === 'result') {
                                        finalResult = msg;
                                    }
                                } catch (e) {
                                    console.error('[CLAUDE CHAT] Failed to parse line:', line, e);
                                }
                            }
                        }
                    });
                    
                    child.stderr.on('data', (chunk) => {
                        console.log('[CLAUDE CHAT] STDERR:', chunk.toString());
                    });
                    
                    child.on('close', (code) => {
                        if (code === 0) {
                            // アシスタントのテキストメッセージを抽出
                            let responseText = '';
                            for (const msg of messages) {
                                if (msg.type === 'assistant' && msg.message && msg.message.content) {
                                    for (const content of msg.message.content) {
                                        if (content.type === 'text') {
                                            responseText += content.text + '\n';
                                        }
                                    }
                                }
                            }
                            
                            // 最終結果オブジェクトを構築
                            const rawResult = finalResult || {};
                            rawResult.result = responseText.trim();
                            taskRecord.status = 'completed';
                            taskRecord.updatedAt = new Date().toISOString();
                            taskRecord.endedAt = taskRecord.updatedAt;
                            taskRecord.resultText = rawResult.result;
                            taskRecord.resultMeta = {
                                num_turns: rawResult.num_turns,
                                duration_ms: rawResult.duration_ms,
                                duration_api_ms: rawResult.duration_api_ms,
                                is_error: rawResult.is_error,
                                total_cost_usd: rawResult.total_cost_usd,
                                usage: rawResult.usage,
                                session_id: rawResult.session_id
                            };
                            taskRecord.logs = assistantLogs.slice(-500);
                            
                            resolve({ raw: rawResult, logs: assistantLogs.slice() });
                        } else {
                            taskRecord.status = 'failed';
                            taskRecord.updatedAt = new Date().toISOString();
                            taskRecord.logs.push(`[ERROR] Claude exited with code ${code}`);
                            reject(new Error(`Claude exited with code ${code}`));
                        }
                        persistTasksImmediate('claude_chat_closed');
                    });
                    
                    child.on('error', (err) => {
                        reject(err);
                    });
                });
                
                // レスポンスフォーマットをPython SDKサーバーと互換性を保つ
                const rawResult = execution.raw || {};
                const assistantLogs = Array.isArray(execution.logs) ? execution.logs : [];
                res.writeHead(200);
                res.end(JSON.stringify({
                    taskId: chatTaskId,
                    prompt: prompt,
                    response: rawResult.result || '',
                    logs: assistantLogs,
                    result: {
                        num_turns: rawResult.num_turns,
                        duration_ms: rawResult.duration_ms,
                        duration_api_ms: rawResult.duration_api_ms,
                        is_error: rawResult.is_error,
                        total_cost_usd: rawResult.total_cost_usd,
                        usage: rawResult.usage,
                        session_id: rawResult.session_id,
                        result: rawResult.result
                    }
                }));
                
            } catch (err) {
                console.error('[CLAUDE CHAT] Error:', err);
                if (taskRecord) {
                    taskRecord.status = 'failed';
                    taskRecord.updatedAt = new Date().toISOString();
                    taskRecord.logs = taskRecord.logs || [];
                    taskRecord.logs.push(`[ERROR] ${err.message}`);
                    persistTasksImmediate('claude_chat_error');
                }
                res.writeHead(500);
                res.end(JSON.stringify({ error: err.message }));
            }
        });
    } else if (requestUrl.pathname === '/api/codex/chat' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const payload = body ? JSON.parse(body) : {};
                const prompt = payload.prompt || '';
                if (!prompt || !prompt.trim()) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Prompt is required' }));
                    return;
                }

                const task = startCodexTask({
                    prompt,
                    model: payload.model,
                    profile: payload.profile,
                    sandbox: payload.sandbox,
                    cwd: payload.cwd,
                    configOverrides: payload.configOverrides,
                    extraArgs: payload.extraArgs,
                    skipGitCheck: payload.skipGitCheck,
                    importance: payload.importance,
                    urgency: payload.urgency
                });

                try {
                    const result = await task.completionPromise;
                    res.writeHead(200);
                    res.end(JSON.stringify({
                        taskId: task.id,
                        prompt,
                        response: result && typeof result.resultText === 'string' ? result.resultText : '',
                        logs: Array.isArray(result && result.logs) ? result.logs : [],
                        result: {
                            result: result && typeof result.resultText === 'string' ? result.resultText : '',
                            provider: 'codex',
                            model: (result && result.meta && result.meta.model) || task.model || null,
                            token_usage: result && result.meta ? result.meta.token_usage || null : null,
                            errors: result && result.meta && Array.isArray(result.meta.errors) ? result.meta.errors : null,
                            meta: result ? result.meta : null
                        }
                    }));
                } catch (err) {
                    console.error('[CODEX CHAT] Error awaiting completion:', err);
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: err.message || String(err), taskId: task.id }));
                }
            } catch (err) {
                console.error('[CODEX CHAT] Error:', err);
                res.writeHead(400);
                res.end(JSON.stringify({ error: err.message || 'Invalid request' }));
            }
        });
    } else if (requestUrl.pathname === '/api/claude/health' && req.method === 'GET') {
        // Claude headlessモード用ヘルスチェック
        const mcpConfigPath = process.env.CLAUDE_MCP_CONFIG_PATH;
        const mcpExists = mcpConfigPath && fs.existsSync(mcpConfigPath);
        
        res.writeHead(200);
        res.end(JSON.stringify({
            status: 'ok',
            host: '127.0.0.1',
            port: process.env.PORT || 7777,
            mcp_config_path: mcpConfigPath,
            mcp_config_exists: mcpExists
        }));
    } else if (requestUrl.pathname === '/api/saas/list' && req.method === 'GET') {
        const files = listSaasYamlFiles();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ files }));
    } else if (requestUrl.pathname === '/api/saas/yaml' && req.method === 'GET') {
        const filename = requestUrl.searchParams.get('file');
        const data = readSaasYamlFile(filename);
        if (!data) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'File not found', file: filename }));
            return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
    } else if (requestUrl.pathname === '/api/claude/mcp/servers' && req.method === 'GET') {
        // MCP設定からサーバー一覧を返す
        const mcpPath = process.env.CLAUDE_MCP_CONFIG_PATH;
        try {
            const servers = [];
            if (mcpPath && fs.existsSync(mcpPath)) {
                const data = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
                const raw = data.mcpServers || data.servers || {};
                const baseUrl = process.env.MCP_BASE_URL;
                
                for (const [name, cfg] of Object.entries(raw)) {
                    if (!cfg || typeof cfg !== 'object') continue;
                    // URLの{BASE_URL}を実際のベースURLに置換
                    const url = (cfg.url || cfg.endpoint || cfg.command || '').replace('{BASE_URL}', baseUrl);
                    servers.push({
                        name: name,
                        type: cfg.type || cfg.kind || '',
                        url: url,
                        description: cfg.description || cfg.comment || ''
                    });
                }
            }
            res.writeHead(200);
            res.end(JSON.stringify({ config_path: mcpPath, servers: servers }));
        } catch (err) {
            console.error('[MCP] List error:', err);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'mcp_read_error', detail: err.message, config_path: mcpPath }));
        }
    } else if (requestUrl.pathname === '/api/claude/mcp/tool-info' && req.method === 'GET') {
        // 特定のMCPツールの詳細情報を取得
        const toolUrl = requestUrl.searchParams.get('url');
        if (!toolUrl) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Missing url parameter' }));
            return;
        }
        
        try {
            console.log(`[MCP] Fetching tool info via curl pipeline: ${toolUrl}`);
            const protoVer = '2025-06-18';
            const timeoutSec = Number.parseInt(process.env.MCP_TOOLINFO_TIMEOUT || '12', 10) || 12;

            const escapeSingleQuotes = (value) => String(value).replace(/'/g, `'"'"'`);
            const escapedUrl = escapeSingleQuotes(toolUrl);
            const initPayload = JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    protocolVersion: protoVer,
                    capabilities: {},
                    clientInfo: { name: 'curl', version: '0.1' }
                }
            });
            const listPayload = JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });

            const command = `
TOOL_URL='${escapedUrl}';
SESSION_ID=$(curl -s -i -X POST "$TOOL_URL" \
  -H 'Content-Type: application/json' -H 'Accept: application/json' \
  -d '${escapeSingleQuotes(initPayload)}' \
  | awk 'tolower($1)=="mcp-session-id:"{print $2}' | tr -d "\\r\\n");
if [ -z "$SESSION_ID" ]; then
  echo "Failed to acquire MCP-Session-Id" >&2;
  exit 86;
fi;
curl -s -X POST "$TOOL_URL" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -H 'MCP-Protocol-Version: ${protoVer}' \
  -H 'Content-Type: application/json' -H 'Accept: application/json' \
  -d '${escapeSingleQuotes(listPayload)}' \
| jq -r '.result.tools[] | select(.name | test("submit")) | {name, description, required: (.inputSchema.required // []), properties: (.inputSchema.properties // {})}'
`.trim();

            console.log('[MCP] Executing curl pipeline command');
            exec(command, {
                shell: '/bin/bash',
                timeout: timeoutSec * 1000,
                maxBuffer: 8 * 1024 * 1024
            }, (error, stdout, stderr) => {
                if (error) {
                    console.error('[MCP] curl pipeline failed', {
                        code: error.code,
                        signal: error.signal,
                        message: error.message,
                        stderr: stderr ? stderr.slice(0, 800) : ''
                    });
                    res.writeHead(502);
                    res.end(JSON.stringify({
                        error: 'curl_pipeline_failed',
                        detail: error.message,
                        code: error.code,
                        signal: error.signal,
                        stderr: stderr
                    }));
                    return;
                }

                const trimmedStdout = stdout.trim();
                if (trimmedStdout) {
                    console.log('[MCP] curl pipeline stdout (truncated):', trimmedStdout.slice(0, 400));
                }
                if (stderr) {
                    console.warn('[MCP] curl pipeline stderr (truncated):', stderr.slice(0, 400));
                }

                let submitTool = null;
                const jsonLines = trimmedStdout.split(/\r?\n/).filter(line => line.trim().length > 0);
                for (const line of jsonLines) {
                    try {
                        const parsed = JSON.parse(line);
                        if (parsed && parsed.name) {
                            submitTool = parsed;
                            break;
                        }
                    } catch (parseErr) {
                        console.warn('[MCP] Failed to parse jq output line', line.slice(0, 120));
                    }
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    url: toolUrl,
                    submitTool,
                    raw: trimmedStdout,
                    stderr: stderr || ''
                }));
            });
        } catch (err) {
            console.error('[MCP] Tool info error:', err);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Internal error', detail: err.message }));
        }
    } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
    }
});

function createWebSocketAcceptValue(key) {
    return crypto.createHash('sha1').update(`${key}${WS_GUID}`).digest('base64');
}

function sendWebSocketFrame(socket, opcode, payload) {
    if (!socket || socket.destroyed) return;
    const payloadBuffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload || '');
    const payloadLength = payloadBuffer.length;
    let headerLength = 2;
    if (payloadLength >= 126 && payloadLength < 65536) headerLength += 2;
    else if (payloadLength >= 65536) headerLength += 8;
    const frame = Buffer.alloc(headerLength + payloadLength);
    frame[0] = 0x80 | (opcode & 0x0f);
    if (payloadLength < 126) {
        frame[1] = payloadLength;
        payloadBuffer.copy(frame, 2);
    } else if (payloadLength < 65536) {
        frame[1] = 126;
        frame.writeUInt16BE(payloadLength, 2);
        payloadBuffer.copy(frame, 4);
    } else {
        frame[1] = 127;
        frame.writeBigUInt64BE(BigInt(payloadLength), 2);
        payloadBuffer.copy(frame, 10);
    }
    socket.write(frame);
}

function sendWebSocketJson(context, message) {
    if (!context || !context.alive) return;
    try {
        const payload = Buffer.from(JSON.stringify(message), 'utf8');
        if (payload.length > MAX_WS_MESSAGE_BYTES) {
            console.warn('[WS][PTY] Payload too large, dropping message');
            return;
        }
        sendWebSocketFrame(context.socket, 0x1, payload);
    } catch (err) {
        console.error('[WS][PTY] Failed to send JSON message:', err.message);
        cleanupPtyContext(context, { reason: 'send_error' });
    }
}

function sendWebSocketClose(context, code = 1000, reason = '') {
    if (!context || !context.alive) return;
    try {
        const payload = Buffer.alloc(reason ? 2 + Buffer.byteLength(reason) : 2);
        payload.writeUInt16BE(code, 0);
        if (reason) {
            payload.write(reason, 2);
        }
        sendWebSocketFrame(context.socket, 0x8, payload);
    } catch (err) {
        console.warn('[WS][PTY] Failed to send close frame:', err.message);
    }
}

function decodeMaskedPayload(maskKey, payload) {
    const result = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i += 1) {
        result[i] = payload[i] ^ maskKey[i % 4];
    }
    return result;
}

function cleanupPtyContext(context, options = {}) {
    if (!context || !context.alive) return;
    context.alive = false;
    ptyWebsocketContexts.delete(context);

    if (context.session) {
        const listeners = context.sessionListeners || [];
        listeners.forEach(({ event, handler }) => {
            if (typeof context.session.off === 'function') {
                context.session.off(event, handler);
            } else {
                context.session.removeListener(event, handler);
            }
        });
        if (!context.session.exited) {
            try {
                context.session.dispose();
            } catch (_) {
                // ignore cleanup errors
            }
        }
        context.session = null;
        context.sessionListeners = [];
    }

    if (context.socket && !context.socket.destroyed) {
        try {
            if (options.sendCloseFrame) {
                sendWebSocketClose(context, options.closeCode || 1000, options.closeReason || '');
            }
            context.socket.end();
        } catch (_) {
            // ignore
        }
        try {
            context.socket.destroy();
        } catch (_) {
            // ignore
        }
    }
}

function attachSessionToContext(context, session, commandConfig) {
    context.session = session;
    context.sessionListeners = [];

    function emulateTerminalResponses(buffer) {
        if (!buffer || !buffer.length) return;
        try {
            const text = buffer.toString('binary');
            if (text.includes('\u001b[6n')) {
                session.write(Buffer.from('\u001b[1;1R', 'binary'));
            }
        } catch (err) {
            console.warn('[WS][PTY] emulateTerminalResponses error:', err.message);
        }
    }

    const wrapListener = (event, handler) => {
        session.on(event, handler);
        context.sessionListeners.push({ event, handler });
    };

    wrapListener('ready', (info) => {
        sendWebSocketJson(context, {
            type: 'ready',
            sessionId: session.id,
            pid: info && info.pid ? info.pid : null,
            command: commandConfig.command,
            args: commandConfig.args
        });
    });

    wrapListener('output', (buffer) => {
        if (!Buffer.isBuffer(buffer)) return;
        sendWebSocketJson(context, {
            type: 'output',
            data: buffer.toString('base64')
        });
        emulateTerminalResponses(buffer);
    });

    wrapListener('error', (err) => {
        sendWebSocketJson(context, {
            type: 'error',
            message: err && err.message ? err.message : String(err || 'Unknown session error')
        });
    });

    wrapListener('pong', (ts) => {
        sendWebSocketJson(context, { type: 'pong', ts });
    });

    const handleExit = (info) => {
        sendWebSocketJson(context, {
            type: 'exit',
            exitCode: info && Object.prototype.hasOwnProperty.call(info, 'exitCode') ? info.exitCode : null,
            signal: info && Object.prototype.hasOwnProperty.call(info, 'signal') ? info.signal : null
        });
        cleanupPtyContext(context, { sendCloseFrame: true, closeCode: 1000 });
    };
    session.once('exit', handleExit);
    context.sessionListeners.push({ event: 'exit', handler: handleExit });
}

function handlePtyClientMessage(context, message) {
    if (!context.alive) return;
    if (!message || typeof message !== 'object') {
        sendWebSocketJson(context, { type: 'error', message: 'invalid_message' });
        return;
    }

    const type = message.type;

    if (type === 'start') {
        if (context.session) {
            sendWebSocketJson(context, { type: 'error', message: 'session_already_started' });
            return;
        }
        const commandConfig = resolvePtyCommandConfig(message);
        if (!commandConfig) {
            sendWebSocketJson(context, { type: 'error', message: 'unsupported_command' });
            return;
        }

        const sessionEnv = {};
        if (message.env && typeof message.env === 'object') {
            Object.entries(message.env).forEach(([key, value]) => {
                if (typeof key === 'string' && typeof value === 'string') {
                    sessionEnv[key] = value;
                }
            });
        }

        try {
            const session = createPtySession({
                command: commandConfig.command,
                args: commandConfig.args,
                cwd: PROJECT_ROOT,
                env: Object.keys(sessionEnv).length ? sessionEnv : null
            });
            attachSessionToContext(context, session, commandConfig);
            sendWebSocketJson(context, {
                type: 'starting',
                sessionId: session.id,
                command: commandConfig.command,
                args: commandConfig.args
            });
        } catch (err) {
            console.error('[WS][PTY] Failed to start session:', err.message);
            sendWebSocketJson(context, { type: 'error', message: err.message || 'failed_to_start_session' });
        }
        return;
    }

    if (!context.session) {
        sendWebSocketJson(context, { type: 'error', message: 'session_not_started' });
        return;
    }

    if (type === 'input') {
        let buffer = null;
        if (typeof message.base64 === 'string') {
            try {
                buffer = Buffer.from(message.base64, 'base64');
            } catch (err) {
                sendWebSocketJson(context, { type: 'error', message: 'invalid_base64' });
                return;
            }
        } else if (typeof message.data === 'string') {
            buffer = Buffer.from(message.data, 'utf8');
        }
        
        // 空文字列でも改行を送信する必要がある場合の処理
        if ((!buffer || !buffer.length) && !message.appendNewline) {
            return; // 改行もない空のバッファは無視
        }
        
        if (!buffer) {
            buffer = Buffer.alloc(0); // 空のバッファを作成
        }
        
        if (buffer.length > 16 * 1024) {
            buffer = buffer.slice(0, 16 * 1024);
        }
        
        if (message.appendNewline) {
            buffer = Buffer.concat([buffer, Buffer.from('\r', 'utf8')]);
        }
        
        context.session.write(buffer);
        return;
    }

    if (type === 'resize') {
        const rows = Number.isFinite(message.rows) ? Number(message.rows) : undefined;
        const cols = Number.isFinite(message.cols) ? Number(message.cols) : undefined;
        context.session.resize(rows, cols);
        return;
    }

    if (type === 'terminate') {
        const signalName = typeof message.signal === 'string' ? message.signal : 'SIGTERM';
        context.session.terminate(signalName);
        return;
    }

    if (type === 'ping') {
        sendWebSocketJson(context, { type: 'pong', ts: message.ts || Date.now() });
        return;
    }

    if (type === 'close') {
        cleanupPtyContext(context, { sendCloseFrame: true });
        return;
    }

    sendWebSocketJson(context, { type: 'error', message: `unknown_message:${type}` });
}

function processPtySocketData(context, chunk) {
    if (!context.alive) return;
    context.buffer = Buffer.concat([context.buffer, chunk]);

    while (context.buffer.length >= 2) {
        const firstByte = context.buffer[0];
        const secondByte = context.buffer[1];
        const fin = (firstByte & 0x80) !== 0;
        const opcode = firstByte & 0x0f;
        const masked = (secondByte & 0x80) !== 0;
        let payloadLength = secondByte & 0x7f;
        let offset = 2;

        if (payloadLength === 126) {
            if (context.buffer.length < offset + 2) return;
            payloadLength = context.buffer.readUInt16BE(offset);
            offset += 2;
        } else if (payloadLength === 127) {
            if (context.buffer.length < offset + 8) return;
            payloadLength = Number(context.buffer.readBigUInt64BE(offset));
            offset += 8;
        }

        const totalLength = offset + (masked ? 4 : 0) + payloadLength;
        if (context.buffer.length < totalLength) return;

        const maskKey = masked ? context.buffer.slice(offset, offset + 4) : null;
        offset += masked ? 4 : 0;
        const payload = context.buffer.slice(offset, offset + payloadLength);
        context.buffer = context.buffer.slice(totalLength);

        let data = payload;
        if (masked && maskKey) {
            data = decodeMaskedPayload(maskKey, payload);
        }

        if (!fin) {
            // For simplicity, drop fragmented frames
            console.warn('[WS][PTY] Fragmented frames are not supported; closing connection');
            cleanupPtyContext(context, { sendCloseFrame: true, closeCode: 1002, closeReason: 'fragmented_not_supported' });
            return;
        }

        if (opcode === 0x8) { // Close
            cleanupPtyContext(context, { sendCloseFrame: true, closeCode: 1000 });
            return;
        }

        if (opcode === 0x9) { // Ping
            sendWebSocketFrame(context.socket, 0xA, data);
            continue;
        }

        if (opcode === 0xA) { // Pong
            continue;
        }

        if (opcode === 0x1) { // Text frame
            let text;
            try {
                text = data.toString('utf8');
            } catch (err) {
                console.warn('[WS][PTY] Failed to decode UTF-8 text frame:', err.message);
                continue;
            }
            let parsed;
            try {
                parsed = JSON.parse(text);
            } catch (err) {
                sendWebSocketJson(context, { type: 'error', message: 'invalid_json' });
                continue;
            }
            handlePtyClientMessage(context, parsed);
            continue;
        }

        if (opcode === 0x2) { // Binary frame
            // Interpret as base64 JSON payload
            if (data.length > 0) {
                handlePtyClientMessage(context, { type: 'input', base64: data.toString('base64') });
            }
            continue;
        }

        // Unsupported opcode
        console.warn(`[WS][PTY] Unsupported opcode ${opcode}, closing connection`);
        cleanupPtyContext(context, { sendCloseFrame: true, closeCode: 1003, closeReason: 'unsupported_opcode' });
        return;
    }
}

function handlePtyUpgrade(req, socket, head) {
    const key = req.headers['sec-websocket-key'];
    if (!key) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
    }

    const acceptValue = createWebSocketAcceptValue(key);
    const responseHeaders = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${acceptValue}`
    ];

    if (req.headers['sec-websocket-protocol']) {
        const protocol = req.headers['sec-websocket-protocol'].split(',')[0].trim();
        if (protocol) {
            responseHeaders.push(`Sec-WebSocket-Protocol: ${protocol}`);
        }
    }

    responseHeaders.push('\r\n');
    socket.write(responseHeaders.join('\r\n'));
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 15000);

    const context = {
        socket,
        buffer: head && head.length ? Buffer.from(head) : Buffer.alloc(0),
        alive: true,
        session: null,
        sessionListeners: []
    };
    ptyWebsocketContexts.add(context);

    socket.on('data', (chunk) => processPtySocketData(context, chunk));
    socket.on('close', () => cleanupPtyContext(context));
    socket.on('end', () => cleanupPtyContext(context));
    socket.on('error', () => cleanupPtyContext(context));

    if (context.buffer.length > 0) {
        processPtySocketData(context, Buffer.alloc(0));
    }
}

server.on('upgrade', (req, socket, head) => {
    if (!req || !req.url) {
        socket.destroy();
        return;
    }
    let pathname = null;
    try {
        const fullUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        pathname = fullUrl.pathname;
    } catch (err) {
        socket.destroy();
        return;
    }

    if (pathname === '/ws/pty') {
        handlePtyUpgrade(req, socket, head);
    } else {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
    }
});

let resolvedPort = process.env.PORT;
if (!resolvedPort) {
    resolvedPort = '7777';
    process.env.PORT = resolvedPort;
    console.warn('[Server] PORT env var missing, defaulting to 7777');
}
const PORT = resolvedPort;

process.on('beforeExit', () => {
    try {
        if (tasksPersistDirty) persistTasksImmediate('before_exit');
    } catch (err) {
        console.error('[Tasks] Failed to flush snapshot on exit:', err.message);
    }
});

server.listen(PORT, () => {
    console.log(`Media scanner server running at http://localhost:${PORT}`);
    console.log(`API endpoint: http://localhost:${PORT}/api/scan`);
});

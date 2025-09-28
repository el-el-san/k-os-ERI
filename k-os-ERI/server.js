const express = require('express');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const cors = require('cors');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const yaml = require('js-yaml');
const fse = require('fs-extra');

const app = express();
const PORT = 3001;

// Enable CORS for development
app.use(cors());
// WebXR/AR を許可（Meta Quest など）
app.use((req, res, next) => {
  // xr-spatial-tracking を自身のオリジンで許可
  res.setHeader('Permissions-Policy', 'xr-spatial-tracking=(self)');
  next();
});

// Serve static files from public directory
app.use(express.static('public'));

// Load .env (dotenvなしの軽量実装)
(function loadEnv(){
  try {
    const envPath = path.join(__dirname, '.env');
    if (fsSync.existsSync(envPath)) {
      const content = fsSync.readFileSync(envPath, 'utf8');
      content.split(/\r?\n/).forEach(line => {
        if (!line || /^\s*#/.test(line)) return;
        const idx = line.indexOf('=');
        if (idx === -1) return;
        const k = line.slice(0, idx).trim();
        const v = line.slice(idx+1).trim();
        if (k && !(k in process.env)) process.env[k] = v;
      });
      console.log('Loaded .env into process.env');
    }
  } catch(e){ console.warn('env load skipped:', e.message); }
})();

// Increase JSON body limit to allow large data: URLs
const JSON_LIMIT = process.env.JSON_LIMIT || '25mb';
app.use(express.json({ limit: JSON_LIMIT }));

// Helper: fetch a URL into Buffer
async function fetchBuffer(inputUrl){
  // data URL 対応
  if (/^data:/i.test(inputUrl)) {
    const [, meta, b64] = String(inputUrl).match(/^data:([^;,]+)?;base64,(.+)$/i) || [];
    if (!b64) throw new Error('unsupported data URL');
    return Buffer.from(b64, 'base64');
  }
  const u = new URL(inputUrl);
  const lib = (u.protocol === 'https:') ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request({ method: 'GET', hostname: u.hostname, port: u.port || (u.protocol==='https:'?443:80), path: u.pathname + (u.search||'') }, (res) => {
      if (res.statusCode && res.statusCode >= 400) { reject(new Error('download failed: '+res.statusCode)); return; }
      const chunks = [];
      res.on('data', (c)=>chunks.push(c));
      res.on('end', ()=> resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.end();
  });
}

const DEFAULT_MCP_CONFIG_PATH = process.env.CLAUDE_MCP_CONFIG_PATH || path.join(__dirname, 'mcp', 'config.json');

app.get('/mcp/config.json', (req, res) => {
  try {
    const filePath = process.env.CLAUDE_MCP_CONFIG_PATH || DEFAULT_MCP_CONFIG_PATH;
    if (!filePath || !fsSync.existsSync(filePath)) {
      res.status(404).json({ error: 'mcp_config_not_found', path: filePath });
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    fsSync.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('MCP config serve error:', err.message);
    res.status(500).json({ error: 'mcp_config_error', message: err.message });
  }
});

// Helper: fetch a URL into Buffer
async function fetchBuffer(inputUrl){
  // data URL 対応
  if (/^data:/i.test(inputUrl)) {
    const [, meta, b64] = String(inputUrl).match(/^data:([^;,]+)?;base64,(.+)$/i) || [];
    if (!b64) throw new Error('unsupported data URL');
    return Buffer.from(b64, 'base64');
  }
  const u = new URL(inputUrl);
  const lib = (u.protocol === 'https:') ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request({ method: 'GET', hostname: u.hostname, port: u.port || (u.protocol==='https:'?443:80), path: u.pathname + (u.search||'') }, (res) => {
      if (res.statusCode && res.statusCode >= 400) { reject(new Error('download failed: '+res.statusCode)); return; }
      const chunks = [];
      res.on('data', (c)=>chunks.push(c));
      res.on('end', ()=> resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.end();
  });
}

// Helper: upload to transfer.sh via PUT (returns public URL as text)
async function uploadToTransferSh(filename, buffer){
  return new Promise((resolve, reject) => {
    const options = { method: 'PUT', hostname: 'transfer.sh', path: '/' + encodeURIComponent(filename), headers: { 'Content-Length': buffer.length, 'Content-Type': 'application/octet-stream' } };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (c)=>chunks.push(c));
      res.on('end', ()=>{
        const text = Buffer.concat(chunks).toString('utf8').trim();
        if (!/^https?:\/\//.test(text)) return reject(new Error('invalid response from transfer.sh: '+text));
        resolve(text);
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// Upload to 0x0.st (multipart/form-data)
async function uploadTo0x0(filename, buffer){
  return new Promise((resolve, reject) => {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(16).slice(2);
    const pre = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`);
    const post = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([pre, buffer, post]);
    const options = { method: 'POST', hostname: '0x0.st', path: '/', headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length } };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', c=>chunks.push(c));
      res.on('end', ()=>{
        const text = Buffer.concat(chunks).toString('utf8').trim();
        if (/^https?:\/\//.test(text)) return resolve(text);
        reject(new Error('invalid response from 0x0.st: ' + text));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Upload to file.io (multipart/form-data)
async function uploadToFileIo(filename, buffer){
  return new Promise((resolve, reject) => {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(16).slice(2);
    const pre = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`);
    const post = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([pre, buffer, post]);
    const options = { method: 'POST', hostname: 'file.io', path: '/', headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length } };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', c=>chunks.push(c));
      res.on('end', ()=>{
        try {
          const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          const url = json && (json.link || json.url);
          if (url) return resolve(url);
          reject(new Error('invalid response from file.io'));
        } catch(e){ reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// POST /expose { url: string }
// Downloads the given URL (can be http://localhost:7777/...) and re-uploads to a public host, returning { public_url }
app.post('/expose', async (req, res) => {
  try {
    const src = (req.body && req.body.url) || '';
    if (!src) return res.status(400).json({ error: 'url is required' });
    const u = new URL(src);
    const name = (u.pathname.split('/').pop() || 'image').replace(/[^a-zA-Z0-9._-]/g,'_') || 'image.png';
    const buf = await fetchBuffer(src);
    let publicUrl = null;
    const errors = [];
    try { publicUrl = await uploadTo0x0(name, buf); } catch(e){ errors.push('0x0.st: '+e.message); }
    if (!publicUrl) { try { publicUrl = await uploadToTransferSh(name, buf); } catch(e){ errors.push('transfer.sh: '+e.message); } }
    if (!publicUrl) { try { publicUrl = await uploadToFileIo(name, buf); } catch(e){ errors.push('file.io: '+e.message); } }
    if (!publicUrl) { throw new Error('all uploads failed: ' + errors.join(' | ')); }
    res.json({ public_url: publicUrl });
  } catch (e) {
    console.error('Expose error:', e.message);
    res.status(500).json({ error: 'failed_to_expose', message: e.message });
  }
});

// --- Synthetic MCP tools/list for nano-banana edit endpoint -----------------
// 一部のエンドポイントは JSON-RPC の initialize/call は実装しているが tools/list を未実装。
// クライアントのツール検出互換のため、最小限のツール一覧を合成して返す。
function buildSyntheticToolsResponder(baseName) {
  return function(req, res, next) {
    try {
      if (req.method !== 'POST') return next();
      const ct = (req.headers['content-type'] || '').toLowerCase();
      if (!ct.startsWith('application/json')) return next();
      const body = req.body || {};
      const method = body && body.method;
      if (method !== 'tools/list') return next();

      const id = body && body.id != null ? body.id : null;
      const tools = [
        {
          name: `${baseName}_submit`,
          description: 'Submit an edit job with prompt and input image URLs',
          inputSchema: {
            type: 'object',
            properties: {
              prompt: { type: 'string', description: 'Edit instruction in natural language' },
              image_urls: { type: 'array', items: { type: 'string', format: 'uri' }, minItems: 1 },
              num_images: { type: 'integer', minimum: 1, default: 1 }
            },
            required: ['prompt', 'image_urls']
          }
        },
        {
          name: `${baseName}_status`,
          description: 'Check job status by request_id',
          inputSchema: {
            type: 'object',
            properties: { request_id: { type: 'string' } },
            required: ['request_id']
          }
        },
        {
          name: `${baseName}_result`,
          description: 'Get job result by request_id',
          inputSchema: {
            type: 'object',
            properties: { request_id: { type: 'string' } },
            required: ['request_id']
          }
        }
      ];

      // セッションヘッダは透過維持（あればそのまま返す）
      const sid = req.headers['mcp-session-id'] || req.headers['x-mcp-session-id'];
      if (sid) {
        try { res.setHeader('mcp-session-id', String(sid)); } catch(_) {}
      }
      // CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, x-mcp-session-id');

      const payload = { jsonrpc: '2.0', id, result: { tools } };
      return res.status(200).json(payload);
    } catch (e) {
      console.error('Synthetic tools/list error:', e.message);
      return next();
    }
  };
}

// --- Synthetic MCP tools/list for video generation endpoints -----------------
function buildSyntheticVideoToolsResponder(baseName) {
  return function(req, res, next) {
    try {
      if (req.method !== 'POST') return next();
      const ct = (req.headers['content-type'] || '').toLowerCase();
      if (!ct.startsWith('application/json')) return next();
      const body = req.body || {};
      const method = body && body.method;
      if (method !== 'tools/list') return next();

      const id = body && body.id != null ? body.id : null;
      const tools = [
        {
          name: `${baseName}_submit`,
          description: 'Submit a video generation job with a prompt and an input image URL.',
          inputSchema: {
            type: 'object',
            properties: {
              prompt: { type: 'string', description: 'Animation instruction in natural language' },
              image_url: { type: 'string', format: 'uri', description: 'The source image to animate.' },
              duration_seconds: { type: 'number', description: 'Optional duration of the video in seconds.' }
            },
            required: ['prompt', 'image_url']
          }
        },
        {
          name: `${baseName}_status`,
          description: 'Check job status by request_id',
          inputSchema: {
            type: 'object',
            properties: { request_id: { type: 'string' } },
            required: ['request_id']
          }
        },
        {
          name: `${baseName}_result`,
          description: 'Get job result by request_id',
          inputSchema: {
            type: 'object',
            properties: { request_id: { type: 'string' } },
            required: ['request_id']
          }
        }
      ];

      // セッションヘッダは透過維持（あればそのまま返す）
      const sid = req.headers['mcp-session-id'] || req.headers['x-mcp-session-id'];
      if (sid) {
        try { res.setHeader('mcp-session-id', String(sid)); } catch(_) {}
      }
      // CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, x-mcp-session-id');

      const payload = { jsonrpc: '2.0', id, result: { tools } };
      return res.status(200).json(payload);
    } catch (e) {
      console.error('Synthetic video tools/list error:', e.message);
      return next();
    }
  };
}

const syntheticNanoBananaTools = buildSyntheticToolsResponder('nano_banana_edit');
const syntheticSeedreamTools = buildSyntheticToolsResponder('seedream_edit');
const syntheticVeo3Tools = buildSyntheticVideoToolsResponder('veo3_fast_i2v');
const syntheticHailuoTools = buildSyntheticVideoToolsResponder('hailuo_02');

// Apply to specific endpoints lacking tools/list
app.use('/mcp/i2v/fal/minimax/hailuo-02/pro', syntheticHailuoTools);
app.use('/mcp/i2v/fal/veo3/fast', syntheticVeo3Tools);
app.use('/mcp/i2v/fal/veo3', syntheticVeo3Tools);
app.use('/mcp/i2i/fal/nano-banana/edit', syntheticNanoBananaTools);
app.use('/mcp/i2i/fal/nano-banana', syntheticNanoBananaTools);
app.use('/mcp/t2i/fal/nano-banana', syntheticNanoBananaTools);
// Seedream (ByteDance) v4
app.use('/mcp/i2i/fal/bytedance/seedream/v4', syntheticSeedreamTools);
app.use('/mcp/i2i/fal/bytedance/seedream', syntheticSeedreamTools);
app.use('/mcp/t2i/fal/bytedance/seedream', syntheticSeedreamTools);

// Translate MCP tools/call for Seedream into REST call to upstream /kamui (submit only)
app.post(['/mcp/i2i/fal/bytedance/seedream/v4', '/mcp/i2i/fal/bytedance/seedream'], async (req, res, next) => {
  try {
    const body = req.body || {};
    if (body && body.method === 'tools/call' && body.params && typeof body.params.name === 'string') {
      const name = String(body.params.name || '');
      const args = (body.params && body.params.arguments) || {};
      // エイリアス: seedream_edit_* → 上流の候補ツール名を順に試行
      const isSubmit = /seedream_edit_submit$/i.test(name);
      const isStatus = /seedream_edit_status$/i.test(name);
      const isResult = /seedream_edit_result$/i.test(name);
      if (!(isSubmit || isStatus || isResult)) return next();

      // 上流URLを先に決定（非MCPの実体に対してJSON-RPCを投げる）
      const originalPath = req.originalUrl; // includes /mcp
      const nonMcpPath = originalPath.replace(/^\/mcp/, '');
      const upstreamUrl = new URL(`https://${ALLOWED_MCP_HOST}${nonMcpPath}`); 
      const auth = req.headers['authorization'] || (process.env.MCP_AUTH || undefined);
      const inboundSid = req.headers['mcp-session-id'] || req.headers['x-mcp-session-id'];

      // 上流のtools/listを取得（非MCPパス）。sid は ensureUpstreamSession() で得たものを使用
      async function fetchUpstreamTools(sid){
        const payload = { jsonrpc: '2.0', id: Date.now(), method: 'tools/list', params: {} };
        const textBody = JSON.stringify(payload);
        const options = {
          protocol: upstreamUrl.protocol,
          hostname: upstreamUrl.hostname,
          port: upstreamUrl.port || 443,
          path: upstreamUrl.pathname + upstreamUrl.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'host': upstreamUrl.host,
            ...(auth ? { 'Authorization': auth } : {}),
            ...(sid ? { 'mcp-session-id': sid } : {})
          }
        };
        const txt = await new Promise((resolve, reject) => {
          const up = https.request(options, (upRes) => {
            const chunks = [];
            upRes.on('data', (c)=>chunks.push(c));
            upRes.on('end', ()=> resolve(Buffer.concat(chunks).toString('utf8')));
          });
          up.on('error', reject);
          up.write(textBody);
          up.end();
        });
        try { return JSON.parse(txt); } catch(_) { return null; }
      }

      function pickCandidatesFromList(obj){
        try {
          const arr = (obj && obj.result && Array.isArray(obj.result.tools)) ? obj.result.tools : [];
          const names = arr.map(t => String((t && t.name) || '')).filter(Boolean);
          if (isSubmit) {
            const submitLike = names.filter(n => /(submit|edit|enqueue|queue|run|process)$/i.test(n) && !/(status|result|get)$/i.test(n));
            return submitLike.length ? submitLike : names;
          } else if (isStatus) {
            const stLike = names.filter(n => /(status|poll)$/i.test(n));
            return stLike.length ? stLike : names;
          } else {
            const resLike = names.filter(n => /(result|get)$/i.test(n));
            return resLike.length ? resLike : names;
          }
        } catch(_) { return []; }
      }

      let candidates = [];
      // URLクエリでツール名オーバーライドを受け付ける
      try {
        const sp = new URL('https://dummy' + req.originalUrl).searchParams;
        const oSubmit = sp.get('tool_submit');
        const oStatus = sp.get('tool_status');
        const oResult = sp.get('tool_result');
        if ((isSubmit && oSubmit) || (isStatus && oStatus) || (isResult && oResult)) {
          candidates = [ (isSubmit ? oSubmit : isStatus ? oStatus : oResult) ].filter(Boolean);
        }
      } catch(_){}
      // まず非MCP側で initialize を実行し、セッションIDを取得
      let upstreamSid = null;
      try { upstreamSid = await ensureUpstreamSession(); } catch(e) { console.warn('Seedream bridge: initialize upstream failed:', e.message); }
      if (candidates.length === 0) {
        try {
          const listed = await fetchUpstreamTools(upstreamSid);
          candidates = pickCandidatesFromList(listed);
        } catch(_) { candidates = []; }
      }
      if (!candidates || candidates.length === 0) {
        candidates = isSubmit ? [
          'bytedance_seedream_v4_edit_submit',
          'seedream_submit','seedream_v4_submit','i2i_seedream_submit','seedream_edit','edit','submit'
        ] : isStatus ? [
          'bytedance_seedream_v4_edit_status',
          'seedream_status','get_status','status'
        ] : [
          'bytedance_seedream_v4_edit_result',
          'seedream_result','get_result','result'
        ];
      }
      // 非MCPエンドポイントでセッションを張る（毎回でも数ms程度、安定優先）
      async function ensureUpstreamSession(){
        const payload = { jsonrpc: '2.0', id: Date.now(), method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'kamui-local-proxy', version: '1.0.0' } } };
        const textBody = JSON.stringify(payload);
        const options = {
          protocol: upstreamUrl.protocol,
          hostname: upstreamUrl.hostname,
          port: upstreamUrl.port || 443,
          path: upstreamUrl.pathname + upstreamUrl.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'host': upstreamUrl.host,
            ...(auth ? { 'Authorization': auth } : {}),
            ...(inboundSid ? { 'mcp-session-id': inboundSid } : {})
          }
        };
        const outSid = await new Promise((resolve, reject) => {
          const up = https.request(options, (upRes) => {
            // 上流側で新規/既存SIDが返ることがあるが、ヘッダはそのまま透過でOK
            const sid = upRes.headers['mcp-session-id'] || upRes.headers['x-mcp-session-id'];
            upRes.on('data', ()=>{});
            upRes.on('end', ()=> resolve(Array.isArray(sid) ? sid[0] : sid));
          });
          up.on('error', reject);
          up.write(textBody);
          up.end();
        });
        return outSid || inboundSid || null;
      }

      async function sendUpstream(payload, sid){
        const textBody = JSON.stringify(payload);
        const options = {
          protocol: upstreamUrl.protocol,
          hostname: upstreamUrl.hostname,
          port: upstreamUrl.port || 443,
          path: upstreamUrl.pathname + upstreamUrl.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'host': upstreamUrl.host,
            ...(auth ? { 'Authorization': auth } : {}),
            ...(sid ? { 'mcp-session-id': sid } : {})
          }
        };
        return await new Promise((resolve, reject) => {
          const up = https.request(options, (upRes) => {
            const chunks = [];
            upRes.on('data', (c)=>chunks.push(c));
            upRes.on('end', ()=>{
              resolve({
                text: Buffer.concat(chunks).toString('utf8'),
                headers: upRes.headers || {}
              });
            });
          });
          up.on('error', reject);
          up.write(textBody);
          up.end();
        });
      }

      async function callCandidate(toolName, sid, mode){
        const baseId = body.id || Date.now();
        let payload;
        if (mode === 'direct') {
          payload = { jsonrpc: '2.0', id: baseId, method: toolName, params: args };
        } else if (mode === 'directWrapped') {
          payload = { jsonrpc: '2.0', id: baseId, method: toolName, params: { arguments: args } };
        } else {
          payload = { jsonrpc: '2.0', id: baseId, method: 'tools/call', params: { name: toolName, arguments: args } };
        }
        const { text, headers } = await sendUpstream(payload, sid);
        let obj = null;
        try { obj = JSON.parse(text); } catch(_) {}
        return { text, obj, headers };
      }

      function extractSidFromHeaders(hdrs){
        const sidVal = hdrs && (hdrs['mcp-session-id'] || hdrs['x-mcp-session-id']);
        return Array.isArray(sidVal) ? sidVal[0] : sidVal || null;
      }

      function getErrorMessage(obj){
        return String((obj && obj.error && obj.error.message) || '').toLowerCase();
      }

      function getErrorCode(obj){
        const raw = obj && obj.error ? obj.error.code : undefined;
        if (typeof raw === 'number') return raw;
        const asNum = Number(raw);
        return Number.isFinite(asNum) ? asNum : null;
      }

      let lastText = '';
      let toolsCallUnsupported = false;
      for (const t of candidates){
        try {
          const { text, obj, headers } = await callCandidate(t, upstreamSid, 'tools');
          lastText = text;
          const sidFromHeaders = extractSidFromHeaders(headers);
          if (!upstreamSid && sidFromHeaders) upstreamSid = sidFromHeaders;
          if (obj && !obj.error) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            return res.status(200).json(obj);
          }
          if (obj && obj.error) {
            const msg = getErrorMessage(obj);
            const code = getErrorCode(obj);
            if (msg.includes('tools not supported') || (msg.includes('method') && msg.includes('not found') && !msg.includes('tool not found')) || (!msg && code === -32601)) {
              toolsCallUnsupported = true;
              break;
            }
            if (msg.includes('tool not found')) {
              continue;
            }
            res.setHeader('Access-Control-Allow-Origin', '*');
            return res.status(200).json(obj);
          }
        } catch(e){ lastText = String(e && e.message) || String(e); }
      }

      if (toolsCallUnsupported) {
        const directModes = ['direct', 'directWrapped'];
        for (const t of candidates) {
          let handled = false;
          for (const mode of directModes) {
            try {
              const { text, obj, headers } = await callCandidate(t, upstreamSid, mode);
              lastText = text;
              const sidFromHeaders = extractSidFromHeaders(headers);
              if (!upstreamSid && sidFromHeaders) upstreamSid = sidFromHeaders;
              if (obj && !obj.error) {
                res.setHeader('Access-Control-Allow-Origin', '*');
                return res.status(200).json(obj);
              }
              if (obj && obj.error) {
                const msg = getErrorMessage(obj);
                if (msg.includes('invalid params') && mode === 'direct') {
                  continue;
                }
                if (msg.includes('tool not found') || (msg.includes('method') && msg.includes('not found'))) {
                  if (mode === 'direct') {
                    continue;
                  }
                  handled = true;
                  break;
                }
                res.setHeader('Access-Control-Allow-Origin', '*');
                return res.status(200).json(obj);
              }
            } catch(e){ lastText = String(e && e.message) || String(e); }
          }
          if (handled) continue;
        }
      }

      console.warn('Seedream bridge: all candidates failed. last=', lastText.slice(0,200));
      // 候補が尽きたら通常のプロキシに委譲
    }
  } catch (e) {
    console.error('Seedream tools/call bridge error:', e.message);
  }
  return next();
});

// Translate MCP tools/call for Hailuo-02
app.post(['/mcp/i2v/fal/minimax/hailuo-02/pro'], async (req, res, next) => {
  try {
    const body = req.body || {};
    if (body && body.method === 'tools/call' && body.params && typeof body.params.name === 'string') {
      const name = String(body.params.name || '');
      const args = (body.params && body.params.arguments) || {};

      const isSubmit = /hailuo_02_submit$/i.test(name);
      const isStatus = /hailuo_02_status$/i.test(name);
      const isResult = /hailuo_02_result$/i.test(name);
      if (!(isSubmit || isStatus || isResult)) return next();

      const originalPath = req.originalUrl;
      const nonMcpPath = originalPath.replace(/^\/mcp/, '');
      const upstreamUrl = new URL(`https://${ALLOWED_MCP_HOST}${nonMcpPath}`);
      const auth = req.headers['authorization'] || (process.env.MCP_AUTH || undefined);
      const inboundSid = req.headers['mcp-session-id'] || req.headers['x-mcp-session-id'];

      async function fetchUpstreamTools(sid){
        const payload = { jsonrpc: '2.0', id: Date.now(), method: 'tools/list', params: {} };
        const textBody = JSON.stringify(payload);
        const options = {
          protocol: upstreamUrl.protocol,
          hostname: upstreamUrl.hostname,
          port: upstreamUrl.port || 443,
          path: upstreamUrl.pathname + upstreamUrl.search,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'host': upstreamUrl.host, ...(auth ? { 'Authorization': auth } : {}), ...(sid ? { 'mcp-session-id': sid } : {}) }
        };
        const txt = await new Promise((resolve, reject) => {
          const up = https.request(options, (upRes) => {
            const chunks = [];
            upRes.on('data', (c)=>chunks.push(c));
            upRes.on('end', ()=> resolve(Buffer.concat(chunks).toString('utf8')));
          });
          up.on('error', reject);
          up.write(textBody);
          up.end();
        });
        try { return JSON.parse(txt); } catch(_) { return null; }
      }

      function pickCandidatesFromList(obj){
        try {
          const arr = (obj && obj.result && Array.isArray(obj.result.tools)) ? obj.result.tools : [];
          const names = arr.map(t => String((t && t.name) || '')).filter(Boolean);
          if (isSubmit) {
            const submitLike = names.filter(n => /(submit|edit|enqueue|queue|run|process)$/i.test(n) && !/(status|result|get)$/i.test(n));
            return submitLike.length ? submitLike : names;
          } else if (isStatus) {
            const stLike = names.filter(n => /(status|poll)$/i.test(n));
            return stLike.length ? stLike : names;
          } else {
            const resLike = names.filter(n => /(result|get)$/i.test(n));
            return resLike.length ? resLike : names;
          }
        } catch(_) { return []; }
      }

      let candidates = [];
      let upstreamSid = null;
      try { upstreamSid = await ensureUpstreamSession(); } catch(e) { console.warn('Hailuo-02 bridge: initialize upstream failed:', e.message); }
      if (candidates.length === 0) {
        try {
          const listed = await fetchUpstreamTools(upstreamSid);
          candidates = pickCandidatesFromList(listed);
        } catch(_) { candidates = []; }
      }
      if (!candidates || candidates.length === 0) {
        candidates = isSubmit ? ['hailuo_02_submit','submit'] : isStatus ? ['hailuo_02_status','status'] : ['hailuo_02_result','result'];
      }

      async function ensureUpstreamSession(){
        const payload = { jsonrpc: '2.0', id: Date.now(), method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'kamui-local-proxy', version: '1.0.0' } } };
        const textBody = JSON.stringify(payload);
        const options = {
          protocol: upstreamUrl.protocol,
          hostname: upstreamUrl.hostname,
          port: upstreamUrl.port || 443,
          path: upstreamUrl.pathname + upstreamUrl.search,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'host': upstreamUrl.host, ...(auth ? { 'Authorization': auth } : {}), ...(inboundSid ? { 'mcp-session-id': inboundSid } : {}) }
        };
        const outSid = await new Promise((resolve, reject) => {
          const up = https.request(options, (upRes) => {
            const sid = upRes.headers['mcp-session-id'] || upRes.headers['x-mcp-session-id'];
            upRes.on('data', ()=>{});
            upRes.on('end', ()=> resolve(Array.isArray(sid) ? sid[0] : sid));
          });
          up.on('error', reject);
          up.write(textBody);
          up.end();
        });
        return outSid || inboundSid || null;
      }

      async function sendUpstream(payload, sid){
        const textBody = JSON.stringify(payload);
        const options = {
          protocol: upstreamUrl.protocol,
          hostname: upstreamUrl.hostname,
          port: upstreamUrl.port || 443,
          path: upstreamUrl.pathname + upstreamUrl.search,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'host': upstreamUrl.host, ...(auth ? { 'Authorization': auth } : {}), ...(sid ? { 'mcp-session-id': sid } : {}) }
        };
        return await new Promise((resolve, reject) => {
          const up = https.request(options, (upRes) => {
            const chunks = [];
            upRes.on('data', (c)=>chunks.push(c));
            upRes.on('end', ()=> resolve({ text: Buffer.concat(chunks).toString('utf8'), headers: upRes.headers || {} }));
          });
          up.on('error', reject);
          up.write(textBody);
          up.end();
        });
      }

      async function callCandidate(toolName, sid, mode){
        const baseId = body.id || Date.now();
        let payload;
        if (mode === 'direct') {
          payload = { jsonrpc: '2.0', id: baseId, method: toolName, params: args };
        } else {
          payload = { jsonrpc: '2.0', id: baseId, method: 'tools/call', params: { name: toolName, arguments: args } };
        }
        const { text, headers } = await sendUpstream(payload, sid);
        let obj = null;
        try { obj = JSON.parse(text); } catch(_) {}
        return { text, obj, headers };
      }

      function getErrorMessage(obj){ return String((obj && obj.error && obj.error.message) || '').toLowerCase(); }
      function getErrorCode(obj){ const raw = obj && obj.error ? obj.error.code : undefined; return Number.isFinite(Number(raw)) ? Number(raw) : null; }

      let lastText = '';
      let toolsCallUnsupported = false;
      for (const t of candidates){
        try {
          const { text, obj, headers } = await callCandidate(t, upstreamSid, 'tools');
          lastText = text;
          if (obj && !obj.error) return res.status(200).json(obj);
          if (obj && obj.error) {
            const msg = getErrorMessage(obj);
            const code = getErrorCode(obj);
            if (msg.includes('tools not supported') || (msg.includes('method') && msg.includes('not found') && !msg.includes('tool not found')) || (!msg && code === -32601)) {
              toolsCallUnsupported = true;
              break;
            }
            if (msg.includes('tool not found')) continue;
            return res.status(200).json(obj);
          }
        } catch(e){ lastText = String(e && e.message) || String(e); }
      }

      if (toolsCallUnsupported) {
        for (const t of candidates) {
            try {
              const { text, obj, headers } = await callCandidate(t, upstreamSid, 'direct');
              lastText = text;
              if (obj && !obj.error) return res.status(200).json(obj);
              if (obj && obj.error) {
                const msg = getErrorMessage(obj);
                if (msg.includes('tool not found') || (msg.includes('method') && msg.includes('not found'))) continue;
                return res.status(200).json(obj);
              }
            } catch(e){ lastText = String(e && e.message) || String(e); }
        }
      }

      console.warn('Hailuo-02 bridge: all candidates failed. last=', lastText.slice(0,200));
    }
  } catch (e) {
    console.error('Hailuo-02 tools/call bridge error:', e.message);
  }
  return next();
});

// Translate MCP tools/call for Veo3 into REST call to upstream /kamui (submit only)
app.post(['/mcp/i2v/fal/veo3/fast', '/mcp/i2v/fal/veo3'], async (req, res, next) => {
  try {
    const body = req.body || {};
    if (body && body.method === 'tools/call' && body.params && typeof body.params.name === 'string') {
      const name = String(body.params.name || '');
      const args = (body.params && body.params.arguments) || {};
      // エイリアス: veo3_fast_i2v_* → 上流の候補ツール名を順に試行
      const isSubmit = /veo3_fast_i2v_submit$/i.test(name);
      const isStatus = /veo3_fast_i2v_status$/i.test(name);
      const isResult = /veo3_fast_i2v_result$/i.test(name);
      if (!(isSubmit || isStatus || isResult)) return next();

      // 上流URLを先に決定（非MCPの実体に対してJSON-RPCを投げる）
      const originalPath = req.originalUrl; // includes /mcp
      const nonMcpPath = originalPath.replace(/^\/mcp/, '');
      const upstreamUrl = new URL(`https://${ALLOWED_MCP_HOST}${nonMcpPath}`); 
      const auth = req.headers['authorization'] || (process.env.MCP_AUTH || undefined);
      const inboundSid = req.headers['mcp-session-id'] || req.headers['x-mcp-session-id'];

      // 上流のtools/listを取得（非MCPパス）。sid は ensureUpstreamSession() で得たものを使用
      async function fetchUpstreamTools(sid){
        const payload = { jsonrpc: '2.0', id: Date.now(), method: 'tools/list', params: {} };
        const textBody = JSON.stringify(payload);
        const options = {
          protocol: upstreamUrl.protocol,
          hostname: upstreamUrl.hostname,
          port: upstreamUrl.port || 443,
          path: upstreamUrl.pathname + upstreamUrl.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'host': upstreamUrl.host,
            ...(auth ? { 'Authorization': auth } : {}),
            ...(sid ? { 'mcp-session-id': sid } : {})
          }
        };
        const txt = await new Promise((resolve, reject) => {
          const up = https.request(options, (upRes) => {
            const chunks = [];
            upRes.on('data', (c)=>chunks.push(c));
            upRes.on('end', ()=> resolve(Buffer.concat(chunks).toString('utf8')));
          });
          up.on('error', reject);
          up.write(textBody);
          up.end();
        });
        try { return JSON.parse(txt); } catch(_) { return null; }
      }

      function pickCandidatesFromList(obj){
        try {
          const arr = (obj && obj.result && Array.isArray(obj.result.tools)) ? obj.result.tools : [];
          const names = arr.map(t => String((t && t.name) || '')).filter(Boolean);
          if (isSubmit) {
            const submitLike = names.filter(n => /(submit|edit|enqueue|queue|run|process)$/i.test(n) && !/(status|result|get)$/i.test(n));
            return submitLike.length ? submitLike : names;
          } else if (isStatus) {
            const stLike = names.filter(n => /(status|poll)$/i.test(n));
            return stLike.length ? stLike : names;
          } else {
            const resLike = names.filter(n => /(result|get)$/i.test(n));
            return resLike.length ? resLike : names;
          }
        } catch(_) { return []; }
      }

      let candidates = [];
      // URLクエリでツール名オーバーライドを受け付ける
      try {
        const sp = new URL('https://dummy' + req.originalUrl).searchParams;
        const oSubmit = sp.get('tool_submit');
        const oStatus = sp.get('tool_status');
        const oResult = sp.get('tool_result');
        if ((isSubmit && oSubmit) || (isStatus && oStatus) || (isResult && oResult)) {
          candidates = [ (isSubmit ? oSubmit : isStatus ? oStatus : oResult) ].filter(Boolean);
        }
      } catch(_){}
      // まず非MCP側で initialize を実行し、セッションIDを取得
      let upstreamSid = null;
      try { upstreamSid = await ensureUpstreamSession(); } catch(e) { console.warn('Veo3 bridge: initialize upstream failed:', e.message); }
      if (candidates.length === 0) {
        try {
          const listed = await fetchUpstreamTools(upstreamSid);
          candidates = pickCandidatesFromList(listed);
        } catch(_) { candidates = []; }
      }
      if (!candidates || candidates.length === 0) {
        candidates = isSubmit ? [
          'veo3_fast_i2v_submit','veo3_submit','submit'
        ] : isStatus ? [
          'veo3_fast_i2v_status','veo3_status','get_status','status'
        ] : [
          'veo3_fast_i2v_result','veo3_result','get_result','result'
        ];
      }
      // 非MCPエンドポイントでセッションを張る（毎回でも数ms程度、安定優先）
      async function ensureUpstreamSession(){
        const payload = { jsonrpc: '2.0', id: Date.now(), method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'kamui-local-proxy', version: '1.0.0' } } };
        const textBody = JSON.stringify(payload);
        const options = {
          protocol: upstreamUrl.protocol,
          hostname: upstreamUrl.hostname,
          port: upstreamUrl.port || 443,
          path: upstreamUrl.pathname + upstreamUrl.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'host': upstreamUrl.host,
            ...(auth ? { 'Authorization': auth } : {}),
            ...(inboundSid ? { 'mcp-session-id': inboundSid } : {})
          }
        };
        const outSid = await new Promise((resolve, reject) => {
          const up = https.request(options, (upRes) => {
            // 上流側で新規/既存SIDが返ることがあるが、ヘッダはそのまま透過でOK
            const sid = upRes.headers['mcp-session-id'] || upRes.headers['x-mcp-session-id'];
            upRes.on('data', ()=>{});
            upRes.on('end', ()=> resolve(Array.isArray(sid) ? sid[0] : sid));
          });
          up.on('error', reject);
          up.write(textBody);
          up.end();
        });
        return outSid || inboundSid || null;
      }

      async function sendUpstream(payload, sid){
        const textBody = JSON.stringify(payload);
        const options = {
          protocol: upstreamUrl.protocol,
          hostname: upstreamUrl.hostname,
          port: upstreamUrl.port || 443,
          path: upstreamUrl.pathname + upstreamUrl.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'host': upstreamUrl.host,
            ...(auth ? { 'Authorization': auth } : {}),
            ...(sid ? { 'mcp-session-id': sid } : {})
          }
        };
        return await new Promise((resolve, reject) => {
          const up = https.request(options, (upRes) => {
            const chunks = [];
            upRes.on('data', (c)=>chunks.push(c));
            upRes.on('end', ()=>{
              resolve({
                text: Buffer.concat(chunks).toString('utf8'),
                headers: upRes.headers || {}
              });
            });
          });
          up.on('error', reject);
          up.write(textBody);
          up.end();
        });
      }

      async function callCandidate(toolName, sid, mode){
        const baseId = body.id || Date.now();
        let payload;
        if (mode === 'direct') {
          payload = { jsonrpc: '2.0', id: baseId, method: toolName, params: args };
        } else if (mode === 'directWrapped') {
          payload = { jsonrpc: '2.0', id: baseId, method: toolName, params: { arguments: args } };
        } else {
          payload = { jsonrpc: '2.0', id: baseId, method: 'tools/call', params: { name: toolName, arguments: args } };
        }
        const { text, headers } = await sendUpstream(payload, sid);
        let obj = null;
        try { obj = JSON.parse(text); } catch(_) {}
        return { text, obj, headers };
      }

      function extractSidFromHeaders(hdrs){
        const sidVal = hdrs && (hdrs['mcp-session-id'] || hdrs['x-mcp-session-id']);
        return Array.isArray(sidVal) ? sidVal[0] : sidVal || null;
      }

      function getErrorMessage(obj){
        return String((obj && obj.error && obj.error.message) || '').toLowerCase();
      }

      function getErrorCode(obj){
        const raw = obj && obj.error ? obj.error.code : undefined;
        if (typeof raw === 'number') return raw;
        const asNum = Number(raw);
        return Number.isFinite(asNum) ? asNum : null;
      }

      let lastText = '';
      let toolsCallUnsupported = false;
      for (const t of candidates){
        try {
          const { text, obj, headers } = await callCandidate(t, upstreamSid, 'tools');
          lastText = text;
          const sidFromHeaders = extractSidFromHeaders(headers);
          if (!upstreamSid && sidFromHeaders) upstreamSid = sidFromHeaders;
          if (obj && !obj.error) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            return res.status(200).json(obj);
          }
          if (obj && obj.error) {
            const msg = getErrorMessage(obj);
            const code = getErrorCode(obj);
            if (msg.includes('tools not supported') || (msg.includes('method') && msg.includes('not found') && !msg.includes('tool not found')) || (!msg && code === -32601)) {
              toolsCallUnsupported = true;
              break;
            }
            if (msg.includes('tool not found')) {
              continue;
            }
            res.setHeader('Access-Control-Allow-Origin', '*');
            return res.status(200).json(obj);
          }
        } catch(e){ lastText = String(e && e.message) || String(e); }
      }

      if (toolsCallUnsupported) {
        const directModes = ['direct', 'directWrapped'];
        for (const t of candidates) {
          let handled = false;
          for (const mode of directModes) {
            try {
              const { text, obj, headers } = await callCandidate(t, upstreamSid, mode);
              lastText = text;
              const sidFromHeaders = extractSidFromHeaders(headers);
              if (!upstreamSid && sidFromHeaders) upstreamSid = sidFromHeaders;
              if (obj && !obj.error) {
                res.setHeader('Access-Control-Allow-Origin', '*');
                return res.status(200).json(obj);
              }
              if (obj && obj.error) {
                const msg = getErrorMessage(obj);
                if (msg.includes('invalid params') && mode === 'direct') {
                  continue;
                }
                if (msg.includes('tool not found') || (msg.includes('method') && msg.includes('not found'))) {
                  if (mode === 'direct') {
                    continue;
                  }
                  handled = true;
                  break;
                }
                res.setHeader('Access-Control-Allow-Origin', '*');
                return res.status(200).json(obj);
              }
            } catch(e){ lastText = String(e && e.message) || String(e); }
          }
          if (handled) continue;
        }
      }

      console.warn('Veo3 bridge: all candidates failed. last=', lastText.slice(0,200));
      // 候補が尽きたら通常のプロキシに委譲
    }
  } catch (e) {
    console.error('Veo3 tools/call bridge error:', e.message);
  }
  return next();
});

// Translate MCP tools/call for Nano Banana edit into non-MCP upstream (submit/status/result)
app.post(['/mcp/i2i/fal/nano-banana/edit', '/mcp/i2i/fal/nano-banana'], async (req, res, next) => {
  try {
    const body = req.body || {};
    if (body && body.method === 'tools/call' && body.params && typeof body.params.name === 'string') {
      const name = String(body.params.name || '');
      const args = (body.params && body.params.arguments) || {};
      const isSubmit = /nano_banana_edit_submit$/i.test(name);
      const isStatus = /nano_banana_edit_status$/i.test(name);
      const isResult = /nano_banana_edit_result$/i.test(name);
      if (!(isSubmit || isStatus || isResult)) return next();

      const originalPath = req.originalUrl; // includes /mcp
      const nonMcpPath = originalPath.replace(/^\/mcp/, '');
      const upstreamUrl = new URL(`https://${ALLOWED_MCP_HOST}${nonMcpPath}`);
      const auth = req.headers['authorization'] || (process.env.MCP_AUTH || undefined);
      const inboundSid = req.headers['mcp-session-id'] || req.headers['x-mcp-session-id'];

      async function ensureUpstreamSession(){
        const payload = { jsonrpc: '2.0', id: Date.now(), method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'kamui-local-proxy', version: '1.0.0' } } };
        const textBody = JSON.stringify(payload);
        const options = {
          protocol: upstreamUrl.protocol,
          hostname: upstreamUrl.hostname,
          port: upstreamUrl.port || 443,
          path: upstreamUrl.pathname + upstreamUrl.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'host': upstreamUrl.host,
            ...(auth ? { 'Authorization': auth } : {}),
            ...(inboundSid ? { 'mcp-session-id': inboundSid } : {})
          }
        };
        return await new Promise((resolve, reject) => {
          const up = https.request(options, (upRes) => {
            const sid = upRes.headers['mcp-session-id'] || upRes.headers['x-mcp-session-id'];
            upRes.on('data', ()=>{});
            upRes.on('end', ()=> resolve(Array.isArray(sid) ? sid[0] : sid));
          });
          up.on('error', reject);
          up.write(textBody);
          up.end();
        });
      }

      async function fetchUpstreamTools(sid){
        const payload = { jsonrpc: '2.0', id: Date.now(), method: 'tools/list', params: {} };
        const textBody = JSON.stringify(payload);
        const options = {
          protocol: upstreamUrl.protocol,
          hostname: upstreamUrl.hostname,
          port: upstreamUrl.port || 443,
          path: upstreamUrl.pathname + upstreamUrl.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'host': upstreamUrl.host,
            ...(auth ? { 'Authorization': auth } : {}),
            ...(sid ? { 'mcp-session-id': sid } : {})
          }
        };
        const txt = await new Promise((resolve, reject) => {
          const up = https.request(options, (upRes) => {
            const chunks = [];
            upRes.on('data', (c)=>chunks.push(c));
            upRes.on('end', ()=> resolve(Buffer.concat(chunks).toString('utf8')));
          });
          up.on('error', reject);
          up.write(textBody);
          up.end();
        });
        try { return JSON.parse(txt); } catch(_) { return null; }
      }

      function pickCandidatesFromList(obj){
        try {
          const arr = (obj && obj.result && Array.isArray(obj.result.tools)) ? obj.result.tools : [];
          const names = arr.map(t => String((t && t.name) || '')).filter(Boolean);
          if (isSubmit) {
            const submitLike = names.filter(n => /(submit|edit|enqueue|queue|run|process)$/i.test(n) && !/(status|result|get)$/i.test(n));
            return submitLike.length ? submitLike : names;
          } else if (isStatus) {
            const stLike = names.filter(n => /(status|poll)$/i.test(n));
            return stLike.length ? stLike : names;
          } else {
            const resLike = names.filter(n => /(result|get)$/i.test(n));
            return resLike.length ? resLike : names;
          }
        } catch(_) { return []; }
      }

      // session -> tools/list -> candidates
      let upstreamSid = null;
      try { upstreamSid = await ensureUpstreamSession(); } catch(e) { console.warn('Nano bridge: initialize upstream failed:', e.message); }
      let candidates = [];
      try { const listed = await fetchUpstreamTools(upstreamSid); candidates = pickCandidatesFromList(listed); } catch(_) { candidates = []; }
      if (!candidates || candidates.length === 0) {
        candidates = isSubmit ? [
          'nano_banana_edit_submit','edit_submit','submit','run','process'
        ] : isStatus ? [
          'nano_banana_edit_status','status','get_status','poll'
        ] : [
          'nano_banana_edit_result','result','get_result','get'
        ];
      }

      async function sendUpstream(payload, sid){
        const textBody = JSON.stringify(payload);
        const options = {
          protocol: upstreamUrl.protocol,
          hostname: upstreamUrl.hostname,
          port: upstreamUrl.port || 443,
          path: upstreamUrl.pathname + upstreamUrl.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'host': upstreamUrl.host,
            ...(auth ? { 'Authorization': auth } : {}),
            ...(sid ? { 'mcp-session-id': sid } : {})
          }
        };
        return await new Promise((resolve, reject) => {
          const up = https.request(options, (upRes) => {
            const chunks = [];
            upRes.on('data', (c)=>chunks.push(c));
            upRes.on('end', ()=>{
              resolve({
                text: Buffer.concat(chunks).toString('utf8'),
                headers: upRes.headers || {}
              });
            });
          });
          up.on('error', reject);
          up.write(textBody);
          up.end();
        });
      }

      async function callCandidate(toolName, sid, mode){
        const baseId = body.id || Date.now();
        let payload;
        if (mode === 'direct') {
          payload = { jsonrpc: '2.0', id: baseId, method: toolName, params: args };
        } else if (mode === 'directWrapped') {
          payload = { jsonrpc: '2.0', id: baseId, method: toolName, params: { arguments: args } };
        } else {
          payload = { jsonrpc: '2.0', id: baseId, method: 'tools/call', params: { name: toolName, arguments: args } };
        }
        const { text, headers } = await sendUpstream(payload, sid);
        let obj = null;
        try { obj = JSON.parse(text); } catch(_) {}
        return { text, obj, headers };
      }

      function extractSidFromHeaders(hdrs){
        const sidVal = hdrs && (hdrs['mcp-session-id'] || hdrs['x-mcp-session-id']);
        return Array.isArray(sidVal) ? sidVal[0] : sidVal || null;
      }

      function getErrorMessage(obj){
        return String((obj && obj.error && obj.error.message) || '').toLowerCase();
      }

      function getErrorCode(obj){
        const raw = obj && obj.error ? obj.error.code : undefined;
        if (typeof raw === 'number') return raw;
        const asNum = Number(raw);
        return Number.isFinite(asNum) ? asNum : null;
      }

      let lastText = '';
      let toolsCallUnsupported = false;
      for (const t of candidates){
        try {
          const { text, obj, headers } = await callCandidate(t, upstreamSid, 'tools');
          lastText = text;
          const sidFromHeaders = extractSidFromHeaders(headers);
          if (!upstreamSid && sidFromHeaders) upstreamSid = sidFromHeaders;
          if (obj && !obj.error) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            return res.status(200).json(obj);
          }
          if (obj && obj.error) {
            const msg = getErrorMessage(obj);
            const code = getErrorCode(obj);
            if (msg.includes('tools not supported') || (msg.includes('method') && msg.includes('not found') && !msg.includes('tool not found')) || (!msg && code === -32601)) {
              toolsCallUnsupported = true;
              break;
            }
            if (msg.includes('tool not found')) {
              continue;
            }
            res.setHeader('Access-Control-Allow-Origin', '*');
            return res.status(200).json(obj);
          }
        } catch(e){ lastText = String(e && e.message) || String(e); }
      }

      if (toolsCallUnsupported) {
        const directModes = ['direct', 'directWrapped'];
        for (const t of candidates) {
          let handled = false;
          for (const mode of directModes) {
            try {
              const { text, obj, headers } = await callCandidate(t, upstreamSid, mode);
              lastText = text;
              const sidFromHeaders = extractSidFromHeaders(headers);
              if (!upstreamSid && sidFromHeaders) upstreamSid = sidFromHeaders;
              if (obj && !obj.error) {
                res.setHeader('Access-Control-Allow-Origin', '*');
                return res.status(200).json(obj);
              }
              if (obj && obj.error) {
                const msg = getErrorMessage(obj);
                if (msg.includes('invalid params') && mode === 'direct') {
                  continue;
                }
                if (msg.includes('tool not found') || (msg.includes('method') && msg.includes('not found'))) {
                  if (mode === 'direct') {
                    continue;
                  }
                  handled = true;
                  break;
                }
                res.setHeader('Access-Control-Allow-Origin', '*');
                return res.status(200).json(obj);
              }
            } catch(e){ lastText = String(e && e.message) || String(e); }
          }
          if (handled) continue;
        }
      }

      console.warn('Nano Banana bridge: all candidates failed. last=', String(lastText).slice(0,200));
      // fallthrough to generic proxy
    }
  } catch (e) {
    console.error('Nano Banana tools/call bridge error:', e.message);
  }
  return next();
});

// Helper: generic multipart/form-data upload with Bearer token
function sniffMimeFromBuffer(name, buf){
  const n = (name||'').toLowerCase();
  const h = buf.slice(0, 16);
  const hex = h.toString('hex');
  if (hex.startsWith('89504e470d0a1a0a')) return 'image/png'; // PNG
  if (h[0] === 0xff && h[1] === 0xd8) return 'image/jpeg'; // JPEG
  if (h.slice(0, 4).toString('ascii') === 'GIF8') return 'image/gif'; // GIF
  if (h.slice(0, 4).toString('ascii') === 'RIFF' && h.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp'; // WEBP
  if (/\.png$/i.test(n)) return 'image/png';
  if (/\.(jpe?g)$/i.test(n)) return 'image/jpeg';
  if (/\.gif$/i.test(n)) return 'image/gif';
  if (/\.webp$/i.test(n)) return 'image/webp';
  if (/\.mp4$/i.test(n)) return 'video/mp4';
  if (/\.webm$/i.test(n)) return 'video/webm';
  if (/\.mov$/i.test(n)) return 'video/quicktime';
  if (/\.mp3$/i.test(n)) return 'audio/mpeg';
  if (/\.wav$/i.test(n)) return 'audio/wav';
  return 'application/octet-stream';
}

async function uploadWithBearer(endpointUrl, apiKey, fieldName, filename, buffer){
  const u = new URL(endpointUrl);
  const boundary = '----FormBoundary' + Math.random().toString(16).slice(2);
  const contentType = sniffMimeFromBuffer(filename, buffer);
  const pre = Buffer.from(`--${boundary}\r\n`+
    `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n`+
    `Content-Type: ${contentType}\r\n\r\n`);
  const post = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([pre, buffer, post]);
  const isHttps = u.protocol === 'https:';
  const options = {
    method: 'POST',
    hostname: u.hostname,
    port: u.port || (isHttps ? 443 : 80),
    path: u.pathname + (u.search||''),
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length
    }
  };
  return new Promise((resolve, reject) => {
    const req = (isHttps ? https : http).request(options, (resp) => {
      const chunks = [];
      resp.on('data', (c)=>chunks.push(c));
      resp.on('end', ()=>{
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: resp.statusCode||0, headers: resp.headers||{}, text });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function extractUrlFromUploadResponse(payload){
  // Try JSON first
  try {
    const obj = JSON.parse(payload);
    const candidates = [
      obj && obj.url,
      obj && obj.uploaded_url,
      obj && obj.data && obj.data.url,
      obj && obj.result && obj.result.url,
      obj && obj.file && obj.file.url,
      obj && Array.isArray(obj.files) && obj.files[0] && obj.files[0].url
    ].filter(Boolean);
    if (candidates.length) return String(candidates[0]);
  } catch(_) {}
  // Fallback: plain text that looks like URL
  const m = String(payload).match(/https?:\/\/\S+/);
  return m ? m[0] : null;
}

// POST /upload { url: string }
// Downloads the before image and uploads to external uploader using .env (UPLOAD_URL, UPLOAD_API_KEY).
app.post('/upload', async (req, res) => {
  try {
    const src = (req.body && req.body.url) || '';
    if (!src) return res.status(400).json({ error: 'url is required' });
    const UPLOAD_URL = process.env.UPLOAD_URL || '';
    const UPLOAD_API_KEY = process.env.UPLOAD_API_KEY || process.env.API_KEY || '';
    const UPLOAD_FIELD_NAME = process.env.UPLOAD_FIELD_NAME || 'media';
    if (!UPLOAD_URL || !UPLOAD_API_KEY) {
      return res.status(500).json({ error: 'upload_not_configured', message: 'UPLOAD_URL / UPLOAD_API_KEY not set' });
    }
    // 安全なファイル名を決定（data: URIは巨大なパスになるため特別扱い）
    let name = 'image.png';
    if (/^data:/i.test(src)) {
      try {
        const m = src.match(/^data:([^;,]+)/i);
        const mime = (m && m[1]) || '';
        const ext = mime.includes('png') ? 'png'
                  : mime.includes('jpeg') || mime.includes('jpg') ? 'jpg'
                  : mime.includes('webp') ? 'webp'
                  : mime.includes('gif') ? 'gif'
                  : 'bin';
        name = `image_${Date.now()}.${ext}`;
      } catch(_) { name = `image_${Date.now()}.bin`; }
    } else {
      const u = new URL(src);
      name = (u.pathname.split('/').pop() || 'image.png').replace(/[^a-zA-Z0-9._-]/g,'_');
    }
    const buf = await fetchBuffer(src);
    // Try primary field name
    let raw = await uploadWithBearer(UPLOAD_URL, UPLOAD_API_KEY, UPLOAD_FIELD_NAME, name, buf);
    let uploadedUrl = (raw.status < 400) ? extractUrlFromUploadResponse(raw.text) : null;
    // Fallback to conventional field name 'file' if first attempt failed
    if ((!uploadedUrl) || raw.status >= 400) {
      const fallback = await uploadWithBearer(UPLOAD_URL, UPLOAD_API_KEY, 'file', name, buf);
      if (fallback.status < 400) {
        const u2 = extractUrlFromUploadResponse(fallback.text);
        if (u2) {
          uploadedUrl = u2;
          raw = fallback;
        }
      }
    }
    if (raw.status >= 400) {
      return res.status(502).json({ error: 'uploader_error', status: raw.status, body: raw.text });
    }
    if (!uploadedUrl) {
      return res.status(502).json({ error: 'no_url_in_response', body: raw.text });
    }
    res.json({ uploaded_url: uploadedUrl });
  } catch (e) {
    console.error('Upload error:', e.message);
    res.status(500).json({ error: 'upload_failed', message: e.message });
  }
});

// Backend proxy (to local media-scanner on 7777) => single ngrok tunnelでOK
const BACKEND_TARGET = process.env.BACKEND_TARGET || 'http://localhost:7777';
const backendURL = new URL(BACKEND_TARGET);
app.use('/backend', (req, res) => {
  const targetPath = req.originalUrl.replace(/^\/backend/, '') || '/';
  const requestOptions = {
    protocol: backendURL.protocol,
    hostname: backendURL.hostname,
    port: backendURL.port || (backendURL.protocol === 'https:' ? 443 : 80),
    path: targetPath,
    method: req.method,
    headers: {
      ...req.headers,
      host: backendURL.host
    }
  };
  const proxy = (backendURL.protocol === 'https:' ? https : http).request(requestOptions, (proxyRes) => {
    res.status(proxyRes.statusCode || 502);
    // 転送ヘッダ（content-length は除外）
    Object.entries(proxyRes.headers || {}).forEach(([k, v]) => {
      if (k.toLowerCase() === 'content-length') return;
      res.setHeader(k, v);
    });
    proxyRes.pipe(res);
  });
  proxy.on('error', (err) => {
    console.error('Proxy error:', err.message);
    res.status(502).send('Bad Gateway');
  });
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    req.pipe(proxy);
  } else {
    proxy.end();
  }
});

// Limited MCP proxy to avoid CORS for development
const ALLOWED_MCP_HOST = process.env.KAMUI_CODE_URL;
app.use('/mcp', (req, res) => {
  try {
    console.log(`[MCP] ${req.method} ${req.originalUrl}`);
    // IMPORTANT: Keep the /mcp prefix when proxying upstream.
    // Map /mcp/<path> -> https://<ALLOWED_MCP_HOST>/mcp/<path>
    // 例: /mcp -> https://<ALLOWED_MCP_HOST>/mcp
    //     /mcp/tools/call -> https://<ALLOWED_MCP_HOST>/mcp/tools/call
    const upstreamPath = req.originalUrl; // keep as-is (includes /mcp)
    const upstreamUrl = new URL(`https://${ALLOWED_MCP_HOST}${upstreamPath}`);
    // Clone incoming headers and sanitize values
  const headers = { ...req.headers };
    // Remove hop-by-hop and sensitive client-origin headers
    delete headers['origin'];
    delete headers['referer'];
    delete headers['host'];
    delete headers['connection'];
    delete headers['content-length'];
    // Set upstream host header
    headers['host'] = upstreamUrl.host;

    const requestOptions = {
      protocol: upstreamUrl.protocol,
      hostname: upstreamUrl.hostname,
      port: upstreamUrl.port || 443,
      path: upstreamUrl.pathname + upstreamUrl.search,
      method: req.method,
      headers
    };
    // Dev auth injection
    if (!headers['authorization'] && process.env.MCP_AUTH) {
      requestOptions.headers['Authorization'] = process.env.MCP_AUTH;
    }
    const proxy = https.request(requestOptions, (proxyRes) => {
      console.log(`[MCP] -> ${upstreamUrl} [${proxyRes.statusCode}]`);
      res.status(proxyRes.statusCode || 502);
      Object.entries(proxyRes.headers || {}).forEach(([k, v]) => {
        if (k.toLowerCase() === 'content-length') return;
        res.setHeader(k, v);
      });
      // CORS for browser dev
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-session-id');
      res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, x-mcp-session-id, mcp-session, x-session-id');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      proxyRes.pipe(res);
    });
    proxy.on('error', (err) => {
      console.error('MCP proxy error:', err.message);
      if (!res.headersSent) res.status(502);
      res.end('Bad Gateway');
    });
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-session-id');
      res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, x-mcp-session-id, mcp-session, x-session-id');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      return res.status(204).end();
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      // If body was parsed by express.json(), reserialize it; otherwise pipe raw
      const ct = (req.headers['content-type'] || '').toLowerCase();
      if (ct.startsWith('application/json') && typeof req.body === 'object' && req.body !== null) {
        const bodyText = JSON.stringify(req.body);
        const byteLen = Buffer.byteLength(bodyText);
        try { proxy.setHeader && proxy.setHeader('Content-Length', String(byteLen)); } catch(_) {}
        try { proxy.write(bodyText); } catch(e) { console.error('MCP proxy write error:', e.message); }
        proxy.end();
      } else {
        req.pipe(proxy);
      }
    } else {
      proxy.end();
    }
  } catch (e) {
    console.error('MCP proxy setup error:', e.stack || e.message);
    if (!res.headersSent) res.status(500);
    res.end('Proxy error');
  }
});

// MCP fallback proxy for clients that omit the "/mcp" prefix in BASE_URL.
// Example: POST http://localhost:3001/t2i/fal/imagen4/ultra (tools/list)
//          -> https://<ALLOWED_MCP_HOST>/mcp/t2i/fal/imagen4/ultra
const MCP_PATH_PREFIXES = [
  '/t2i', '/i2i', '/i2v', '/v2v', '/r2v',
  '/t2s', '/t2m', '/v2a', '/train', '/uploader',
  '/video-analysis', '/requirement', '/storyboard'
];

app.use((req, res, next) => {
  try {
    // マッチしない場合は次へ
    const matched = MCP_PATH_PREFIXES.some((p) => req.path === p || req.path.startsWith(p + '/'));
    if (!matched) return next();

    console.log(`[MCP Fallback] ${req.method} ${req.originalUrl}`);
    const upstreamUrl = new URL(`https://${ALLOWED_MCP_HOST}/mcp${req.originalUrl}`);

    const headers = { ...req.headers };
    delete headers['origin'];
    delete headers['referer'];
    delete headers['host'];
    delete headers['connection'];
    delete headers['content-length'];
    headers['host'] = upstreamUrl.host;

    const options = {
      protocol: upstreamUrl.protocol,
      hostname: upstreamUrl.hostname,
      port: upstreamUrl.port || 443,
      path: upstreamUrl.pathname + upstreamUrl.search,
      method: req.method,
      headers
    };

    const proxy = https.request(options, (up) => {
      res.status(up.statusCode || 502);
      Object.entries(up.headers || {}).forEach(([k, v]) => {
        if (k.toLowerCase() === 'content-length') return;
        res.setHeader(k, v);
      });
      // Enable CORS for dev tools
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-session-id');
      res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, x-mcp-session-id, x-request-id');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      up.pipe(res);
    });
    proxy.on('error', (err) => {
      console.error('MCP fallback proxy error:', err.message);
      if (!res.headersSent) res.status(502);
      res.end('Bad Gateway');
    });

    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-session-id');
      res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, x-mcp-session-id, x-request-id');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      return res.status(204).end();
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const ct = (req.headers['content-type'] || '').toLowerCase();
      if (ct.startsWith('application/json') && typeof req.body === 'object' && req.body !== null) {
        const bodyText = JSON.stringify(req.body);
        try { proxy.setHeader && proxy.setHeader('Content-Length', String(Buffer.byteLength(bodyText))); } catch(_) {}
        try { proxy.write(bodyText); } catch(e) { console.error('MCP fallback write error:', e.message); }
        proxy.end();
      } else {
        req.pipe(proxy);
      }
    } else {
      proxy.end();
    }
  } catch (e) {
    console.error('MCP fallback setup error:', e.stack || e.message);
    if (!res.headersSent) res.status(500);
    res.end('Proxy error');
  }
});

// Generic Kamui HTTP proxy (non-MCP REST endpoints)
// Map /kamui/<path> -> https://<ALLOWED_MCP_HOST>/<path>
app.use('/kamui', (req, res) => {
  try {
    const upstreamPath = req.originalUrl.replace(/^\/kamui/, '') || '/';
    const upstreamUrl = new URL(`https://${ALLOWED_MCP_HOST}${upstreamPath}`);
    const headers = { ...req.headers };
    delete headers['origin'];
    delete headers['referer'];
    delete headers['host'];
    delete headers['connection'];
    delete headers['content-length'];
    headers['host'] = upstreamUrl.host;

    const options = {
      protocol: upstreamUrl.protocol,
      hostname: upstreamUrl.hostname,
      port: upstreamUrl.port || 443,
      path: upstreamUrl.pathname + upstreamUrl.search,
      method: req.method,
      headers
    };
    if (!headers['authorization'] && process.env.MCP_AUTH) {
      options.headers['Authorization'] = process.env.MCP_AUTH;
    }
    const proxy = https.request(options, (up) => {
      res.status(up.statusCode || 502);
      Object.entries(up.headers || {}).forEach(([k, v]) => {
        if (k.toLowerCase() === 'content-length') return;
        res.setHeader(k, v);
      });
      // CORS for browser dev
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Expose-Headers', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      up.pipe(res);
    });
    proxy.on('error', (err) => {
      console.error('Kamui proxy error:', err.message);
      if (!res.headersSent) res.status(502);
      res.end('Bad Gateway');
    });
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Expose-Headers', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      return res.status(204).end();
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const ct = (req.headers['content-type'] || '').toLowerCase();
      if (ct.startsWith('application/json') && typeof req.body === 'object' && req.body !== null) {
        const bodyText = JSON.stringify(req.body);
        try { proxy.write(bodyText); } catch(e) { console.error('Kamui proxy write error:', e.message); }
        proxy.end();
      } else {
        req.pipe(proxy);
      }
    } else {
      proxy.end();
    }
  } catch (e) {
    console.error('Kamui proxy setup error:', e.stack || e.message);
    if (!res.headersSent) res.status(500);
    res.end('Proxy error');
  }
});

// SSE proxy for MCP stream: GET /mcp/sse -> https://<ALLOWED_MCP_HOST>/mcp/sse
app.get('/mcp/sse', (req, res) => {
  try {
    const upstreamUrl = new URL(`https://${ALLOWED_MCP_HOST}/mcp/sse`);
    const sid = req.query.sid ? String(req.query.sid) : '';
    const auth = req.query.auth ? String(req.query.auth) : '';
    const headers = {
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'host': upstreamUrl.host,
    };
    if (sid) headers['mcp-session-id'] = sid;
    if (auth) headers['Authorization'] = decodeURIComponent(auth);

    const options = {
      protocol: upstreamUrl.protocol,
      hostname: upstreamUrl.hostname,
      port: upstreamUrl.port || 443,
      path: upstreamUrl.pathname + upstreamUrl.search,
      method: 'GET',
      headers
    };
    if (!headers['Authorization'] && process.env.MCP_AUTH) {
      options.headers['Authorization'] = process.env.MCP_AUTH;
    }
    if (!headers['Authorization'] && process.env.MCP_AUTH) {
      options.headers['Authorization'] = process.env.MCP_AUTH;
    }

    // Set SSE response headers
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, x-mcp-session-id, x-request-id');

    const upstream = https.request(options, (up) => {
      up.on('data', (chunk) => {
        try { res.write(chunk); } catch (_) {}
      });
      up.on('end', () => {
        try { res.end(); } catch(_) {}
      });
      up.on('error', (err) => {
        console.error('MCP SSE upstream error:', err.message);
        try { res.end(); } catch(_) {}
      });
    });
    upstream.on('error', (err) => {
      console.error('MCP SSE req error:', err.message);
      try { res.end(); } catch(_) {}
    });
    upstream.end();

    // Client disconnect
    req.on('close', () => {
      try { upstream.destroy(); } catch(_) {}
    });
  } catch (e) {
    console.error('SSE proxy setup error:', e.stack || e.message);
    if (!res.headersSent) res.status(500);
    res.end('SSE proxy error');
  }
});

// Generic SSE proxy: /mcp/<any>/sse -> https://<ALLOWED_MCP_HOST>/mcp/<any>/sse
app.get(/^\/mcp\/(.*)\/sse$/, (req, res) => {
  try {
    const suffix = req.params[0] || '';
    const upstreamUrl = new URL(`https://${ALLOWED_MCP_HOST}/mcp/${suffix}/sse`);
    const sid = req.query.sid ? String(req.query.sid) : '';
    const auth = req.query.auth ? String(req.query.auth) : '';
    const headers = {
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'host': upstreamUrl.host,
    };
    if (sid) headers['mcp-session-id'] = sid;
    if (auth) headers['Authorization'] = decodeURIComponent(auth);

    const options = {
      protocol: upstreamUrl.protocol,
      hostname: upstreamUrl.hostname,
      port: upstreamUrl.port || 443,
      path: upstreamUrl.pathname + upstreamUrl.search,
      method: 'GET',
      headers
    };

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, x-mcp-session-id, x-request-id');

    const upstream = https.request(options, (up) => {
      up.on('data', (chunk) => { try { res.write(chunk); } catch (_) {} });
      up.on('end', () => { try { res.end(); } catch(_) {} });
      up.on('error', (err) => { console.error('MCP SSE upstream error:', err.message); try { res.end(); } catch(_) {} });
    });
    upstream.on('error', (err) => { console.error('MCP SSE req error:', err.message); try { res.end(); } catch(_) {} });
    upstream.end();
    req.on('close', () => { try { upstream.destroy(); } catch(_) {} });
  } catch (e) {
    console.error('SSE wildcard proxy error:', e.stack || e.message);
    if (!res.headersSent) res.status(500);
    res.end('SSE proxy error');
  }
});

// SSE fallback: /<prefix>/.../sse -> https://<ALLOWED_MCP_HOST>/mcp/<prefix>/.../sse
app.get(/^\/(t2i|i2i|i2v|v2v|r2v|t2s|t2m|v2a|train|uploader|video-analysis|requirement|storyboard)\/(.*)\/sse$/, (req, res) => {
  try {
    const suffix = `${req.params[0]}/${req.params[1]}`; // <prefix>/<rest>
    const upstreamUrl = new URL(`https://${ALLOWED_MCP_HOST}/mcp/${suffix}/sse`);
    const sid = req.query.sid ? String(req.query.sid) : '';
    const auth = req.query.auth ? String(req.query.auth) : '';
    const headers = {
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'host': upstreamUrl.host,
    };
    if (sid) headers['mcp-session-id'] = sid;
    if (auth) headers['Authorization'] = decodeURIComponent(auth);

    const options = {
      protocol: upstreamUrl.protocol,
      hostname: upstreamUrl.hostname,
      port: upstreamUrl.port || 443,
      path: upstreamUrl.pathname + upstreamUrl.search,
      method: 'GET',
      headers
    };

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, x-mcp-session-id, x-request-id');

    const upstream = https.request(options, (up) => {
      up.on('data', (chunk) => { try { res.write(chunk); } catch (_) {} });
      up.on('end', () => { try { res.end(); } catch(_) {} });
      up.on('error', (err) => { console.error('Fallback MCP SSE upstream error:', err.message); try { res.end(); } catch(_) {} });
    });
    upstream.on('error', (err) => { console.error('Fallback MCP SSE req error:', err.message); try { res.end(); } catch(_) {} });
    upstream.end();
    req.on('close', () => { try { upstream.destroy(); } catch(_) {} });
  } catch (e) {
    console.error('SSE fallback proxy error:', e.stack || e.message);
    if (!res.headersSent) res.status(500);
    res.end('SSE proxy error');
  }
});

// Root SSE proxy: /sse -> https://<ALLOWED_MCP_HOST>/sse
app.get('/sse', (req, res) => {
  try {
    const upstreamUrl = new URL(`https://${ALLOWED_MCP_HOST}/sse`);
    const sid = req.query.sid ? String(req.query.sid) : '';
    const auth = req.query.auth ? String(req.query.auth) : '';
    const headers = {
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'host': upstreamUrl.host,
    };
    if (sid) headers['mcp-session-id'] = sid;
    if (auth) headers['Authorization'] = decodeURIComponent(auth);

    const options = {
      protocol: upstreamUrl.protocol,
      hostname: upstreamUrl.hostname,
      port: upstreamUrl.port || 443,
      path: upstreamUrl.pathname + upstreamUrl.search,
      method: 'GET',
      headers
    };

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, x-mcp-session-id, x-request-id');

    const upstream = https.request(options, (up) => {
      up.on('data', (chunk) => { try { res.write(chunk); } catch (_) {} });
      up.on('end', () => { try { res.end(); } catch(_) {} });
      up.on('error', (err) => { console.error('root SSE upstream error:', err.message); try { res.end(); } catch(_) {} });
    });
    upstream.on('error', (err) => { console.error('root SSE req error:', err.message); try { res.end(); } catch(_) {} });
    upstream.end();
    req.on('close', () => { try { upstream.destroy(); } catch(_) {} });
  } catch (e) {
    console.error('root SSE proxy error:', e.stack || e.message);
    if (!res.headersSent) res.status(500);
    res.end('SSE proxy error');
  }
});

// --- Story Gen Save/Load API ---

// Serve saved media files from the 'saves' directory at the root of the kamuios project
app.use('/saves', express.static(path.join(__dirname, 'saves')));

// GET /api/story-gen/list - List all saved stories
app.get('/api/story-gen/list', async (req, res) => {
  try {
    const savesRoot = path.join(__dirname, 'saves');
    await fse.ensureDir(savesRoot);
    const allEntries = await fse.readdir(savesRoot, { withFileTypes: true });
    const directories = allEntries
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    res.json(directories);
  } catch (error) {
    console.error('Error listing saves:', error);
    res.status(500).json({ error: 'Failed to list saved stories.' });
  }
});

// GET /api/story-gen/load/:id - Load a specific story
app.get('/api/story-gen/load/:id', async (req, res) => {
  try {
    const saveId = req.params.id;
    // Basic validation to prevent path traversal
    if (!saveId || saveId.includes('..') || saveId.includes('/')) {
      return res.status(400).json({ error: 'Invalid save ID.' });
    }

    const contentPath = path.join(__dirname, 'saves', saveId, 'content.yaml');
    if (!await fse.pathExists(contentPath)) {
      return res.status(404).json({ error: 'Save not found.' });
    }

    const yamlContent = await fse.readFile(contentPath, 'utf8');
    const scenes = yaml.load(yamlContent);

    // Transform media paths to be absolute URLs for the client
    const transformedScenes = scenes.map(scene => {
      const newScene = { ...scene };
      const apiBaseUrl = `http://localhost:${PORT}`;
      if (newScene.mediaSrc && !newScene.mediaSrc.startsWith('http')) {
        newScene.mediaSrc = `${apiBaseUrl}/saves/${saveId}/${newScene.mediaSrc}`;
      }
      if (newScene.endImageSrc && !newScene.endImageSrc.startsWith('http')) {
        newScene.endImageSrc = `${apiBaseUrl}/saves/${saveId}/${newScene.endImageSrc}`;
      }
      return newScene;
    });

    res.json(transformedScenes);
  } catch (error) {
    console.error('Error loading story:', error);
    res.status(500).json({ error: 'Failed to load story.' });
  }
});

// POST /api/story-gen/save - Save a story
app.post('/api/story-gen/save', async (req, res) => {
  try {
    const { saveId, scenes } = req.body;

    if (!saveId || typeof saveId !== 'string' || !scenes || !Array.isArray(scenes)) {
      return res.status(400).json({ error: 'Invalid request body. `saveId` and `scenes` are required.' });
    }
    // Basic validation to prevent path traversal
    if (saveId.includes('..') || saveId.includes('/')) {
      return res.status(400).json({ error: 'Invalid save ID format.' });
    }

    const saveDir = path.join(__dirname, 'saves', saveId);
    const mediaDir = path.join(saveDir, 'media');
    await fse.ensureDir(mediaDir);

    const newScenes = JSON.parse(JSON.stringify(scenes)); // Deep copy to avoid modifying original
    // The static directory is where the site assets are.
    const publicRoot = path.join(__dirname, 'static');

    for (const scene of newScenes) {
      const processMedia = async (mediaSrc) => {
        if (!mediaSrc || mediaSrc.startsWith('data:')) {
          return mediaSrc;
        }

        const sourceFilename = path.basename(new URL(mediaSrc, 'http://localhost').pathname);
        const destPath = path.join(mediaDir, sourceFilename);

        if (mediaSrc.startsWith('http')) {
          try {
            const buffer = await fetchBuffer(mediaSrc);
            await fse.writeFile(destPath, buffer);
            return path.join('media', sourceFilename).replace(/\\/g, '/');
          } catch (e) {
            console.error(`Failed to fetch media from ${mediaSrc}:`, e.message);
            return mediaSrc; // Return original URL on failure
          }
        } else {
          const sourcePath = path.join(publicRoot, mediaSrc);
          if (await fse.pathExists(sourcePath)) {
            await fse.copy(sourcePath, destPath);
            return path.join('media', sourceFilename).replace(/\\/g, '/');
          }
          return mediaSrc; // Return original path if not found
        }
      };

      scene.mediaSrc = await processMedia(scene.mediaSrc);
      scene.endImageSrc = await processMedia(scene.endImageSrc);
    }

    const yamlContent = yaml.dump(newScenes);
    const yamlPath = path.join(saveDir, 'content.yaml');
    await fse.writeFile(yamlPath, yamlContent, 'utf8');

    res.json({ success: true, message: `Story saved as ${saveId}` });
  } catch (error) {
    console.error('Error saving story:', error);
    res.status(500).json({ error: 'Failed to save story.' });
  }
});


// API endpoint to get images list
app.get('/api/images', async (req, res) => {
  try {
    const imagesDir = path.join(__dirname, 'static', 'images');
    const files = await fs.readdir(imagesDir);
    
    // Filter only image files
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
    const images = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return imageExtensions.includes(ext);
    });
    
    // Sort alphabetically
    images.sort();
    
    // Update the JSON file
    const jsonData = { images };
    const jsonPath = path.join(__dirname, 'public', 'data', 'images_list.json');
    await fs.writeFile(jsonPath, JSON.stringify(jsonData, null, 2));
    
    // Also update static/data directory
    const staticJsonPath = path.join(__dirname, 'static', 'data', 'images_list.json');
    await fs.writeFile(staticJsonPath, JSON.stringify(jsonData, null, 2));
    
    res.json(jsonData);
  } catch (error) {
    console.error('Error reading images directory:', error);
    res.status(500).json({ error: 'Failed to read images directory' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`API endpoint: http://localhost:${PORT}/api/images`);
});

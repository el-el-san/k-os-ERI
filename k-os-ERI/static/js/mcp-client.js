/**
 * JavaScript MCP (Model Context Protocol) クライアント
 * HttpMcpClient.kt の実装を参考にしたWebブラウザ用MCP通信ライブラリ
 *
 * Kotlin版HttpMcpClientのStreamable HTTP transportパターンを実装:
 * - SSEを使わない直接JSON-RPC 2.0通信
 * - セッション管理とエラーハンドリング
 * - フォールバック処理の削除でシンプル化
 */

class HttpMcpClient {
    constructor(baseUrl, options = {}) {
        this.url = baseUrl.trim().replace(/\/$/, '');
        this.authorization = options.authorization || null;
        this.clientName = options.clientName || 'kamui-web-client';
        this.clientVersion = options.clientVersion || '1.0.0';
        this.sessionId = null;
        this.nextId = 1;
        this._debug = { lastRequest: null, lastResponse: null };

        // Kotlin版と同じようにConnection: closeヘッダーを強制
        this.forceCloseConnection = true;
    }

    /**
     * MCPサーバーとの接続を初期化
     */
    async initialize() {
        if (window.debugLog) window.debugLog('🔧 initialize開始', { url: this.url });

        // 事前のGETプリフライトは行わない（最初からPOSTで開始）
        // 互換性のためのensureSessionは保持するが、initialize前には呼び出さない方針。

        const id = this.nextId++;
        const payload = {
            jsonrpc: '2.0',
            id: id,
            method: 'initialize',
            params: {
                protocolVersion: '2025-03-26',
                capabilities: {},
                clientInfo: {
                    name: this.clientName,
                    version: this.clientVersion
                }
            }
        };

        if (window.debugLog) window.debugLog('📤 initialize リクエスト送信', { id, method: 'initialize' });

        let response;
        try {
            response = await this.requestExpectResponse(id, payload);
            if (window.debugLog) window.debugLog('📥 initialize レスポンス受信', response);
        } catch (e) {
            if (window.debugLog) window.debugLog('❌ initialize リクエスト失敗', e.message);
            const msg = String((e && e.message)||'').toLowerCase();
            if (msg.includes('invalid') && msg.includes('session')) {
                // セッション未確立の可能性 → セッションをクリアして即座にPOST再試行（GETは行わない）
                this.sessionId = null;
                response = await this.requestExpectResponse(id, payload);
            } else {
                throw e;
            }
        }

        // 一部サーバーはボディに sessionId を返すため拾う
        try {
            const res = (response && response.result) || response;
            const bodySessionId = (res && res.sessionId) || (res && res.session && res.session.id) || (res && res.serverInfo && res.serverInfo.sessionId);
            if (bodySessionId && typeof bodySessionId === 'string') {
                this.sessionId = bodySessionId.trim();
                console.log('Captured MCP session ID from body:', this.sessionId);
                try { localStorage.setItem('mcp-last-session-id', this.sessionId); } catch(_) {}
            }
        } catch (_) { /* noop */ }

        // 初期化完了通知を送信
        await this.notifyInitialized();

        return response;
    }

    /**
     * 利用可能なツール一覧を取得
     */
    async listTools() {
        // 複数のメソッド名を試行
        const methods = ['tools/list', 'listTools', 'list_tools', 'get_tools'];
        let lastError;

        for (const method of methods) {
            const id = this.nextId++;
            const payload = { jsonrpc:'2.0', id, method, params: {} };
            if (window.debugLog) window.debugLog(`📋 ${method} 試行中:`, payload);

            try {
                const result = await this.requestExpectResponse(id, payload);
                if (window.debugLog) window.debugLog(`✅ ${method} 成功:`, result);
                return result;
            } catch (e) {
                if (window.debugLog) window.debugLog(`❌ ${method} 失敗:`, e.message);
                lastError = e;

                const msg = String((e && e.message)||'').toLowerCase();
                if (msg.includes('invalid') && msg.includes('session')) {
                    // セッション無効 → 再初期化して1回だけリトライ
                    this.sessionId = null;
                    await this.initialize().catch(()=>{});
                    try {
                        return await this.requestExpectResponse(id, payload);
                    } catch (retryError) {
                        lastError = retryError;
                    }
                }

                // -32601 (Method not found) なら次のメソッドを試行
                if (msg.includes('-32601') || msg.includes('not supported') || msg.includes('method not found')) {
                    continue;
                }

                // 他のエラーは即座に throw
                throw e;
            }
        }

        // すべて失敗した場合
        if (window.debugLog) window.debugLog('💥 すべてのlistToolsメソッドが失敗');
        throw lastError || new Error('All listTools methods failed');
    }

    /**
     * セッションプリフライトは無効化（常にPOSTで開始）
     */
    async ensureSession() {
        if (window.debugLog) window.debugLog('⤴️ ensureSession: skipped (POST-only policy)');
        return false;
    }

    /**
     * MCPツールを呼び出し
     */
    async callTool(name, args = {}) {
        const id = this.nextId++;
        const payload = { jsonrpc:'2.0', id, method:'tools/call', params:{ name, arguments: args } };
        try {
            return await this.requestExpectResponse(id, payload);
        } catch (e) {
            const msg = String((e && e.message)||'').toLowerCase();
            if (msg.includes('invalid') && msg.includes('session')) {
                this.sessionId = null;
                await this.initialize().catch(()=>{});
                return await this.requestExpectResponse(id, payload);
            }
            throw e;
        }
    }

    /**
     * 互換呼び出し（サーバ実装差異を吸収）
     * 順に試行:
     * 1) tools/call { name, arguments }
     * 2) tools/call { name, args }
     * 3) <toolName> { ...args }
     * 4) <toolName> { arguments: args }
     */
    async callToolCompat(name, args = {}) {
        // 1) 標準
        try { return await this.callTool(name, args); } catch(e) { /* next */ }

        // 2) args キー
        try {
            const id = this.nextId++;
            const payload = { jsonrpc:'2.0', id, method:'tools/call', params:{ name, args } };
            return await this.requestExpectResponse(id, payload);
        } catch(e) { /* next */ }

        // 3) 直接メソッド
        try {
            const id = this.nextId++;
            const payload = { jsonrpc:'2.0', id, method: name, params: args };
            return await this.requestExpectResponse(id, payload);
        } catch(e) { /* next */ }

        // 4) 直接メソッド + arguments
        const id = this.nextId++;
        const payload = { jsonrpc:'2.0', id, method: name, params: { arguments: args } };
        return await this.requestExpectResponse(id, payload);
    }

    /**
     * 初期化完了通知を送信
     */
    async notifyInitialized(params = {}) {
        const payload = {
            jsonrpc: '2.0',
            method: 'notifications/initialized',
            params: params
        };

        try {
            const reqHeaders = this.getHeaders();
            const response = await fetch(this.url, {
                method: 'POST',
                headers: reqHeaders,
                body: JSON.stringify(payload)
            });

            // notifications/initialized はボディを読まずヘッダのみ記録
            this._recordDebug({
                request: { method: 'POST', url: this.url, headers: this._scrubHeaders(reqHeaders), bodyBytes: JSON.stringify(payload).length, rpc: 'notifications/initialized' },
                response,
                body: null
            });
            this.captureSession(response);

            if (!response.ok) {
                console.warn(`notifications/initialized returned ${response.status}`);
            }
        } catch (error) {
            console.error('Failed to send initialized notification:', error);
        }
    }

    /**
     * HTTPリクエストを送信してJSONレスポンスを期待
     */
    async requestExpectResponse(expectedId, payload) {
        try {
            console.log('MCP Request:', JSON.stringify(payload, null, 2));

            // 1st try (minimal headers like Kotlin version)
            const response = await this.sendRequest(payload);

            if (response.ok) {
                const responseText = await response.text();
                return await this.processResponse(response, responseText, expectedId);
            }

            const errorText = await response.text();
            // Kotlin版と同じContent-Type関連エラー処理
            if (response.status >= 400 && response.status < 500 && (errorText || '').toLowerCase().includes('invalid content type')) {
                console.log('Content-Type error detected, retrying with explicit charset');
                return await this.retryWithCharset(expectedId, payload);
            }

            throw new Error(`MCP HTTP: server error status=${response.status} body='${errorText.slice(0, 500)}'`);

        } catch (e) {
            if (window.debugLog) window.debugLog('requestExpectResponse error:', e.message);
            throw e;
        }
    }

    /**
     * リクエスト送信（Kotlin版のbody()メソッドと同等）
     */
    async sendRequest(payload) {
        const text = JSON.stringify(payload);
        const reqHeaders = this.getHeaders();

        // Kotlin版と同じように、Content-Typeを明示的に制御
        reqHeaders['Content-Type'] = 'application/json';

        if (window.debugLog) {
            window.debugLog('POST ->', this.url);
            window.debugLog('Headers:', reqHeaders);
            window.debugLog(`Body size: ${text.length}`);
        }

        const response = await fetch(this.url, {
            method: 'POST',
            headers: reqHeaders,
            body: text
        });

        this.captureSession(response);
        return response;
    }

    /**
     * レスポンス処理（Kotlin版のparseJsonOrThrow相当）
     */
    async processResponse(response, responseText, expectedId) {
        console.log('MCP Response:', responseText);

        let responseObj;
        try {
            responseObj = JSON.parse(responseText);
        } catch (e) {
            throw new Error('Invalid JSON response from MCP server');
        }

        // レスポンスIDの検証（Kotlin版と同じ）
        const gotId = responseObj.id;
        const matchId = (typeof gotId === 'string') ? Number(gotId) : gotId;
        if (matchId !== expectedId) {
            throw new Error(`MCP HTTP: unexpected response id (expected=${expectedId} got=${responseObj.id})`);
        }

        // エラーレスポンスの処理（Kotlin版と同じ詳細エラーフォーマット）
        if (responseObj.error) {
            const error = responseObj.error;
            let errorMessage = 'MCP Error';
            if (error.code) errorMessage += ` [${error.code}]`;
            if (error.message) errorMessage += `: ${error.message}`;
            if (error.data) errorMessage += ` (data: ${JSON.stringify(error.data)})`;
            throw new Error(errorMessage);
        }

        return responseObj;
    }

    /**
     * Content-Typeエラー時のリトライ（Kotlin版と同じ）
     */
    async retryWithCharset(expectedId, payload) {
        const text = JSON.stringify(payload);
        const reqHeaders = this.getHeaders();
        reqHeaders['Accept'] = 'application/json';
        reqHeaders['Content-Type'] = 'application/json; charset=utf-8';

        if (window.debugLog) window.debugLog('Retry with Accept and charset due to content-type error');

        const response = await fetch(this.url, {
            method: 'POST',
            headers: reqHeaders,
            body: text
        });

        const responseText = await response.text();
        this.captureSession(response);

        if (!response.ok) {
            throw new Error(`MCP HTTP: server error status=${response.status} body='${responseText.slice(0, 500)}' (after retry)`);
        }

        return await this.processResponse(response, responseText, expectedId);
    }

    /**
     * Content-Typeエラー時のリトライ処理
     */
    async retryWithCharset(expectedId, payload) {
        const text = JSON.stringify(payload);
        const reqHeaders = this.getHeaders();
        reqHeaders['Accept'] = 'application/json';
        reqHeaders['Content-Type'] = 'application/json; charset=utf-8';

        if (window.debugLog) window.debugLog('Retry with Accept and charset due to content-type error');

        const response = await fetch(this.url, {
            method: 'POST',
            headers: reqHeaders,
            body: text
        });

        const responseText = await response.text();
        this.captureSession(response);

        if (!response.ok) {
            throw new Error(`MCP HTTP: server error status=${response.status} body='${responseText.slice(0, 500)}' (after retry)`);
        }

        return await this.processResponse(response, responseText, expectedId);
    }

    /**
     * HTTPヘッダーを生成
     */
    getHeaders() {
        // Kotlin版HttpMcpClientのcommonHeaders()と同じminimal headerパターン
        // プロキシ/ゲートウェイの誤検知を避け、最小限のヘッダーのみ送信
        const headers = {
            'User-Agent': `${this.clientName}/${this.clientVersion} (Web; Fetch)`,
            'Connection': 'close'
        };

        if (this.sessionId) {
            headers['mcp-session-id'] = this.sessionId;
        }

        if (this.authorization) {
            headers['Authorization'] = this.authorization;
        }

        return headers;
    }

    /**
     * レスポンスからセッションIDを取得
     */
    captureSession(response) {
        // 複数のヘッダ名を試行（大文字小文字は自動正規化される）
        const candidates = [
            'mcp-session-id',
            'mcp-session',
            'x-mcp-session-id',
            'x-session-id'
        ];
        for (const key of candidates) {
            const v = response.headers.get(key);
            if (v && v.trim()) {
                this.sessionId = v.trim();
                console.log('Captured MCP session ID (header:', key + '):', this.sessionId);
                try { localStorage.setItem('mcp-last-session-id', this.sessionId); } catch(_) {}
                return;
            }
        }
    }

    _recordDebug({ request, response, body }) {
        try {
            const headersObj = {};
            if (response.headers && response.headers.forEach) {
                response.headers.forEach((v, k) => { headersObj[k] = v; });
            }
            const info = {
                time: new Date().toISOString(),
                request,
                response: {
                    status: response.status,
                    statusText: response.statusText,
                    headers: headersObj,
                    bodyPreview: typeof body === 'string' ? body.slice(0, 2000) : null
                },
                sessionId: this.sessionId || null
            };
            this._debug.lastRequest = request;
            this._debug.lastResponse = info.response;
            this._debug.sessionId = info.sessionId;
            try { localStorage.setItem('mcp-last-debug', JSON.stringify(info)); } catch(_) {}
        } catch (_) {}
    }

    _scrubHeaders(h) {
        const out = { ...(h || {}) };
        if (out.Authorization) out.Authorization = '<redacted>';
        if (out.authorization) out.authorization = '<redacted>';
        return out;
    }

    getDebugInfo() {
        return {
            url: this.url,
            client: { name: this.clientName, version: this.clientVersion },
            sessionId: this.sessionId || null,
            lastRequest: this._debug.lastRequest,
            lastResponse: this._debug.lastResponse
        };
    }

    /**
     * 接続テスト（タイムアウト付き）
     */
    async testConnection(timeoutMs = 10000) {
        try {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('接続タイムアウト (10秒)')), timeoutMs)
            );

            const initPromise = this.initialize();
            const initResult = await Promise.race([initPromise, timeoutPromise]);

            console.log('MCP connection test successful:', initResult);
            if (window.debugLog) window.debugLog('🎯 initialize成功', initResult);
            return { success: true, serverInfo: initResult.result };
        } catch (error) {
            console.error('MCP connection test failed:', error);
            if (window.debugLog) window.debugLog('💥 initialize失敗', {
                message: error.message,
                stack: error.stack,
                url: this.url
            });
            return { success: false, error: error.message };
        }
    }
}

/**
 * MCP設定管理クラス
 */
class McpConfigManager {
    constructor() {
        this.config = this.loadConfig();
    }

    /**
     * ローカルストレージから設定を読み込み
     */
    loadConfig() {
        try {
            const stored = localStorage.getItem('mcp-config');
            return stored ? JSON.parse(stored) : { servers: {} };
        } catch (error) {
            console.error('Failed to load MCP config:', error);
            return { servers: {} };
        }
    }

    /**
     * 設定をローカルストレージに保存
     */
    saveConfig(config) {
        try {
            this.config = config;
            localStorage.setItem('mcp-config', JSON.stringify(config));
            return true;
        } catch (error) {
            console.error('Failed to save MCP config:', error);
            return false;
        }
    }

    /**
     * サーバー設定を追加/更新
     */
    addServer(name, serverConfig) {
        this.config.servers = this.config.servers || {};
        this.config.servers[name] = serverConfig;
        return this.saveConfig(this.config);
    }

    /**
     * サーバー設定を削除
     */
    removeServer(name) {
        if (this.config.servers && this.config.servers[name]) {
            delete this.config.servers[name];
            return this.saveConfig(this.config);
        }
        return true;
    }

    /**
     * 全サーバー設定を取得
     */
    getServers() {
        return this.config.servers || {};
    }

    /**
     * 特定のサーバー設定を取得
     */
    getServer(name) {
        return this.config.servers && this.config.servers[name] ? this.config.servers[name] : null;
    }

    /**
     * デフォルト設定を読み込み
     */
    async loadDefaultConfig() {
        try {
            const response = await fetch('/mcp/config.json');
            if (response.ok) {
                const defaultConfig = await response.json();

                // デフォルト設定を現在の設定にマージ
                if (defaultConfig.servers) {
                    this.config.servers = this.config.servers || {};

                    defaultConfig.servers.forEach(server => {
                        if (server.id && !this.config.servers[server.id]) {
                            this.config.servers[server.id] = {
                                url: server.baseUrl.replace('{BASE_URL}', window.location.origin),
                                type: 'http',
                                description: server.name,
                                authorization: server.auth ? `Bearer ${server.auth.env}` : null
                            };
                        }
                    });

                    this.saveConfig(this.config);
                }
            }
        } catch (error) {
            console.warn('Failed to load default MCP config:', error);
        }
    }
}

// グローバルでアクセス可能にする
window.HttpMcpClient = HttpMcpClient;
window.McpConfigManager = McpConfigManager;

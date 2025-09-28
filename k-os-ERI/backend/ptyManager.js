const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');

const BRIDGE_SCRIPT = path.join(__dirname, 'pty_bridge.py');
const DEFAULT_PYTHON = process.env.PTY_PYTHON || process.env.PYTHON || 'python3';

function createId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString('hex');
}

class PtySession extends EventEmitter {
  constructor(options) {
    super();
    if (!options || typeof options.command !== 'string' || !options.command.trim()) {
      throw new Error('PtySession requires a command string');
    }
    this.id = options.id || createId();
    this.command = options.command;
    this.args = Array.isArray(options.args) ? options.args.slice() : [];
    this.cwd = options.cwd || null;
    this.cols = options.cols || null;
    this.rows = options.rows || null;
    this.env = options.env ? { ...process.env, ...options.env } : process.env;
    this.pythonPath = options.pythonPath || DEFAULT_PYTHON;
    this.bridgeScript = options.bridgeScript || BRIDGE_SCRIPT;
    this.debug = !!options.debug;

    this.process = null;
    this.alive = false;
    this.ready = false;
    this.exited = false;
    this.stdoutBuffer = '';
    this.stderrBuffer = '';

    this._start();
  }

  _start() {
    const bridgeArgs = [];
    if (this.cwd) {
      bridgeArgs.push('--cwd', this.cwd);
    }
    if (typeof this.cols === 'number' && this.cols > 0) {
      bridgeArgs.push('--cols', String(this.cols));
    }
    if (typeof this.rows === 'number' && this.rows > 0) {
      bridgeArgs.push('--rows', String(this.rows));
    }
    if (this.debug) {
      bridgeArgs.push('--debug');
    }
    bridgeArgs.push('--', this.command);
    bridgeArgs.push(...this.args);

    this.process = spawn(this.pythonPath, [this.bridgeScript, ...bridgeArgs], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: this.env,
      cwd: this.cwd || process.cwd()
    });

    this.alive = true;

    this.process.stdout.on('data', (chunk) => {
      this.stdoutBuffer += chunk.toString('utf8');
      let index;
      while ((index = this.stdoutBuffer.indexOf('\n')) !== -1) {
        const line = this.stdoutBuffer.slice(0, index);
        this.stdoutBuffer = this.stdoutBuffer.slice(index + 1);
        if (!line.trim()) continue;
        this._handleBridgeMessage(line);
      }
    });

    this.process.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      this.stderrBuffer += text;
      if (this.stderrBuffer.length > 2000) {
        this.stderrBuffer = this.stderrBuffer.slice(-2000);
      }
      this.emit('bridge-stderr', text);
    });

    this.process.on('error', (err) => {
      this.emit('error', err);
    });

    this.process.on('close', (code, signal) => {
      this.alive = false;
      if (!this.exited) {
        this.exited = true;
        this.emit('exit', { exitCode: code, signal });
      }
    });
  }

  _handleBridgeMessage(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch (err) {
      this.emit('error', new Error(`Failed to parse bridge message: ${err.message}`));
      return;
    }

    const type = message.type;
    if (type === 'ready') {
      this.ready = true;
      this.emit('ready', { pid: message.pid });
    } else if (type === 'output') {
      if (typeof message.data === 'string') {
        try {
          const buf = Buffer.from(message.data, 'base64');
          this.emit('output', buf);
        } catch (err) {
          this.emit('error', new Error(`Failed to decode output: ${err.message}`));
        }
      }
    } else if (type === 'exit') {
      this.exited = true;
      this.alive = false;
      this.emit('exit', {
        exitCode: Object.prototype.hasOwnProperty.call(message, 'exitCode') ? message.exitCode : null,
        signal: Object.prototype.hasOwnProperty.call(message, 'signal') ? message.signal : null
      });
    } else if (type === 'error') {
      const err = new Error(message.message || 'Unknown PTY bridge error');
      if (message.code) err.code = message.code;
      this.emit('error', err);
    } else if (type === 'pong') {
      this.emit('pong', message.ts);
    } else {
      this.emit('debug', message);
    }
  }

  _send(message) {
    if (!this.process || !this.alive) return false;
    try {
      this.process.stdin.write(JSON.stringify(message));
      this.process.stdin.write('\n');
      return true;
    } catch (err) {
      this.emit('error', err);
      return false;
    }
  }

  write(buffer) {
    if (!buffer || !buffer.length) return;
    const payload = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer, 'utf8');
    this._send({ type: 'input', encoding: 'base64', data: payload.toString('base64') });
  }

  resize(rows, cols) {
    if (rows == null && cols == null) return;
    this._send({ type: 'resize', rows, cols });
  }

  terminate(signal = 'SIGTERM') {
    this._send({ type: 'terminate', signal });
  }

  ping(ts = Date.now()) {
    this._send({ type: 'ping', ts });
  }

  dispose() {
    if (this.alive && this.process) {
      try {
        this.terminate('SIGTERM');
      } catch (_) {
        // ignore
      }
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          try {
            this.process.kill('SIGKILL');
          } catch (_) {
            // ignore
          }
        }
      }, 1500);
    }
  }
}

const sessions = new Map();

function createSession(options) {
  const session = new PtySession(options);
  sessions.set(session.id, session);
  const cleanup = () => {
    sessions.delete(session.id);
  };
  session.once('exit', cleanup);
  session.once('error', cleanup);
  return session;
}

function getSession(id) {
  return sessions.get(id);
}

function removeSession(id) {
  const session = sessions.get(id);
  if (session) {
    sessions.delete(id);
    session.dispose();
  }
}

module.exports = {
  PtySession,
  createSession,
  getSession,
  removeSession
};

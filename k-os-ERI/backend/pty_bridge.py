#!/usr/bin/env python3
"""
Lightweight PTY bridge that runs a command inside a pseudo-terminal and communicates
via newline-delimited JSON over stdin/stdout. Designed to be orchestrated by the
Node backend to provide interactive terminals through a WebSocket bridge.
"""

import argparse
import base64
import errno
import json
import os
import selectors
import signal
import struct
import sys
import termios
import fcntl
from typing import Optional


def parse_args():
    parser = argparse.ArgumentParser(description="Spawn a command inside a PTY and proxy IO")
    parser.add_argument('--cwd', dest='cwd', default=None, help='Working directory for the command')
    parser.add_argument('--cols', dest='cols', type=int, default=120, help='Initial terminal columns')
    parser.add_argument('--rows', dest='rows', type=int, default=30, help='Initial terminal rows')
    parser.add_argument('--debug', action='store_true', help='Enable debug logs to stderr')
    parser.add_argument('command', nargs=argparse.REMAINDER, help='Command to execute (prefix with -- to separate)')
    args = parser.parse_args()
    command = args.command[:] if args.command else []
    if command and command[0] == '--':
        command = command[1:]
    if not command:
        parser.error('No command provided. Specify after --, e.g. pty_bridge.py -- claude')
    return args, command


def debug_log(enabled: bool, message: str):
    if enabled:
        sys.stderr.write(f"[pty_bridge] {message}\n")
        sys.stderr.flush()


def send_message(payload):
    sys.stdout.write(json.dumps(payload))
    sys.stdout.write('\n')
    sys.stdout.flush()


def encode_data(data: bytes) -> str:
    if not data:
        return ''
    return base64.b64encode(data).decode('ascii')


def decode_data(data: str) -> bytes:
    if not data:
        return b''
    return base64.b64decode(data.encode('ascii'))


def set_winsize(fd: int, rows: Optional[int], cols: Optional[int]):
    if not rows or not cols:
        return
    try:
        packed = struct.pack('HHHH', rows, cols, 0, 0)
        fcntl.ioctl(fd, termios.TIOCSWINSZ, packed)
    except OSError:
        pass


def main():
    args, command = parse_args()
    debug = bool(args.debug)

    try:
        master_fd, slave_fd = os.openpty()
    except OSError as err:
        send_message({'type': 'error', 'message': f'openpty failed: {err}'})
        return
    try:
        pid = os.fork()
    except OSError as err:
        send_message({'type': 'error', 'message': f'fork failed: {err}'})
        raise

    if pid == 0:
        # Child process: configure environment and exec command
        try:
            if args.cwd:
                os.chdir(args.cwd)
        except Exception as err:  # pragma: no cover - only on invalid cwd
            os.write(2, f"Failed to chdir to {args.cwd}: {err}\n".encode())
            os._exit(111)

        os.setsid()
        os.close(master_fd)
        os.dup2(slave_fd, 0)
        os.dup2(slave_fd, 1)
        os.dup2(slave_fd, 2)
        if slave_fd > 2:
            os.close(slave_fd)
        try:
            os.execvp(command[0], command)
        except FileNotFoundError:
            os.write(2, f"Command not found: {command[0]}\n".encode())
            os._exit(127)
        except Exception as err:  # pragma: no cover - unexpected exec failure
            os.write(2, f"Failed to exec {command}: {err}\n".encode())
            os._exit(126)
        # Unreachable

    # Parent process continues here
    os.close(slave_fd)
    set_winsize(master_fd, args.rows, args.cols)

    stdin_fd = sys.stdin.fileno()
    selector = selectors.DefaultSelector()
    selector.register(master_fd, selectors.EVENT_READ)
    selector.register(stdin_fd, selectors.EVENT_READ)

    stdin_buffer = b''
    child_exited = False
    exit_code = None
    exit_signal = None

    def terminate_child(sig=signal.SIGTERM):
        nonlocal child_exited
        if child_exited:
            return
        try:
            os.kill(pid, sig)
        except ProcessLookupError:
            pass

    def reap_child(blocking=False):
        nonlocal child_exited, exit_code, exit_signal
        if child_exited:
            return
        flags = 0 if blocking else os.WNOHANG
        try:
            waited_pid, status = os.waitpid(pid, flags)
        except ChildProcessError:
            child_exited = True
            return
        if waited_pid == 0:
            return
        child_exited = True
        if os.WIFEXITED(status):
            exit_code = os.WEXITSTATUS(status)
        elif os.WIFSIGNALED(status):
            exit_signal = os.WTERMSIG(status)
        else:
            exit_code = None

    def handle_control_message(message: dict):
        msg_type = message.get('type')
        if msg_type == 'input':
            payload = message.get('data', '')
            try:
                data = decode_data(payload) if message.get('encoding') == 'base64' else payload.encode('utf-8')
            except Exception as err:
                debug_log(debug, f'Failed to decode input payload: {err}')
                return
            if data:
                os.write(master_fd, data)
        elif msg_type == 'resize':
            rows = message.get('rows')
            cols = message.get('cols')
            set_winsize(master_fd, rows, cols)
        elif msg_type == 'terminate':
            sig_name = message.get('signal', 'SIGTERM')
            sig = getattr(signal, sig_name, signal.SIGTERM)
            terminate_child(sig)
        elif msg_type == 'ping':
            send_message({'type': 'pong', 'ts': message.get('ts')})
        else:
            debug_log(debug, f'Unhandled control message: {message}')

    # Notify controller that the child is ready
    send_message({'type': 'ready', 'pid': pid})

    try:
        while True:
            if child_exited:
                break
            events = selector.select(timeout=0.2)
            if not events:
                reap_child(blocking=False)
                continue
            for key, _ in events:
                if key.fileobj == master_fd:
                    try:
                        data = os.read(master_fd, 4096)
                    except OSError as err:
                        if err.errno == errno.EIO:
                            data = b''
                        else:
                            raise
                    if data:
                        send_message({'type': 'output', 'data': encode_data(data)})
                    else:
                        reap_child(blocking=True)
                        break
                elif key.fileobj == stdin_fd:
                    try:
                        chunk = os.read(stdin_fd, 4096)
                    except OSError as err:
                        if err.errno == errno.EINTR:
                            continue
                        raise
                    if not chunk:
                        debug_log(debug, 'Controller stdin closed; terminating child')
                        terminate_child(signal.SIGHUP)
                        reap_child(blocking=True)
                        break
                    stdin_buffer += chunk
                    while b'\n' in stdin_buffer:
                        line, stdin_buffer = stdin_buffer.split(b'\n', 1)
                        if not line.strip():
                            continue
                        try:
                            message = json.loads(line.decode('utf-8', 'ignore'))
                        except json.JSONDecodeError as err:
                            debug_log(debug, f'Failed to parse JSON line: {err}')
                            continue
                        handle_control_message(message)
            reap_child(blocking=False)
    finally:
        selector.unregister(master_fd)
        selector.unregister(stdin_fd)
        os.close(master_fd)
        reap_child(blocking=True)
        send_message({'type': 'exit', 'exitCode': exit_code, 'signal': exit_signal})


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        pass

import argparse
import select
import signal
import socket
import socketserver
import sys
import threading
import time

import paramiko
import psycopg


SSH_HOST = "145.223.27.100"
SSH_PORT = 22
SSH_USER = "root"
SSH_PASSWORD = "Sucesso@pranos2026"

REMOTE_DB_HOST = "179.98.108.212"
REMOTE_DB_PORT = 5432

DB_NAME = "fazfarmahc_loja02_20250729"
DB_USER = "unicocontato"
DB_PASSWORD = "IHXAp7qvY43UHEPZ"


def run_test_query(local_port: int) -> None:
    conn = psycopg.connect(
        host="127.0.0.1",
        port=local_port,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        connect_timeout=10,
    )
    try:
        with conn.cursor() as cur:
            cur.execute("select current_database(), current_user, now()")
            row = cur.fetchone()
            print(
                f"Connected to database={row[0]} as user={row[1]} at server_time={row[2]}",
                flush=True,
            )
    finally:
        conn.close()


class TunnelHandler(socketserver.BaseRequestHandler):
    ssh_transport = None
    chain_host = REMOTE_DB_HOST
    chain_port = REMOTE_DB_PORT

    def handle(self) -> None:
        chan = self.ssh_transport.open_channel(
            "direct-tcpip",
            (self.chain_host, self.chain_port),
            self.request.getpeername(),
        )
        try:
            while True:
                readers, _, _ = select.select([self.request, chan], [], [])
                if self.request in readers:
                    data = self.request.recv(1024)
                    if not data:
                        break
                    chan.sendall(data)
                if chan in readers:
                    data = chan.recv(1024)
                    if not data:
                        break
                    self.request.sendall(data)
        finally:
            chan.close()
            self.request.close()


class ThreadedTCPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def open_ssh_transport() -> paramiko.Transport:
    sock = socket.create_connection((SSH_HOST, SSH_PORT), timeout=10)
    transport = paramiko.Transport(sock)
    transport.connect(username=SSH_USER, password=SSH_PASSWORD)
    return transport


def main() -> int:
    parser = argparse.ArgumentParser(description="Open an SSH tunnel to PostgreSQL.")
    parser.add_argument("--local-port", type=int, default=15432)
    parser.add_argument("--test-query", action="store_true")
    args = parser.parse_args()

    transport = open_ssh_transport()
    TunnelHandler.ssh_transport = transport
    server = ThreadedTCPServer(("127.0.0.1", args.local_port), TunnelHandler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    print(
        f"Tunnel ready on 127.0.0.1:{args.local_port} -> {REMOTE_DB_HOST}:{REMOTE_DB_PORT}",
        flush=True,
    )

    if args.test_query:
        run_test_query(args.local_port)

    stop = False

    def handle_signal(signum, frame):  # noqa: ARG001
        nonlocal stop
        stop = True

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    try:
        while not stop:
            time.sleep(1)
    finally:
        server.shutdown()
        server.server_close()
        transport.close()
        print("Tunnel closed", flush=True)

    return 0


if __name__ == "__main__":
    sys.exit(main())

import argparse
import json

import psycopg


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a PostgreSQL query over the local SSH tunnel.")
    parser.add_argument("sql", help="SQL query to execute")
    args = parser.parse_args()

    conn = psycopg.connect(
        host="127.0.0.1",
        port=15432,
        dbname="fazfarmahc_loja02_20250729",
        user="unicocontato",
        password="IHXAp7qvY43UHEPZ",
        connect_timeout=10,
    )
    try:
        with conn.cursor() as cur:
            cur.execute(args.sql)
            if cur.description:
                columns = [desc.name for desc in cur.description]
                rows = cur.fetchall()
                print(json.dumps([dict(zip(columns, row)) for row in rows], default=str, ensure_ascii=False, indent=2))
            else:
                conn.commit()
                print("OK")
    finally:
        conn.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

from __future__ import annotations


def main() -> None:
    try:
        from dotenv import load_dotenv

        load_dotenv()
    except ImportError:
        pass

    from .server import main as run_server

    run_server()


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Apply preview changes that Rails reloading and Node --watch cannot handle."""

import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent.parent
STATE = ROOT / "tmp/devenv-watch-state.json"
COMPOSE = [str(ROOT / "scripts/devenv")]
SERVICES = ["web", "e621_media", "wallpaper_api", "accounts", "router", "cable"]


def action_for(path):
    if (path.startswith(("app/views/", "nuttracker/app/views/")) and path.endswith((".erb", ".jbuilder"))) or path == "scripts/compile-node-views.rb":
        return "compile_views"
    if path in {".env", ".env.example", "walltaker.env", "docker-compose.yml", "docker-compose-devenv.yml"}:
        return "recreate"
    # The engine is bind-mounted with the app. Source/template edits only need
    # a restart; rebuilding would reinstall gems and precompile all assets.
    if path.startswith("nuttracker/app/"):
        return "restart_web"
    if path in {"Gemfile", "Gemfile.lock", "Dockerfile", ".dockerignore"} or path.startswith("nuttracker/"):
        return "build_web"
    if path.startswith(("config/", "lib/", "scrubbers/", "db/migrate/", "app/jobs/")) or path == "config.ru":
        return "restart_web"
    if path.startswith("services/router/"):
        return "reload_router"
    if path in {"services/e621-media/package.json", "services/e621-media/package-lock.json",
                "services/e621-media/Dockerfile", "services/e621-media/.dockerignore"}:
        return "build_media"
    if path in {"services/wallpaper-api/package.json", "services/wallpaper-api/package-lock.json",
                "services/wallpaper-api/Dockerfile", "services/wallpaper-api/Dockerfile.dockerignore"}:
        return "build_api"
    if path in {"services/accounts/package.json", "services/accounts/package-lock.json",
                "services/accounts/Dockerfile", "services/accounts/.dockerignore"}:
        return "build_accounts"
    if path in {"scripts/devenv", "scripts/devenv-watch.py"}:
        return "restart_watcher"
    return None


def snapshot():
    paths = [ROOT / name for name in (
        ".env", ".env.example", "walltaker.env", "docker-compose.yml", "docker-compose-devenv.yml",
        "Gemfile", "Gemfile.lock", "Dockerfile", ".dockerignore", "config.ru",
        "scripts/devenv", "scripts/devenv-watch.py", "scripts/compile-node-views.rb",
    )]
    for folder in ("config", "lib", "scrubbers", "db/migrate", "app/jobs", "app/views", "nuttracker", "services"):
        directory = ROOT / folder
        if directory.exists():
            for parent, dirs, files in os.walk(directory):
                dirs[:] = [name for name in dirs if name not in {".git", "node_modules", "tmp", "log", "vendor"}]
                paths.extend(Path(parent) / name for name in files)
    result = {}
    for path in paths:
        relative = path.relative_to(ROOT).as_posix()
        if action_for(relative) and path.is_file():
            stat = path.stat()
            result[relative] = [stat.st_mtime_ns, stat.st_size]
    return result


def run(*args):
    print("Applying:", " ".join(args), flush=True)
    subprocess.run(COMPOSE + list(args), cwd=ROOT, check=True, timeout=1800)


def apply_changes(paths):
    actions = {action_for(path) for path in paths}
    if "build_web" in actions:
        run("build", "web")
    if "build_media" in actions:
        run("build", "e621_media")
    if "build_api" in actions:
        run("build", "wallpaper_api")
    if "build_accounts" in actions:
        run("build", "accounts")
    if "recreate" in actions:
        run("up", "-d", "--no-deps", "--force-recreate", *SERVICES)
    else:
        if actions & {"build_web", "restart_web"}:
            run("up", "-d", "--no-deps", "--force-recreate", "web")
        if "build_media" in actions:
            run("up", "-d", "--no-deps", "--force-recreate", "e621_media")
        if "build_api" in actions:
            run("up", "-d", "--no-deps", "--force-recreate", "wallpaper_api")
        if "build_accounts" in actions:
            run("up", "-d", "--no-deps", "--force-recreate", "accounts")
        if "reload_router" in actions:
            run("exec", "-T", "router", "nginx", "-t")
            run("exec", "-T", "router", "nginx", "-s", "reload")
    if "compile_views" in actions:
        # Compile without booting another Rails process on this small VPS.
        # The atomic manifest replacement triggers Node's existing file watch.
        run("exec", "-T", "web", "bundle", "exec", "ruby", "scripts/compile-node-views.rb")
    return "restart_watcher" in actions


def main():
    STATE.parent.mkdir(parents=True, exist_ok=True)
    try:
        previous = json.loads(STATE.read_text())
    except (FileNotFoundError, ValueError):
        previous = snapshot()
        STATE.write_text(json.dumps(previous))
    print("Watching node checkout; Rails and Node handle ordinary source edits directly.", flush=True)
    while True:
        time.sleep(2)
        try:
            current = snapshot()
            if current == previous:
                continue
            time.sleep(2)  # Debounce multi-file saves.
            current = snapshot()
            changed = sorted(path for path in previous.keys() | current.keys() if previous.get(path) != current.get(path))
            print("Changed:", ", ".join(changed), flush=True)
            restart = apply_changes(changed)
            STATE.write_text(json.dumps(current))
            previous = current
            if restart:
                os.execv(sys.executable, [sys.executable, str(Path(__file__).resolve())])
        except (OSError, subprocess.SubprocessError) as error:
            print(f"Preview update failed; retrying in 30 seconds: {error}", flush=True)
            time.sleep(30)


if __name__ == "__main__":
    main()

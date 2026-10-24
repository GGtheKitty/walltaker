#!/usr/bin/env python3
"""Apply dev-ggthekitty preview changes that Rails source reload cannot handle."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent.parent
STATE = ROOT / 'tmp/devenv-watch-state.json'
COMPOSE = [str(ROOT / 'scripts/devenv')]

def action_for(path):
    if path in {'.env', '.env.example', 'walltaker.env', 'docker-compose.yml', 'docker-compose-devenv.yml'}:
        return 'recreate'
    if path.startswith('services/anycable/'):
        return 'build_cable'
    if path in {'Gemfile', 'Gemfile.lock', 'Dockerfile', '.dockerignore'}:
        return 'build_web'
    if path.startswith(('config/', 'lib/', 'scrubbers/', 'db/migrate/', 'app/jobs/', 'nuttracker/app/')) or path == 'config.ru':
        return 'restart_web'
    if path in {'scripts/devenv', 'scripts/devenv-watch.py'}:
        return 'restart_watcher'
    return None

def snapshot():
    result = {}
    fixed = ['.env', '.env.example', 'walltaker.env', 'docker-compose.yml', 'docker-compose-devenv.yml',
             'Gemfile', 'Gemfile.lock', 'Dockerfile', '.dockerignore', 'config.ru', 'scripts/devenv', 'scripts/devenv-watch.py']
    paths = [ROOT / name for name in fixed]
    for folder in ['config', 'lib', 'scrubbers', 'db/migrate', 'app/jobs', 'nuttracker/app', 'services/anycable']:
        for directory, dirs, files in os.walk(ROOT / folder):
            dirs[:] = [d for d in dirs if d not in {'node_modules', '__pycache__', '.git', 'tmp', 'log'}]
            paths.extend(Path(directory) / name for name in files)
    for path in paths:
        name = path.relative_to(ROOT).as_posix()
        if path.is_file() and action_for(name):
            stat = path.stat(); result[name] = [stat.st_mtime_ns, stat.st_size]
    return result

def run(*args):
    print('Applying:', ' '.join(args), flush=True)
    subprocess.run(COMPOSE + list(args), cwd=ROOT, check=True, timeout=1800)

def apply_changes(paths):
    actions = {action_for(path) for path in paths}
    if actions & {'build_cable', 'build_web'}:
        # Leave enough RAM for compilation on the 2 GiB preview VPS.
        run('stop', 'web')
        try:
            if 'build_cable' in actions:
                subprocess.run(['docker', 'build', '--memory=768m', '--memory-swap=768m',
                    '--cpu-period=100000', '--cpu-quota=100000', '-t', 'walltaker-anycable:liveness',
                    'services/anycable'], cwd=ROOT, check=True, timeout=1800)
            if 'build_web' in actions:
                run('build', 'web')
        finally:
            run('up', '-d', '--no-deps', 'web')
    if 'recreate' in actions:
        run('up', '-d', '--no-deps', '--force-recreate', 'web', 'cable')
    else:
        if actions & {'build_web', 'restart_web'}:
            run('up', '-d', '--no-deps', '--force-recreate', 'web')
        if 'build_cable' in actions:
            run('up', '-d', '--no-deps', '--force-recreate', 'cable')
    return 'restart_watcher' in actions

def main():
    STATE.parent.mkdir(parents=True, exist_ok=True)
    try: previous = json.loads(STATE.read_text())
    except (FileNotFoundError, ValueError): previous = snapshot()
    print('Watching dev-ggthekitty preview; Rails reloads ordinary source edits.', flush=True)
    while True:
        time.sleep(2)
        try:
            current = snapshot()
            if current == previous: continue
            time.sleep(2)
            current = snapshot()
            changed = sorted(p for p in previous.keys() | current.keys() if previous.get(p) != current.get(p))
            print('Changed:', ', '.join(changed), flush=True)
            restart = apply_changes(changed)
            previous = current; STATE.write_text(json.dumps(current))
            if restart: os.execv(sys.executable, [sys.executable, str(Path(__file__).resolve())])
        except (OSError, subprocess.SubprocessError) as error:
            print('Preview update failed; retrying in 30 seconds:', error, flush=True)
            time.sleep(30)

if __name__ == '__main__': main()

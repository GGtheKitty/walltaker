#!/usr/bin/env python3
"""Apply Node preview changes not handled by source/asset watchers."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
ROOT=Path(__file__).resolve().parent.parent
STATE=ROOT/'tmp/devenv-watch-state.json'
SERVICES=['e621_media','wallpaper_api','accounts','node_web','router','cable']

def action_for(path):
    if path=='.git/HEAD':
        return 'restart_node_web'
    if path in {'.env','.env.example','walltaker.env','docker-compose.yml','docker-compose-devenv.yml'}:
        return 'recreate'
    for folder,action in [('e621-media','build_media'),('wallpaper-api','build_api'),('accounts','build_accounts'),('web','build_node_web'),('database','build_database'),('cable','build_cable')]:
        if path in {f'services/{folder}/'+name for name in ['package.json','package-lock.json','Dockerfile','Dockerfile.dockerignore','.dockerignore']}:
            return action
    if path.startswith(('db/','services/database/','scripts/provision-')):
        return 'migrate'
    if path.startswith('services/web/scripts/') and path.endswith('.js'):
        return 'restart_node_web'
    if path.startswith('services/router/'):
        return 'reload_router'
    if path in {'scripts/devenv','scripts/compose','scripts/devenv-watch.py'}:
        return 'restart_watcher'
    return None

def snapshot():
    paths=[ROOT/name for name in ['.env','.env.example','walltaker.env','docker-compose.yml','docker-compose-devenv.yml']]
    for folder in ['services','db','scripts']:
        for parent,dirs,files in os.walk(ROOT/folder):
            dirs[:]=[name for name in dirs if name not in {'.git','node_modules','tmp','dist','log','vendor','__pycache__'}]
            paths.extend(Path(parent)/name for name in files)
    result={path.relative_to(ROOT).as_posix():[path.stat().st_mtime_ns,path.stat().st_size] for path in paths if path.is_file() and action_for(path.relative_to(ROOT).as_posix())}
    # Resolve the commit rather than stat HEAD: a commit normally changes a
    # branch ref, and packed refs/worktrees do not share one fixed ref path.
    result['.git/HEAD']=subprocess.check_output(['git','rev-parse','--verify','HEAD'],cwd=ROOT,text=True).strip()
    return result

def run(*args):
    print('Applying:',' '.join(args),flush=True)
    subprocess.run([str(ROOT/'scripts/devenv'),*args],cwd=ROOT,check=True,timeout=1800)

def apply_changes(paths):
    actions={action_for(path) for path in paths}
    builds={'build_media':('services/e621-media/Dockerfile','walltaker-e621_media','services/e621-media',192),
            'build_api':('services/wallpaper-api/Dockerfile','walltaker-wallpaper_api','services',192),
            'build_accounts':('services/accounts/Dockerfile','walltaker-accounts','services/accounts',192),
            'build_node_web':('services/web/Dockerfile','walltaker-node_web','.',256),
            'build_database':('services/database/Dockerfile','walltaker-migrate','.',192),
            'build_cable':('services/cable/Dockerfile','walltaker-cable','services/cable',192)}
    for action,(dockerfile,tag,context,memory) in builds.items():
        if action in actions:
            subprocess.run(['docker','build',f'--memory={memory}m',f'--memory-swap={memory}m','--cpu-period=100000','--cpu-quota=50000','-f',dockerfile,'-t',tag,context],cwd=ROOT,check=True,timeout=1800)
    if actions & {'migrate','build_database','recreate'}:
        run('run','--rm','--no-deps','migrate')
    if 'recreate' in actions:
        run('up','-d','--no-deps','--force-recreate',*SERVICES)
    else:
        for action,service in [('build_media','e621_media'),('build_api','wallpaper_api'),('build_accounts','accounts'),('build_node_web','node_web'),('build_cable','cable')]:
            if action in actions or service=='node_web' and 'restart_node_web' in actions:
                run('up','-d','--no-deps','--force-recreate',service)
        if 'reload_router' in actions:
            run('exec','-T','router','nginx','-t')
            run('exec','-T','router','nginx','-s','reload')
    return 'restart_watcher' in actions

def main():
    STATE.parent.mkdir(parents=True,exist_ok=True)
    try:previous=json.loads(STATE.read_text())
    except (FileNotFoundError,ValueError):previous=snapshot();STATE.write_text(json.dumps(previous))
    print('Watching the Node checkout; source and asset edits reload directly.',flush=True)
    while True:
        time.sleep(2)
        try:
            current=snapshot()
            if current==previous:continue
            time.sleep(2)
            current=snapshot();changed=sorted(p for p in previous.keys()|current.keys() if previous.get(p)!=current.get(p))
            print('Changed:',', '.join(changed),flush=True)
            restart=apply_changes(changed);STATE.write_text(json.dumps(current));previous=current
            if restart:os.execv(sys.executable,[sys.executable,str(Path(__file__).resolve())])
        except (OSError,subprocess.SubprocessError) as error:
            print('Preview update failed; retrying in 30 seconds: '+str(error),flush=True);time.sleep(30)
if __name__=='__main__':main()

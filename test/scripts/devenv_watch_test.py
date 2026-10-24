import importlib.util
from pathlib import Path
import subprocess
import unittest
from unittest.mock import call, patch
spec = importlib.util.spec_from_file_location('watcher', Path(__file__).resolve().parents[2] / 'scripts/devenv-watch.py')
watcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(watcher)
class PreviewWatcherTest(unittest.TestCase):
    @patch.object(watcher, 'run')
    @patch.object(watcher.subprocess, 'run', side_effect=subprocess.CalledProcessError(1, 'docker'))
    def test_failed_cable_build_restores_web_before_retry(self, build, run):
        with self.assertRaises(subprocess.CalledProcessError):
            watcher.apply_changes(['services/anycable/native_presence.go'])
        self.assertEqual([call('stop', 'web'), call('up', '-d', '--no-deps', 'web')], run.call_args_list)
        args = build.call_args.args[0]
        self.assertIn('--memory=768m', args)
        self.assertIn('--memory-swap=768m', args)
    @patch.object(watcher, 'run')
    def test_compose_change_recreates_current_branch_services(self, run):
        watcher.apply_changes(['docker-compose.yml'])
        run.assert_called_once_with('up', '-d', '--no-deps', '--force-recreate', 'web', 'cable')
    def test_ordinary_source_uses_rails_reload(self):
        for path in ['app/services/link_presence.rb', 'app/channels/link_channel.rb', 'app/views/help/index.html.erb']:
            self.assertIsNone(watcher.action_for(path))
        self.assertEqual('restart_web', watcher.action_for('config/routes.rb'))
if __name__ == '__main__': unittest.main()

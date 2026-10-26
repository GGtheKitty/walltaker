import importlib.util
from pathlib import Path
import subprocess
import unittest
from unittest.mock import call,patch
spec=importlib.util.spec_from_file_location('watcher',Path(__file__).resolve().parents[2]/'scripts/devenv-watch.py')
watcher=importlib.util.module_from_spec(spec);spec.loader.exec_module(watcher)
class PreviewWatcherTest(unittest.TestCase):
    def test_source_edits_use_native_watchers(self):
        for path in ['services/web/src/routes.js','services/wallpaper-api/src/server.js','services/accounts/src/server.js','services/cable/src/server.js','app/javascript/controllers/message_controller.js','app/assets/stylesheets/link.css','services/web/frontend/application.js']:
            self.assertIsNone(watcher.action_for(path))
    def test_database_edits_trigger_node_migrations(self):
        for path in ['db/migrations/20261025000001_example.sql','services/database/migrate.js','scripts/provision-browser.sh']:
            self.assertEqual('migrate',watcher.action_for(path))
    @patch.object(watcher,'run')
    def test_migrations_do_not_restart_application_containers(self,run):
        watcher.apply_changes(['db/migrations/20261025000001_example.sql'])
        run.assert_called_once_with('run','--rm','--no-deps','migrate')
    @patch.object(watcher,'run')
    @patch.object(watcher.subprocess,'run')
    def test_frontend_dependency_build_is_bounded_and_only_recreates_web(self,build,run):
        watcher.apply_changes(['services/web/package-lock.json'])
        self.assertIn('--memory=256m',build.call_args.args[0]);self.assertIn('--memory-swap=256m',build.call_args.args[0])
        run.assert_called_once_with('up','-d','--no-deps','--force-recreate','node_web')
    @patch.object(watcher,'run')
    def test_asset_builder_edits_restart_without_a_dependency_build(self,run):
        watcher.apply_changes(['services/web/scripts/build-assets.js'])
        run.assert_called_once_with('up','-d','--no-deps','--force-recreate','node_web')
    @patch.object(watcher,'run')
    def test_environment_changes_validate_schema_before_recreation(self,run):
        watcher.apply_changes(['docker-compose-devenv.yml'])
        self.assertEqual([call('run','--rm','--no-deps','migrate'),call('up','-d','--no-deps','--force-recreate',*watcher.SERVICES)],run.call_args_list)
        self.assertNotIn('web',watcher.SERVICES)
    @patch.object(watcher,'run')
    @patch.object(watcher.subprocess,'run')
    def test_gateway_rebuild_does_not_depend_on_an_application_framework(self,build,run):
        watcher.apply_changes(['services/cable/package-lock.json'])
        self.assertIn('--memory=192m',build.call_args.args[0]);run.assert_called_once_with('up','-d','--no-deps','--force-recreate','cable')
        self.assertIsNone(watcher.action_for('services/cable/README.md'))
    @patch.object(watcher,'run')
    def test_router_is_validated_before_reload(self,run):
        watcher.apply_changes(['services/router/default.conf'])
        self.assertEqual([call('exec','-T','router','nginx','-t'),call('exec','-T','router','nginx','-s','reload')],run.call_args_list)
    @patch.object(watcher,'run',side_effect=subprocess.CalledProcessError(1,'nginx'))
    def test_invalid_router_config_is_not_reloaded(self,run):
        with self.assertRaises(subprocess.CalledProcessError):watcher.apply_changes(['services/router/default.conf'])
        run.assert_called_once()
if __name__=='__main__':unittest.main()

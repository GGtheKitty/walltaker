import importlib.util
from pathlib import Path
import subprocess
import unittest
from unittest.mock import call, patch

spec = importlib.util.spec_from_file_location(
    "devenv_watch", Path(__file__).resolve().parents[2] / "scripts/devenv-watch.py"
)
watcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(watcher)


class PreviewWatcherTest(unittest.TestCase):
    def test_source_reloads_do_not_recreate_containers(self):
        for path in ("app/controllers/links_controller.rb",
                     "app/assets/stylesheets/application.css", "services/e621-media/src/server.js",
                     "services/wallpaper-api/src/server.js"):
            self.assertIsNone(watcher.action_for(path))

    def test_config_migrations_and_dependencies_need_updates(self):
        self.assertEqual("restart_web", watcher.action_for("config/initializers/anycable.rb"))
        self.assertEqual("restart_web", watcher.action_for("db/migrate/123_example.rb"))
        self.assertEqual("build_web", watcher.action_for("Gemfile.lock"))
        self.assertEqual("build_media", watcher.action_for("services/e621-media/package.json"))
        self.assertEqual("build_api", watcher.action_for("services/wallpaper-api/package-lock.json"))
        self.assertEqual("build_accounts", watcher.action_for("services/accounts/package-lock.json"))

    @patch.object(watcher, "run")
    @patch.object(watcher.subprocess, "run", side_effect=subprocess.CalledProcessError(1, "docker"))
    def test_failed_cable_build_restores_web_and_has_bounded_memory(self, build, run):
        with self.assertRaises(subprocess.CalledProcessError):
            watcher.apply_changes(["services/anycable/native_presence.go"])
        self.assertEqual([call("stop", "web"), call("up", "-d", "--no-deps", "web")], run.call_args_list)
        self.assertIn("--memory=768m", build.call_args.args[0])
        self.assertIn("--memory-swap=768m", build.call_args.args[0])

    def test_cable_documentation_does_not_trigger_a_server_rebuild(self):
        self.assertIsNone(watcher.action_for("services/anycable/README.md"))
        self.assertEqual("build_cable", watcher.action_for("services/anycable/liveness.patch"))

    @patch.object(watcher, "run")
    def test_tracker_source_restarts_without_reinstalling_gems(self, run):
        watcher.apply_changes(["nuttracker/app/controllers/nuttracker/orgasms_controller.rb"])
        run.assert_called_once_with("up", "-d", "--no-deps", "--force-recreate", "web")

    @patch.object(watcher, "run")
    def test_views_compile_once_without_restarting_rails(self, run):
        paths = ["app/views/help/index.html.erb", "app/views/links/index.json.jbuilder",
                 "nuttracker/app/views/nuttracker/orgasms/_form.html.erb"]
        for path in paths:
            self.assertEqual("compile_views", watcher.action_for(path))
        watcher.apply_changes(paths)
        run.assert_called_once_with("exec", "-T", "web", "bundle", "exec", "ruby", "scripts/compile-node-views.rb")

    @patch.object(watcher, "run")
    def test_combined_changes_build_before_recreating(self, run):
        watcher.apply_changes(["Gemfile.lock", "docker-compose-devenv.yml",
                               "services/e621-media/package.json"])
        self.assertEqual([
            call("build", "web"),
            call("build", "e621_media"),
            call("up", "-d", "--no-deps", "--force-recreate", *watcher.SERVICES),
        ], run.call_args_list)

    @patch.object(watcher, "run")
    def test_router_changes_are_validated_before_reload(self, run):
        watcher.apply_changes(["services/router/default.conf"])
        self.assertEqual(("exec", "-T", "router", "nginx", "-t"), run.call_args_list[0].args)
        self.assertEqual(("exec", "-T", "router", "nginx", "-s", "reload"), run.call_args_list[1].args)

    @patch.object(watcher, "run", side_effect=subprocess.CalledProcessError(1, "nginx"))
    def test_invalid_router_config_does_not_reload(self, run):
        with self.assertRaises(subprocess.CalledProcessError):
            watcher.apply_changes(["services/router/default.conf"])
        run.assert_called_once()


if __name__ == "__main__":
    unittest.main()

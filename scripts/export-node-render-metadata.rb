# Run with bundle exec rails runner scripts/export-node-render-metadata.rb
# Public routing/model/asset metadata only; no records or secrets.
require 'json'
helper = ApplicationController.helpers
routes = Rails.application.routes.named_routes.to_h.transform_values { |route| route.path.spec.to_s }
engine_routes = Nuttracker::Engine.routes.named_routes.to_h.transform_values { |route| '/nut' + route.path.spec.to_s }
models = %w[User Link PastLink Comment Notification Message MessageThread MessageThreadParticipant Friendship Leash Surrender Kink KinkHaver Profile UserIcon WallpaperClient Report NutPledge InviteCode EmojiLinkDecoration ProfileDomain BannedIp Scoop HistoryEvent Ahoy::Visit Ahoy::Event Nuttracker::Orgasm].to_h do |name|
  model = name.constantize.model_name
  [name, {param_key: model.param_key, route_key: model.route_key, singular_route_key: model.singular_route_key, singular: model.singular, element: model.element, collection: model.collection}]
end
metadata = {routes:, engine_routes:, models:, assets: Rails.application.assets_manifest.assets, asset_prefix: Rails.application.config.assets.prefix,
  importmap: JSON.parse(Rails.application.importmap.to_json(resolver: helper)),
  preloads: Rails.application.importmap.preloaded_module_paths(resolver: helper)}
path = Rails.root.join('services/wallpaper-api/src/rendering/metadata.json')
metadata.merge!(JSON.parse(File.read(path)).slice('inline_svgs', 'lizard_descriptions', 'global_id_app')) if path.exist?
temporary = path.to_s + '.tmp-' + Process.pid.to_s
File.write(temporary, JSON.generate(metadata))
File.rename(temporary, path)
puts 'Exported public route and asset metadata for Node rendering.'

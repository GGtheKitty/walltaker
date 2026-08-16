require_relative "boot"

require "uri"
require "rails/all"

# Require the gems listed in Gemfile, including any gems
# you've limited to :test, :development, or :production.
Bundler.require(*Rails.groups)

module Walltaker
  class Application < Rails::Application
    # Initialize configuration defaults for originally generated Rails version.
    config.load_defaults 7.0

    # Please, add to the `ignore` list any other `lib` subdirectories that do
    # not contain `.rb` files, or that should not be reloaded or eager loaded.
    # Common ones are `templates`, `generators`, or `middleware`, for example.
    config.autoload_lib(ignore: %w[assets tasks])

    # Configuration for the application, engines, and railties goes here.
    #
    # These settings can be overridden in specific environments using the files
    # in config/environments, which are processed later.
    #
    # config.time_zone = "Central Time (US & Canada)"
    config.eager_load_paths << Rails.root.join("scrubbers")
    config.eager_load_paths << Rails.root.join("services")
    configured_host = URI.parse(ENV.fetch("WALLTAKER_BASE_URL", "https://walltaker.joi.how")).host
    Rails.application.config.hosts << configured_host if configured_host.present?
    Rails.application.config.hosts << ENV["WALLTAKER_HOST"] if ENV["WALLTAKER_HOST"].present?
    Rails.application.config.hosts << "joi.how"
    Rails.application.config.hosts << "walltaker.joi.how"
  end
end

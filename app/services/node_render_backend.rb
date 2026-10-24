require 'net/http'
require 'openssl'
require 'json'

# HTTP orchestration stays with existing controllers. Template execution and all
# HTML helpers are native Node; this adapter sends loaded presentation values.
class NodeRenderBackend
  class Unavailable < StandardError; end
  PRIVATE_KEYS = %w[password_digest password password_confirmation current_password password_reset_token password_reset_sent_at].freeze
  def self.enabled?
    return false unless ENV['RENDER_BACKEND_URL'].present?
    return true if ENV['NODE_RENDER_ACTIVE'] == 'true'
    controller = NodeBrowserCurrent.controller
    supplied = controller&.request&.headers&.[]('X-Walltaker-Node-Render').to_s
    expected = OpenSSL::HMAC.hexdigest('SHA256', Rails.application.secret_key_base, 'walltaker:rendering:preview:v1')
    supplied.present? && ActiveSupport::SecurityUtils.secure_compare(supplied, expected)
  end
  def self.request(document)
    uri = URI.join(ENV.fetch('RENDER_BACKEND_URL'), '/_internal/rendering/render')
    request = Net::HTTP::Post.new(uri)
    request['Authorization'] = "Bearer #{OpenSSL::HMAC.hexdigest('SHA256', Rails.application.secret_key_base, 'walltaker:rendering:v1')}"
    request['Content-Type'] = 'application/json'; request.body = JSON.generate(document)
    response = Net::HTTP.start(uri.host, uri.port, open_timeout: 3, read_timeout: 45) { |http| http.request(request) }
    raise Unavailable, 'Page rendering is temporarily unavailable. Please try again.' unless response.is_a?(Net::HTTPSuccess)
    JSON.parse(response.body)
  rescue IOError, SystemCallError, Timeout::Error, SocketError, JSON::ParserError => error
    Rails.logger.warn("Node renderer unavailable: #{error.class}")
    raise Unavailable, 'Page rendering is temporarily unavailable. Please try again.'
  end
  def self.render(view, template:, partial: false, locals: {}, layout: nil, status: nil)
    request(Document.new(view).build(template:, partial:, locals:, layout:, status:)).fetch('html').html_safe
  end
  def self.public_metadata
    @public_metadata ||= begin
      helper = ApplicationController.helpers
      { assets: Rails.application.assets_manifest.assets, asset_prefix: Rails.application.config.assets.prefix,
        routes: Rails.application.routes.named_routes.to_h.transform_values { |route| route.path.spec.to_s },
        engine_routes: Nuttracker::Engine.routes.named_routes.to_h.transform_values { |route| '/nut' + route.path.spec.to_s },
        importmap: JSON.parse(Rails.application.importmap.to_json(resolver: helper)),
        preloads: Rails.application.importmap.preloaded_module_paths(resolver: helper) }
    end
  end
  def self.turbo_document(view, action:, target: nil, targets: nil, **options)
    document = Document.new(view).build(template: options[:partial] || options[:template], partial: true,
      locals: options[:locals] || {}, layout: nil, status: 200)
    document.merge!(action: action.to_s, target:, targets:)
    document[:html] = options[:html].to_s if options.key?(:html)
    document
  end
  def self.broadcast(stream:, **options)
    document = turbo_document(NodeBrowserCurrent.controller || ApplicationController.new, **options)
    request(document.merge(operation: 'broadcast', stream:))
    true
  end
  class TurboBuilder
    def initialize(view) = @view = view
    def method_missing(action, target = nil, **options, &block)
      return super unless %i[append prepend replace update remove before after refresh].include?(action)
      target = ActionView::RecordIdentifier.dom_id(target) if target.respond_to?(:to_key)
      options[:html] = @view.capture(&block) if block
      document = NodeRenderBackend.turbo_document(@view, action:, target:, **options)
      NodeRenderBackend.request(document.merge(operation: 'turbo')).fetch('html').html_safe
    end
    def respond_to_missing?(method, include_private = false) = %i[append prepend replace update remove before after refresh].include?(method) || super
  end

  class Document
    def initialize(view)
      @view = view
      @controller = view.respond_to?(:controller) ? view.controller : view
      @records = {}
      @depth = 0
    end
    def encode(value)
      case value
      when ActiveRecord::Base then record(value)
      when ActiveSupport::SafeBuffer then { '$html'=>value.to_s }
      when ActionController::Parameters then encode(value.to_unsafe_h)
      when Hash
        if value.keys.all? { |key| key.is_a?(String) || key.is_a?(Symbol) || key.is_a?(Numeric) }
          { '$object'=>value.map { |key, val| [key.to_s, encode(val)] } }
        else
          { '$map'=>value.map { |key, val| [encode(key), encode(val)] } }
        end
      when Array then value.map { |item| encode(item) }
      when Time, DateTime, ActiveSupport::TimeWithZone then { '$time'=>value.iso8601(6) }
      when Date then { '$time'=>value.iso8601 }
      when String, Numeric, TrueClass, FalseClass, NilClass then value
      when Symbol then value.to_s
      when Pagy
        { count: value.count, page: value.page, items: value.items, pages: value.pages, page_param: value.vars[:page_param] }
      when ProfileSelectorForm, ProfileRenameForm, ProfileAdderForm
        { '$ref'=>form(value) }
      when NewsEntry then encode(value.as_json)
      when Class then { '$constant'=>value.name }
      when Struct then encode(value.to_h)
      else
        if value.is_a?(ActiveRecord::Relation)
          raise Unavailable, 'Render data must be loaded by Node.' unless value.loaded?
          encode(value.to_a)
        elsif value.is_a?(ActiveModel::Errors)
          { messages: encode(value.messages), full_messages: value.full_messages }
        else
          nil
        end
      end
    end
    def form(value)
      key = "#{value.class.name}:new:#{value.object_id}"
      attributes = %w[profile_id name].filter_map { |name| [name, encode(value.public_send(name))] if value.respond_to?(name) }.to_h
      @records[key] = { type: value.class.name, attributes:, meta: { new_record: true } }
      key
    end
    def record(value)
      key = "#{value.class.name}:#{value.id || "new:#{value.object_id}"}"
      return { '$ref'=>key } if @records.key?(key)
      raise Unavailable, 'Render graph is too large.' if @records.size >= 15_000
      item = { type: value.class.name, attributes: {}, associations: {}, meta: {} }
      @records[key] = item
      item[:attributes] = encode(value.attributes.except(*PRIVATE_KEYS))
      item[:meta] = { new_record: value.new_record?, destroyed: value.destroyed?, errors: encode(value.errors), graph: value.instance_variable_defined?(:@node_browser_graph) }
      value.instance_variable_get(:@association_cache).each do |name, association|
        item[:associations][name] = encode(association.target) if association.loaded?
      end
      %i[connected recent_sets].each do |name|
        variable = "@node_browser_#{name}"
        item[:meta][name] = encode(value.instance_variable_get(variable)) if value.instance_variable_defined?(variable)
      end
      item[:meta][:fork_count] = value.fork_count if value.is_a?(Link) && value.respond_to?(:fork_count)
      item[:meta][:number_of_users] = value.number_of_users if value.is_a?(Profile) && value.instance_variable_defined?(:@node_browser_graph)
      item[:meta][:valid] = value.valid? if value.is_a?(Surrender) && value.instance_variable_defined?(:@node_browser_graph)
      { '$ref'=>key }
    end
    def build(template:, partial:, locals:, layout:, status:)
      controller = @controller
      request = controller&.request
      current = controller&.send(:current_user) if request && controller.respond_to?(:current_user, true)
      surrender = controller&.send(:current_surrender_session) if current && controller.respond_to?(:current_surrender_session, true)
      assigns = @view.respond_to?(:assigns) ? @view.assigns : controller.view_assigns
      assigns = assigns.except('node_browser_context', 'current_user', 'current_surrender_session', 'e621')
      context = { base_url: SiteConfig.base_url, path: request&.path || '/', original_url: request&.original_url,
        referrer: (request&.referer if request&.referer.to_s.match?(%r{\Ahttps?://}i)),
        controller_path: controller&.controller_path, action_name: controller&.action_name,
        engine: controller&.class&.name.to_s.start_with?('Nuttracker::') ? 'nuttracker' : nil,
        format: request&.format&.symbol.to_s, status: status || controller&.response&.status || 200,
        turbo_frame: request&.headers&.[]('Turbo-Frame').present?, route_parameters: encode(request&.path_parameters || {}),
        parameters: encode((request&.parameters || {}).except(*PRIVATE_KEYS, 'authenticity_token', 'api_key')),
        flash: encode(request ? controller&.flash&.to_hash || {} : {}), current_user: encode(current), surrender: encode(surrender),
        flags: NodeBrowserBackend.context&.data&.fetch('flags', {}) || {},
        environment: Rails.env.to_s,
        env: ENV.to_h.slice('COMMIT_HASH', 'COMMIT_LINK', 'RELEASE_CREATED_AT'),
        clients: encode(controller&.instance_variable_get(:@recognized_wallpaper_clients) || NodeBrowserBackend.context&.graph&.clients || []),
        decorations: encode(controller&.instance_variable_get(:@emoji_link_decorations) || {}),
        asset_versions: %w[public/base.css public/user-profile.css].to_h { |path| [path, Rails.root.join(path).mtime.to_i] } }
      context[:next_step] = controller.send(:next_step).to_s if controller&.controller_path == 'link_wizard' && controller.respond_to?(:next_step, true)
      context[:render_metadata] = NodeRenderBackend.public_metadata if request
      context[:csrf_token] = controller.send(:form_authenticity_token) if request && controller.respond_to?(:form_authenticity_token, true) && !request.path.start_with?('/_internal/')
      { template:, partial:, layout:, assigns: encode(assigns), locals: encode(locals), context:, records: @records }
    end
  end
end

require 'net/http'
require 'openssl'
require 'json'

class NodeBrowserBackend
  class Unavailable < StandardError; end
  class Rejected < StandardError
    attr_reader :status, :errors
    def initialize(status, body)
      @status = status; @errors = body['errors'] || { 'base'=>[body['message'] || 'Browser request failed.'] }
      super(body['message'] || 'Browser request failed.')
    end
  end
  def self.enabled? = ENV['BROWSER_BACKEND_URL'].present?
  def self.controller = NodeBrowserCurrent.controller
  def self.request(operation, input = {}, cookie: nil, **keywords)
    input = input.merge(keywords)
    request_context = controller&.request
    metadata = request_context ? { ip: request_context.remote_ip, method: request_context.request_method, path: request_context.path,
      origin: request_context.headers['Origin'], request_key: "browser:#{request_context.request_id}" } : {}
    uri = URI.join(ENV.fetch('BROWSER_BACKEND_URL'), "/_internal/browser/#{operation}")
    request = Net::HTTP::Post.new(uri)
    request['Authorization'] = "Bearer #{OpenSSL::HMAC.hexdigest('SHA256', Rails.application.secret_key_base, 'walltaker:browser:commands:v1')}"
    request['Content-Type'] = 'application/json'
    request['Cookie'] = cookie || request_context&.headers&.fetch('Cookie', nil) || ''
    request.body = JSON.generate(metadata.merge(input))
    response = Net::HTTP.start(uri.host, uri.port, open_timeout: 3, read_timeout: 30) { |http| http.request(request) }
    body = JSON.parse(response.body)
    raise Rejected.new(response.code.to_i, body) if response.code.to_i.between?(400, 499)
    raise Unavailable, 'The website is temporarily unavailable. Please try again.' unless response.is_a?(Net::HTTPSuccess)
    body
  rescue IOError, SystemCallError, Timeout::Error, SocketError, JSON::ParserError => error
    Rails.logger.warn("Node browser backend unavailable: #{error.class}")
    raise Unavailable, 'The website is temporarily unavailable. Please try again.'
  end
  def self.page(operation, **input) = Page.new(request(operation, input))
  def self.context = controller&.send(:node_browser_context)
  def self.user(identifier, private: false)
    key = identifier.to_s.match?(/\A[1-9]\d*\z/) ? :user_id : :username
    page = page('user', **{ key=>identifier, :private=>private })
    page.user
  end
  def self.link(identifier, purpose: 'show') = page('link', identifier:, purpose:).link
  def self.find(model, id)
    case model.name
    when 'User' then user(id)
    when 'Link' then link(id)
    when 'Profile' then page('profile-style', profile_id: id).profile
    when 'MessageThread' then page('thread', thread_id: id).thread
    else hydrate(model, [{ 'id'=>id }]).first || raise(ActiveRecord::RecordNotFound)
    end
  rescue Rejected => error
    raise ActiveRecord::RecordNotFound if error.status == 404
    raise
  end
  def self.hydrate(model, rows)
    return [] if rows.blank?
    key = NodeBrowserGraph.key(model)
    return rows.map { |row| model.instantiate(row) } unless key
    data = request('hydrate', ids: { key=>rows.map { |row| row.fetch('id') }.uniq })
    graph = NodeBrowserGraph.new(data.fetch('graph'))
    install_graph(graph)
    graph.overlay(model, rows)
  end
  def self.event_graph(event)
    kind = event.class.name.delete_prefix('Node').delete_suffix('Event').underscore
    graph = NodeBrowserGraph.new(request('event-data', kind:, event_id: event.id).fetch('graph'))
    install_graph(graph)
    graph
  end
  def self.graph(ids)
    graph = NodeBrowserGraph.new(request('hydrate', ids:).fetch('graph'))
    install_graph(graph)
    graph
  end
  def self.install_graph(graph)
    return unless controller
    existing = controller.instance_variable_get(:@emoji_link_decorations) || {}
    controller.instance_variable_set(:@emoji_link_decorations, existing.merge(graph.decorations))
    controller.instance_variable_set(:@recognized_wallpaper_clients, graph.clients)
  end
  def self.reload_record(record)
    fresh = case record.class.name
    when 'User' then user(record.id, private: record.has_attribute?(:api_key))
    when 'Link' then link(record.id)
    else find(record.class, record.id)
    end
    record.instance_variable_set(:@attributes, fresh.instance_variable_get(:@attributes))
    record.instance_variable_set(:@association_cache, fresh.instance_variable_get(:@association_cache))
    fresh.instance_variables.grep(/\A@node_browser_/).each { |key| record.instance_variable_set(key, fresh.instance_variable_get(key)) }
    record.clear_changes_information
    record
  end
  class Page
    attr_reader :data, :graph
    def initialize(data)
      @data = data; @graph = NodeBrowserGraph.new(data.fetch('graph', {})); NodeBrowserBackend.install_graph(@graph)
    end
    def user = graph.find(User, data['user_id'] || data.dig('user', 'id'))
    def link = graph.find(Link, data.fetch('link_id'))
    def profile = graph.find(Profile, data.fetch('profile_id'))
    def thread = graph.find(MessageThread, data.fetch('thread_id'))
    def links = Array(data['link_ids']).filter_map { |id| graph.find(Link, id) }
    def past_links = Array(data['past_link_ids']).filter_map { |id| graph.find(PastLink, id) }
    def profiles = Array(data['profile_ids']).filter_map { |id| graph.find(Profile, id) }
    def surrender = (graph.find(Surrender, data.dig('surrender', 'id')) if data['surrender'])
  end
end

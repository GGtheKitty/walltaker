require 'net/http'
require 'openssl'
require 'json'

class NodeActivityBackend
  class Unavailable < StandardError; end
  class Rejected < StandardError
    attr_reader :status
    def initialize(status, message)
      @status = status
      super(message)
    end
  end

  def self.enabled?
    ENV['ACTIVITY_BACKEND_URL'].present?
  end

  def self.request(operation, input = {})
    uri = URI.join(ENV.fetch('ACTIVITY_BACKEND_URL'), "/_internal/activity/#{operation}")
    request = Net::HTTP::Post.new(uri)
    request['Authorization'] = "Bearer #{OpenSSL::HMAC.hexdigest('SHA256', Rails.application.secret_key_base, 'walltaker:activity:commands:v1')}"
    request['Content-Type'] = 'application/json'
    request.body = JSON.generate(input)
    response = Net::HTTP.start(uri.host, uri.port, open_timeout: 3, read_timeout: 15) { |http| http.request(request) }
    body = JSON.parse(response.body)
    raise Rejected.new(response.code.to_i, body['message'] || 'Activity request failed.') if response.code.to_i.between?(400, 499)
    raise Unavailable unless response.is_a?(Net::HTTPSuccess)
    body
  rescue IOError, SystemCallError, Timeout::Error, SocketError, JSON::ParserError => error
    Rails.logger.warn("Node activity backend unavailable: #{error.class}")
    raise Unavailable, 'Activity is temporarily unavailable.'
  end

  def self.visit_proof(visit)
    return unless visit&.id
    { id: visit.id, visit_token: visit.visit_token, visitor_token: visit.visitor_token }
  end

  # Never call as_json on a record or exception: it can serialize credential
  # columns or private request content into an otherwise harmless event.
  def self.safe_properties(value, depth = 0)
    return '[TRUNCATED]' if depth > 5
    case value
    when Hash
      value.first(100).to_h.transform_values { |v| safe_properties(v, depth + 1) }
    when Array
      value.first(100).map { |v| safe_properties(v, depth + 1) }
    when String, Numeric, TrueClass, FalseClass, NilClass
      value
    else
      value.respond_to?(:id) ? { id: value.id } : value.class.name
    end
  end

  class History
    attr_reader :events, :clients, :decorations
    def initialize(data)
      page = NodeDiscoveryBackend::Page.new(data)
      links = page.links.index_by(&:id)
      users = ((defined?(NodeBrowserBackend) && NodeBrowserBackend.enabled?) ? NodeBrowserBackend.hydrate(User, data.fetch('users')) : data.fetch('users').map { |row| User.instantiate(row) }).index_by(&:id)
      visits = data.fetch('visits').map { |row| Ahoy::Visit.instantiate(row) }.index_by(&:id)
      records = data.fetch('events').map do |row|
        HistoryEvent.instantiate(row).tap do |record|
          record.association(:user).target = users.fetch(record.user_id)
          record.association(:surrender_controller).target = users[record.surrender_controller_id]
          record.association(:ahoy_visit).target = visits[record.ahoy_visit_id]
          record.association(:link).target = links[record.link_id]
        end
      end
      @events = records.group_by(&:ahoy_visit).sort_by { |visit, list| visit&.started_at || list.last.created_at }.reverse
      @clients = page.recognized_clients
      @decorations = page.decorations
    end
  end
end

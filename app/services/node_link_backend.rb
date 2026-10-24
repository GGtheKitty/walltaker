require 'net/http'
require 'openssl'
require 'securerandom'

class NodeLinkBackend
  class Unavailable < StandardError; end
  class Rejected < StandardError
    attr_reader :status, :errors
    def initialize(status, body)
      @status = status
      @errors = body['errors'] || { 'base' => [body['message'] || 'Link request failed.'] }
      super(body['message'] || 'Link request failed.')
    end
  end

  def self.enabled?
    ENV['LINK_MANAGEMENT_URL'].present?
  end

  def self.request(operation, input)
    uri = URI.join(ENV.fetch('LINK_MANAGEMENT_URL'), "/_internal/links/#{operation}")
    token = OpenSSL::HMAC.hexdigest('SHA256', Rails.application.secret_key_base, 'walltaker:links:commands:v1')
    request = Net::HTTP::Post.new(uri)
    request['Authorization'] = "Bearer #{token}"
    request['Content-Type'] = 'application/json'
    request.body = input.to_json
    response = Net::HTTP.start(uri.host, uri.port, open_timeout: 3, read_timeout: 15) { |http| http.request(request) }
    body = JSON.parse(response.body)
    raise Rejected.new(response.code.to_i, body) if response.code.to_i.between?(400, 499)
    raise Unavailable, 'Link management is temporarily unavailable. Please retry.' unless response.is_a?(Net::HTTPSuccess)

    body
  rescue IOError, SystemCallError, Timeout::Error, SocketError, JSON::ParserError => error
    Rails.logger.warn("Node link management failed: #{error.class}")
    raise Unavailable, 'Link management is temporarily unavailable. Please retry.'
  end

  def self.list(actor:)
    rows = request('list', actor_id: actor.id).fetch('links')
    (defined?(NodeBrowserBackend) && NodeBrowserBackend.enabled?) ? NodeBrowserBackend.hydrate(Link, rows) : rows.map { |row| Link.instantiate(row) }
  end

  def self.save(link:, actor:, attributes:, request_key: SecureRandom.uuid, surrender_id: nil, ahoy_visit_id: nil)
    operation = link.new_record? ? 'create' : 'update'
    result = request(operation, { actor_id: actor.id, link_id: link.id, attributes: attributes.to_h,
      request_key:, surrender_id:, ahoy_visit_id: })
    (defined?(NodeBrowserBackend) && NodeBrowserBackend.enabled?) ? NodeBrowserBackend.hydrate(Link, [result.fetch('link')]).first : Link.instantiate(result.fetch('link'))
  rescue Rejected, Unavailable => error
    details = error.is_a?(Rejected) ? error.errors : { 'base' => [error.message] }
    details.each { |key, messages| Array(messages).each { |message| link.errors.add(key, message) } }
    nil
  end

  def self.command(operation, actor:, link: nil, request_key: SecureRandom.uuid, surrender_id: nil, **attributes)
    request(operation, { actor_id: actor.id, link_id: link&.id, request_key:, surrender_id:, **attributes })
  end

  def self.export(link:)
    request('export', link_id: link.id).fetch('text')
  end
end

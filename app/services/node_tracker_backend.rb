require 'net/http'
require 'openssl'
require 'json'
require 'securerandom'

class NodeTrackerBackend
  class Unavailable < StandardError; end
  class Rejected < StandardError
    attr_reader :status, :errors
    def initialize(status, body)
      @status = status
      @errors = body['errors'] || { 'base' => [body['message'] || 'Tracker request failed.'] }
      super(body['message'] || 'Tracker request failed.')
    end
  end
  def self.enabled?
    ENV['TRACKER_BACKEND_URL'].present?
  end
  def self.request(operation, input = {})
    uri = URI.join(ENV.fetch('TRACKER_BACKEND_URL'), "/_internal/tracker/#{operation}")
    request = Net::HTTP::Post.new(uri)
    request['Authorization'] = "Bearer #{OpenSSL::HMAC.hexdigest('SHA256', Rails.application.secret_key_base, 'walltaker:tracker:commands:v1')}"
    request['Content-Type'] = 'application/json'
    request.body = JSON.generate(input)
    response = Net::HTTP.start(uri.host, uri.port, open_timeout: 3, read_timeout: 20) { |http| http.request(request) }
    body = JSON.parse(response.body)
    raise Rejected.new(response.code.to_i, body) if response.code.to_i.between?(400, 499)
    raise Unavailable unless response.is_a?(Net::HTTPSuccess)
    body
  rescue IOError, SystemCallError, Timeout::Error, SocketError, JSON::ParserError => error
    Rails.logger.warn("Node tracker backend unavailable: #{error.class}")
    raise Unavailable, 'Tracker features are temporarily unavailable. Please try again.'
  end
  def self.command(operation, actor:, request_key: SecureRandom.uuid, surrender_id: nil, **input)
    request(operation, { actor_id: actor.id, request_key:, surrender_id:, **input })
  end
  def self.records(result, key, model)
    return NodeBrowserBackend.hydrate(model, result.fetch(key).map { |row| row.except('is_starred') }) if defined?(NodeBrowserBackend) && NodeBrowserBackend.enabled?
    result.fetch(key).map { |attributes| model.instantiate(attributes) }
  end
end

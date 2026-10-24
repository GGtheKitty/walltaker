require 'net/http'
require 'openssl'
require 'json'
require 'securerandom'

# Compatibility entry points for existing Rails call sites. Node owns the
# schedules, persisted jobs, retries and newsroom state; Rails renders HTML.
class NodeAutomationBackend
  class Unavailable < StandardError; end

  def self.enabled?
    ENV['AUTOMATION_BACKEND_URL'].present?
  end

  def self.request(operation, input = {})
    uri = URI.join(ENV.fetch('AUTOMATION_BACKEND_URL'), "/_internal/automation/#{operation}")
    request = Net::HTTP::Post.new(uri)
    request['Authorization'] = "Bearer #{OpenSSL::HMAC.hexdigest('SHA256', Rails.application.secret_key_base, 'walltaker:automation:commands:v1')}"
    request['Content-Type'] = 'application/json'
    request.body = JSON.generate(input)
    response = Net::HTTP.start(uri.host, uri.port, open_timeout: 3, read_timeout: 15) { |http| http.request(request) }
    raise Unavailable unless response.is_a?(Net::HTTPSuccess)
    JSON.parse(response.body)
  rescue IOError, SystemCallError, Timeout::Error, SocketError, JSON::ParserError => error
    Rails.logger.warn("Node automation unavailable: #{error.class}")
    raise Unavailable, 'Background automation is temporarily unavailable.'
  end

  def self.round(bot, request_key: SecureRandom.uuid)
    request('round', bot:, request_key:)
  end

  def self.enqueue_news(news_entry_json, request_key:, transitioning: false, done: false)
    request('news-entry', entry: JSON.parse(news_entry_json), request_key:, phase: transitioning.to_s, done:)
  end
end

require 'net/http'
require 'openssl'
require 'json'
require 'securerandom'

class NodeModerationBackend
  class Unavailable < StandardError; end
  class Rejected < StandardError
    attr_reader :status, :errors
    def initialize(status, body)
      @status = status
      @errors = body['errors'] || { 'base' => [body['message'] || 'Moderation request failed.'] }
      super(body['message'] || 'Moderation request failed.')
    end
  end
  def self.enabled?
    ENV['MODERATION_BACKEND_URL'].present?
  end
  def self.request(operation, input = {})
    uri = URI.join(ENV.fetch('MODERATION_BACKEND_URL'), "/_internal/moderation/#{operation}")
    request = Net::HTTP::Post.new(uri)
    request['Authorization'] = "Bearer #{OpenSSL::HMAC.hexdigest('SHA256', Rails.application.secret_key_base, 'walltaker:moderation:commands:v1')}"
    request['Content-Type'] = 'application/json'
    request.body = JSON.generate(input)
    response = Net::HTTP.start(uri.host, uri.port, open_timeout: 3, read_timeout: 20) { |http| http.request(request) }
    body = JSON.parse(response.body)
    raise Rejected.new(response.code.to_i, body) if response.code.to_i.between?(400, 499)
    raise Unavailable unless response.is_a?(Net::HTTPSuccess)
    body
  rescue IOError, SystemCallError, Timeout::Error, SocketError, JSON::ParserError => error
    Rails.logger.warn("Node moderation backend unavailable: #{error.class}")
    raise Unavailable, 'Moderation features are temporarily unavailable. Please try again.'
  end
  def self.domain_rules
    request('domain-rules').fetch('rules')
  end

  def self.domain_decision(hostname, rules: domain_rules)
    labels = hostname.split('.')
    candidates = ProfileDomainFilter.ip_address?(hostname) ? [hostname] : labels.each_index.map { |index| labels[index..].join('.') }
    row = candidates.lazy.filter_map { |domain| rules.find { |rule| rule['domain'] == domain && rule['status'] != 0 } }.first
    ProfileDomain.instantiate(row) if row
  end

  def self.scrub_page!(event)
    cursor = event.effects['scrub_cursor']
    profiles = request('domain-scrub-page', event_id: event.id, after_id: cursor).fetch('profiles')
    return true if profiles.empty?

    rules = domain_rules
    profiles.each do |profile|
      result = ProfileDomainFilter.filter(profile.fetch('content'), rules:)
      next if result.blocked_domains.empty? || result.content == profile['content']
      response = request('domain-scrub-save', event_id: event.id, profile_id: profile.fetch('id'),
        expected_content: profile.fetch('content'), content: result.content)
      # Re-read a changed profile on the next attempt; never overwrite a save
      # that arrived while the parser was preparing the scrubbed HTML.
      return false if !response['saved'] && response['exists']
    end
    event.update!(effects: event.effects.merge('scrub_cursor' => profiles.last.fetch('id')))
    false
  end

  def self.command(operation, actor:, request_key: SecureRandom.uuid, surrender_id: nil, **input)
    request(operation, { actor_id: actor.id, request_key:, surrender_id:, **input })
  end
  def self.records(result, key, model)
    return NodeBrowserBackend.hydrate(model, result.fetch(key).map { |row| row.except('is_starred') }) if defined?(NodeBrowserBackend) && NodeBrowserBackend.enabled?
    result.fetch(key).map { |attributes| model.instantiate(attributes) }
  end
end

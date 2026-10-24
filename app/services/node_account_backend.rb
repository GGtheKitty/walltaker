require 'net/http'
require 'openssl'
require 'json'
require 'securerandom'

class NodeAccountBackend
  class Unavailable < StandardError; end
  class Rejected < StandardError
    attr_reader :status, :errors
    def initialize(status, body)
      @status = status
      @errors = body['errors'] || { 'base' => [body['message'] || 'Account request failed.'] }
      super(body['message'] || 'Account request failed.')
    end
  end
  def self.enabled?
    ENV['ACCOUNTS_BACKEND_URL'].present?
  end
  def self.request(operation, input = {})
    uri = URI.join(ENV.fetch('ACCOUNTS_BACKEND_URL'), "/_internal/accounts/#{operation}")
    request = Net::HTTP::Post.new(uri)
    request['Authorization'] = "Bearer #{OpenSSL::HMAC.hexdigest('SHA256', Rails.application.secret_key_base, 'walltaker:accounts:commands:v1')}"
    request['Content-Type'] = 'application/json'
    request.body = JSON.generate(input)
    response = Net::HTTP.start(uri.host, uri.port, open_timeout: 3, read_timeout: 20) { |http| http.request(request) }
    body = JSON.parse(response.body)
    raise Rejected.new(response.code.to_i, body) if response.code.to_i.between?(400, 499)
    raise Unavailable unless response.is_a?(Net::HTTPSuccess)
    body
  rescue IOError, SystemCallError, Timeout::Error, SocketError, JSON::ParserError => error
    Rails.logger.warn("Node accounts unavailable: #{error.class}")
    raise Unavailable, 'Accounts are temporarily unavailable. Please try again.'
  end
  def self.command(operation, actor:, request_key: SecureRandom.uuid, surrender_id: nil, **input)
    request(operation, { actor_id: actor.id, request_key:, surrender_id:, **input })
  end
  def self.find_user(username)
    result = request('user', username:)
    user = User.instantiate(result.fetch('user'))
    user.association(:profile).target = result['profile'] && Profile.instantiate(result['profile'])
    user
  rescue Rejected => error
    raise ActiveRecord::RecordNotFound if error.status == 404
    raise
  end
end

require 'net/http'
require 'openssl'

class NodeE621
  class Unavailable < StandardError; end

  def self.enabled?
    ENV['E621_BACKEND_URL'].present?
  end

  def self.policy(link)
    return nil unless link

    aligned = link.check_ability('is_kink_aligned')
    {
      blacklist: link.blacklist, theme: link.theme, min_score: link.min_score,
      can_show_videos: !!link.check_ability('can_show_videos'), is_kink_aligned: !!aligned,
      kinks: aligned ? link.user.kinks.pluck(:name) : []
    }
  end

  def self.request(operation, input)
    uri = URI.join(ENV.fetch('E621_BACKEND_URL'), "/_internal/e621/#{operation}")
    token = OpenSSL::HMAC.hexdigest('SHA256', Rails.application.secret_key_base, 'walltaker:e621:commands:v1')
    request = Net::HTTP::Post.new(uri)
    request['Authorization'] = "Bearer #{token}"
    request['Content-Type'] = 'application/json'
    request.body = input.to_json
    response = Net::HTTP.start(uri.host, uri.port, open_timeout: 3, read_timeout: 25) { |http| http.request(request) }
    unless response.is_a?(Net::HTTPSuccess)
      Rails.logger.warn("Node e621 request failed: HTTP #{response.code}")
      raise Unavailable, 'e621 temporarily unavailable.'
    end
    JSON.parse(response.body)
  rescue IOError, SystemCallError, Timeout::Error, SocketError, JSON::ParserError => error
    Rails.logger.warn("Node e621 request failed: #{error.class}")
    raise Unavailable, 'e621 temporarily unavailable.'
  end
end

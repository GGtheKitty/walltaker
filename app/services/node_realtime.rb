require 'net/http'
require 'json'
require 'openssl'

class NodeRealtime
  KEYS = ['node:realtime:pending', 'node:realtime:versions'].freeze
  ENQUEUE = <<~LUA.freeze
    local v = redis.call('HINCRBY', KEYS[2], ARGV[1], 1)
    redis.call('ZADD', KEYS[1], ARGV[2], ARGV[1]); return v
  LUA

  def self.enabled?
    ENV['NODE_REALTIME_URL'].present?
  end

  # Publish intent only. Node builds the latest API payload after the database
  # commit; Redis keeps it pending until delivery succeeds.
  def self.enqueue(job)
    $redis.eval(ENQUEUE, keys: KEYS, argv: [job, (Time.now.to_f * 1000).to_i])
  end

  def self.poll(link, headers)
    uri = URI.join(ENV.fetch('NODE_REALTIME_URL').chomp('/') + '/', '_internal/realtime-rpc/poll')
    request = Net::HTTP::Post.new(uri)
    request['Content-Type'] = 'application/json'
    token = OpenSSL::HMAC.hexdigest('SHA256', Rails.application.secret_key_base, 'rpc-cable')
    request['Authorization'] = "Bearer #{token}"
    request.body = JSON.generate(id: link.id, headers: headers)
    response = Net::HTTP.start(uri.hostname, uri.port, open_timeout: 2, read_timeout: 5) { |http| http.request(request) }
    raise "Node presence returned #{response.code}" unless response.is_a?(Net::HTTPSuccess)
  end
end

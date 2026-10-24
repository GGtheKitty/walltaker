require 'net/http'
require 'openssl'
require 'securerandom'

class NodeWallpaperBackend
  class Unavailable < StandardError; end

  def self.enabled?
    ENV['WALLPAPER_BACKEND_URL'].present?
  end

  def self.apply(link:, post:, set_by: nil, request_key: SecureRandom.uuid, count_self: false, ahoy_visit_id: nil, activity: nil)
    return false unless (defined?(NodeBrowserBackend) && NodeBrowserBackend.enabled?) || link.valid?

    tags = %w[general character species lore copyright meta].flat_map { |kind| post.fetch('tags').fetch(kind, []) }.join(' ')
    tags += " rating:#{post.fetch('rating')}"
    policy = link.attributes.slice(*%w[user_id blacklist theme min_score friends_only never_expires expires])
    command = {
      request_key:, link_id: link.id, post_id: post.fetch('id'), set_by_id: set_by&.id,
      post_url: post.fetch('file').fetch('url'),
      post_thumbnail_url: post.dig('sample', 'url') || post.dig('preview', 'url'),
      post_description: post['description'] || '', tags:, count_self:, ahoy_visit_id:, expected_policy: policy
    }
    command[:activity] = activity if activity
    request('/_internal/wallpaper-updates', command)
    link.reload
    true
  rescue Unavailable => error
    link.errors.add(:base, error.message)
    false
  end

  def self.history(user:, kind: 'received', limit: 50)
    unless enabled?
      column = kind == 'sent' ? :set_by_id : :user_id
      return PastLink.where(column => user.id).order(id: :desc).limit(limit).to_a
    end

    rows = request("/_internal/wallpaper-history?#{URI.encode_www_form(user_id: user.id, kind:, limit:)}")
    return NodeBrowserBackend.hydrate(PastLink, rows.map { |row| row.slice(*PastLink.column_names) }) if (defined?(NodeBrowserBackend) && NodeBrowserBackend.enabled?)
    rows.map do |row|
      record = PastLink.instantiate(row.slice(*%w[id link_id user_id set_by_id e621_post_id post_url post_thumbnail_url tags created_at updated_at]))
      if row['set_by_id']
        record.association(:set_by).target = User.new(id: row['set_by_id'], username: row['set_by_username'])
      end
      record
    end
  end

  def self.react(link:, request_key: SecureRandom.uuid)
    return false unless (defined?(NodeBrowserBackend) && NodeBrowserBackend.enabled?) || link.valid?

    pending = link.changes.transform_values(&:last).except('response_type', 'response_text', 'updated_at')
    request('/_internal/wallpaper-reactions', {
      request_key:, link_id: link.id, type: link.response_type, text: link.response_text || '',
      expected_post_url: link.post_url_in_database
    })
    link.reload
    link.assign_attributes(pending)
    true
  rescue Unavailable => error
    link.errors.add(:base, error.message)
    false
  end

  def self.request(path, body = nil)
    uri = URI.join(ENV.fetch('WALLPAPER_BACKEND_URL'), path)
    token = OpenSSL::HMAC.hexdigest('SHA256', Rails.application.secret_key_base, 'walltaker:wallpaper-api:commands:v1')
    request = body ? Net::HTTP::Post.new(uri) : Net::HTTP::Get.new(uri)
    request['Authorization'] = "Bearer #{token}"
    request['Content-Type'] = 'application/json'
    request.body = body.to_json if body
    response = Net::HTTP.start(uri.host, uri.port, open_timeout: 3, read_timeout: 15) { |http| http.request(request) }
    raise Unavailable, 'Wallpaper backend temporarily unavailable. Please retry.' unless response.is_a?(Net::HTTPSuccess)

    JSON.parse(response.body)
  rescue IOError, SystemCallError, Timeout::Error, SocketError, JSON::ParserError => error
    Rails.logger.warn("Node wallpaper backend failed: #{error.class}")
    raise Unavailable, 'Wallpaper backend temporarily unavailable. Please retry.'
  end
  private_class_method :request
end

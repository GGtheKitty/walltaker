require 'net/http'
require 'openssl'
require 'json'

class NodeDiscoveryBackend
  class Unavailable < StandardError; end
  class Rejected < StandardError
    attr_reader :status, :errors
    def initialize(status, body)
      @status = status
      @errors = body['errors'] || { 'base' => [body['message'] || 'Discovery request failed.'] }
      super(body['message'] || 'Discovery request failed.')
    end
  end
  def self.enabled?
    ENV['DISCOVERY_BACKEND_URL'].present?
  end
  def self.request(operation, input = {})
    uri = URI.join(ENV.fetch('DISCOVERY_BACKEND_URL'), "/_internal/discovery/#{operation}")
    request = Net::HTTP::Post.new(uri)
    request['Authorization'] = "Bearer #{OpenSSL::HMAC.hexdigest('SHA256', Rails.application.secret_key_base, 'walltaker:discovery:commands:v1')}"
    request['Content-Type'] = 'application/json'
    request.body = JSON.generate(input)
    response = Net::HTTP.start(uri.host, uri.port, open_timeout: 3, read_timeout: 20) { |http| http.request(request) }
    body = JSON.parse(response.body)
    raise Rejected.new(response.code.to_i, body) if response.code.to_i.between?(400, 499)
    raise Unavailable unless response.is_a?(Net::HTTPSuccess)
    body
  rescue IOError, SystemCallError, Timeout::Error, SocketError, JSON::ParserError => error
    Rails.logger.warn("Node discovery backend unavailable: #{error.class}")
    raise Unavailable, 'Homepage, Browse and search are temporarily unavailable. Please try again.'
  end
  DailyChange = Struct.new(:username, :total, keyword_init: true)

  def self.page(operation, **input)
    Page.new(request(operation, input))
  end

  def self.recent_records
    page('recent').recent_posts
  end

  def self.viewing_users
    page('viewers').viewers
  end

  def self.broadcast_recent_posts
    Turbo::StreamsChannel.broadcast_replace_to 'dashboard_recent_posts', target: 'recent_posts',
      partial: 'dashboard/recent_posts', locals: { recent_posts: recent_records }
  end

  # Instantiate the Node-selected records solely for the existing templates.
  # Preloaded associations preserve their ordering and avoid per-card queries.
  class Page
    attr_reader :data
    def initialize(data)
      @data = data
      graph = data.fetch('graph', {})
      if defined?(NodeBrowserBackend) && NodeBrowserBackend.enabled?
        link_rows = Array(graph['parents']) + Array(graph['viewed']) + Array(data['links']) + Array(data['new_user_links'])
        user_rows = Array(graph['users']) + Array(data['viewers'])
        @browser_graph = NodeBrowserBackend.graph(users: user_rows.map { |r| r.fetch('id') }.uniq,
          links: link_rows.map { |r| r.fetch('id') }.uniq, past_links: Array(data['recent_posts']).map { |r| r.fetch('id') })
        @users = @browser_graph.records('users').index_by(&:id)
        @links = @browser_graph.records('links').index_by(&:id)
        return
      end
      @users = records(graph['users'], User).index_by(&:id)
      @kinks = records(graph['kinks'], Kink).index_by(&:id)
      memberships = records(graph['memberships'], KinkHaver)
      @kinks.each_value { |kink| kink.association(:kink_havers).target = memberships.select { |h| h.kink_id == kink.id } }
      leashes = records(graph['leashes'], Leash)
      @users.each_value do |user|
        owned = leashes.select { |l| l.pet_id == user.id && @users.key?(l.master_id) }
        user.association(:obeying_leashes).target = owned
        user.association(:masters).target = owned.map { |l| @users.fetch(l.master_id) }
        user.association(:kinks).target = memberships.select { |h| h.user_id == user.id }.filter_map { |h| @kinks[h.kink_id] }
      end
      all_links = Array(graph['parents']) + Array(graph['viewed']) + Array(data['links']) + Array(data['new_user_links'])
      @links = records(all_links, Link).index_by(&:id)
      abilities = records(graph['abilities'], LinkAbility).group_by(&:link_id)
      latest = records(graph['latest'], PastLink).group_by(&:link_id)
      @links.each_value do |link|
        link.association(:user).target = @users[link.user_id]
        link.association(:abilities).target = abilities.fetch(link.id, [])
        link.association(:past_links).target = latest.fetch(link.id, [])
        link.association(:forked_from).target = @links[link.forked_from_id]
      end
    end

    def links(key = 'links')
      data.fetch(key, []).map { |row| @links.fetch(row.fetch('id').to_i) }
    end

    def recent_posts
      return @browser_graph.overlay(PastLink, data.fetch('recent_posts', [])) if @browser_graph
      records(data['recent_posts'], PastLink).each { |post| post.association(:user).target = @users.fetch(post.user_id) }
    end

    def viewers
      return @browser_graph.overlay(User, data.fetch('viewers', [])) if @browser_graph
      records(data['viewers'], User).each { |user| user.association(:viewing_link).target = @links.fetch(user.viewing_link_id) }
    end

    def scoop
      row = data['recent_scoop']
      return unless row
      Scoop.instantiate(row).tap { |record| record.association(:user).target = @users.fetch(record.user_id) }
    end

    def clients(key = 'clients')
      records(data[key], WallpaperClient)
    end

    def recognized_clients
      records(data.fetch('graph', {})['clients'], WallpaperClient)
    end

    def decorations
      Array(data.fetch('graph', {})['decorations']).to_h { |row| [row.fetch('link_id').to_i, row.fetch('emoji')] }
    end

    private

    def records(rows, model)
      Array(rows).map { |row| model.instantiate(row) }
    end
  end
end

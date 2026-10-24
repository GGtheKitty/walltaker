class NodeBrowserGraph
  MODELS = { 'users'=>'User', 'links'=>'Link', 'profiles'=>'Profile', 'past_links'=>'PastLink', 'comments'=>'Comment',
    'messages'=>'Message', 'threads'=>'MessageThread', 'participants'=>'MessageThreadParticipant', 'friendships'=>'Friendship',
    'leashes'=>'Leash', 'surrenders'=>'Surrender', 'kinks'=>'Kink', 'memberships'=>'KinkHaver', 'icons'=>'UserIcon',
    'notifications'=>'Notification', 'clients'=>'WallpaperClient', 'visits'=>'Ahoy::Visit', 'bans'=>'BannedIp', 'reports'=>'Report', 'pledges'=>'NutPledge', 'scoops'=>'Scoop', 'orgasms'=>'Nuttracker::Orgasm' }.freeze
  attr_reader :data
  def self.key(model) = MODELS.key(model.name)
  def initialize(data = {})
    @data = data
    @records = MODELS.to_h do |key, name|
      [key, Array(data[key]).to_h { |row| record = name.constantize.instantiate(name == 'User' ? { 'email'=>nil, 'api_key'=>nil }.merge(row) : row); [record.id, record] }]
    end
    wire!
  end
  def records(key) = NodeBrowserCollection.new(@records.fetch(key, {}).values, MODELS.fetch(key).constantize)
  def find(model, id) = @records.fetch(self.class.key(model), {})[id.to_i]
  def overlay(model, rows)
    Array(rows).map do |row|
      record = find(model, row.fetch('id'))
      record&.assign_attributes(row.except('is_starred'))
      record&.clear_changes_information
      record
    end.compact
  end
  def clients = NodeBrowserCollection.new(records('clients').select { |client| client.match_text.present? }, WallpaperClient)
  def decorations = Array(data['decorations']).to_h { |row| [row.fetch('link_id').to_i, row.fetch('emoji')] }
  def attach(record, name, target)
    reflection = record.class.reflect_on_association(name)
    return unless reflection
    record.association(name).target = reflection.collection? ? NodeBrowserCollection.new(Array(target), reflection.klass) : target
    record.define_singleton_method(name) { association(name).target }
  end
  def wire!
    @records.each_value { |records| records.each_value { |record| record.strict_loading!; record.readonly!; record.instance_variable_set(:@node_browser_graph, self); record.define_singleton_method(:reload) { |*| NodeBrowserBackend.reload_record(self) } } }
    all = ->(key) { records(key) }
    user = ->(id) { find(User, id) if id }
    profile = ->(id) { find(Profile, id) if id }
    link = ->(id) { find(Link, id) if id }
    all.call('users').each do |record|
      attach(record, :profile, profile.call(record.profile_id))
      attach(record, :profiles, all.call('profiles').select { |p| p.user_id == record.id })
      attach(record, :link, all.call('links').select { |l| l.user_id == record.id })
      memberships = all.call('memberships').select { |h| h.user_id == record.id }
      attach(record, :kink_havers, memberships)
      attach(record, :kinks, memberships.filter_map { |h| find(Kink, h.kink_id) })
      leashes = all.call('leashes')
      owned = leashes.select { |l| l.pet_id == record.id && user.call(l.master_id)&.deleted_at.nil? }
      held = leashes.select { |l| l.master_id == record.id && user.call(l.pet_id)&.deleted_at.nil? }
      attach(record, :obeying_leashes, owned); attach(record, :held_leashes, held)
      attach(record, :masters, owned.filter_map { |l| user.call(l.master_id) }); attach(record, :pets, held.filter_map { |l| user.call(l.pet_id) })
      attach(record, :viewing_link, link.call(record.viewing_link_id))
      attach(record, :user_icon, all.call('icons').find_by(user_id: record.id))
      attach(record, :past_links, all.call('past_links').select { |p| p.set_by_id == record.id })
      attach(record, :current_nut_pledge, all.call('pledges').find_by(user_id: record.id, year: Time.current.year))
      surrenders = all.call('surrenders').select { |s| s.user_id == record.id && s.expires_at && s.expires_at > Time.current }.sort_by { |s| s.pending? ? 1 : 0 }
      attach(record, :current_surrender, surrenders.first)
      record.define_singleton_method(:details) { self.profile ? self.profile.content.to_s : self.profiles.order(:id).first&.content.to_s }
      preview = Array(data['recent_sets']).select { |p| p['set_by_id'].to_i == record.id }.map { |p| PastLink.instantiate(p) }
      record.instance_variable_set(:@node_browser_recent_sets, preview)
      record.define_singleton_method(:controllable_surrenders) { NodeBrowserCollection.new(@node_browser_graph.records('surrenders').select { |s| s.controller_user_id == id && s.user_id != id }, Surrender) }
    end
    latest = all.call('past_links').group_by(&:link_id)
    all.call('links').each do |record|
      attach(record, :user, user.call(record.user_id)); attach(record, :set_by, user.call(record.set_by_id))
      attach(record, :forked_from, link.call(record.forked_from_id))
      abilities = Array(data['abilities']).select { |a| a['link_id'].to_i == record.id }.map { |a| LinkAbility.instantiate(a) }
      attach(record, :abilities, abilities); attach(record, :past_links, Array(latest[record.id]).sort_by(&:id))
      attach(record, :viewing_users, all.call('users').select { |u| u.viewing_link_id == record.id && !u.deleted_at })
      attach(record, :users_viewing, all.call('users').select { |u| u.viewing_link_id == record.id && !u.deleted_at })
      attach(record, :comments, all.call('comments').select { |c| c.link_id == record.id })
      count = Array(data['fork_counts']).find { |r| r['link_id'].to_i == record.id }&.fetch('count', 0) || 0
      record.define_singleton_method(:fork_count) { count }
      connected = Array(data['connected']).map(&:to_i).include?(record.id)
      record.instance_variable_set(:@node_browser_connected, connected)
    end
    all.call('profiles').each do |record|
      attach(record, :user, user.call(record.user_id)); attach(record, :origin, profile.call(record.origin_id))
      count = Array(data['profile_usage']).find { |r| r['id'].to_i == record.id }&.fetch('count', 0) || 0
      record.define_singleton_method(:number_of_users) { count }
    end
    all.call('past_links').each { |r| attach(r, :user, user.call(r.user_id)); attach(r, :set_by, user.call(r.set_by_id)); attach(r, :link, link.call(r.link_id)) }
    all.call('comments').each { |r| attach(r, :user, user.call(r.user_id)); attach(r, :link, link.call(r.link_id)) }
    all.call('friendships').each do |r|
      attach(r, :sender, user.call(r.sender_id)); attach(r, :receiver, user.call(r.receiver_id))
      attach(r, :surrenders, all.call('surrenders').select { |s| s.friendship_id == r.id })
      r.define_singleton_method(:controllable) { |u| surrenders.any? { |s| s.user_id == u.id } }
    end
    all.call('leashes').each { |r| attach(r, :master, user.call(r.master_id)); attach(r, :pet, user.call(r.pet_id)); attach(r, :friendship, find(Friendship, r.friendship_id)) }
    all.call('surrenders').each do |r|
      attach(r, :user, user.call(r.user_id)); attach(r, :controller_user, user.call(r.controller_user_id)); attach(r, :friendship, find(Friendship, r.friendship_id))
      valid = Array(data['surrender_valid']).map(&:to_i).include?(r.id)
      r.define_singleton_method(:valid?) { |*| valid }
      r.define_singleton_method(:active?) { valid? && !pending? }
    end
    all.call('memberships').each { |r| attach(r, :user, user.call(r.user_id)); attach(r, :kink, find(Kink, r.kink_id)) }
    all.call('kinks').each { |r| attach(r, :kink_havers, all.call('memberships').select { |h| h.kink_id == r.id }); attach(r, :users, all.call('memberships').select { |h| h.kink_id == r.id }.filter_map { |h| user.call(h.user_id) }) }
    all.call('threads').each do |r|
      participants = all.call('participants').select { |p| p.message_thread_id == r.id }
      attach(r, :participants, participants); attach(r, :message_thread_participants, participants)
      attach(r, :users, participants.filter_map { |p| user.call(p.user_id) }); attach(r, :messages, all.call('messages').select { |m| m.message_thread_id == r.id })
    end
    all.call('participants').each { |r| attach(r, :user, user.call(r.user_id)); attach(r, :message_thread, find(MessageThread, r.message_thread_id)) }
    all.call('notifications').each { |r| attach(r, :user, user.call(r.user_id)) }
    all.call('icons').each { |r| attach(r, :user, user.call(r.user_id)) }
    all.call('bans').each { |r| attach(r, :banned_by, user.call(r.banned_by_id)) }
    all.call('visits').each { |r| attach(r, :user, user.call(r.user_id)); attach(r, :banned_ip, all.call('bans').find_by(ip_address: r.ip)) }
    all.call('reports').each { |r| attach(r, :reporter, user.call(r.reporter_id)); attach(r, :reportable, r.reportable_type == 'User' ? user.call(r.reportable_id) : link.call(r.reportable_id)) }
    all.call('pledges').each { |r| attach(r, :user, user.call(r.user_id)); attach(r, :past_link, find(PastLink, r.past_link_id)) }
    all.call('scoops').each { |r| attach(r, :user, user.call(r.user_id)) }
    all.call('orgasms').each { |r| attach(r, :user, user.call(r.user_id)); attach(r, :caused_by, user.call(r.caused_by_user_id)) }
    all.call('messages').each { |r| attach(r, :from_user, user.call(r.from_user_id)); attach(r, :message_thread, find(MessageThread, r.message_thread_id)) }
  end
end

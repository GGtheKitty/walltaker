class User < ApplicationRecord
  include ActiveModel::SecurePassword
  has_secure_password
  has_many :link, dependent: :destroy
  has_many :history_events, dependent: :destroy
  has_many :past_links, foreign_key: :set_by_id
  has_many :orgasms, foreign_key: :user_id, class_name: 'Nuttracker::Orgasm'
  has_many :caused_orgasms, foreign_key: :caused_by_user_id, class_name: 'Nuttracker::Orgasm'
  has_many :notifications
  has_many :ahoy_visits, :class_name => 'Ahoy::Visit'
  has_many :kink_havers, -> { order(created_at: :asc, id: :asc) }
  has_many :kinks, -> { order('kink_havers.created_at ASC, kink_havers.id ASC') }, through: :kink_havers
  attribute :colour_preference, :integer
  belongs_to :viewing_link, foreign_key: :viewing_link_id, class_name: 'Link', optional: true
  has_many :message_thread_participants
  has_many :message_threads, through: :message_thread_participants
  has_many :messages, through: :message_threads
  has_many :reports, as: :reportable
  has_many :profiles, inverse_of: :user
  has_many :friendships, ->(user) { unscope(:where).where(receiver_id: user.id).or(where(sender_id: user.id)) }
  has_many :held_leashes, ->(user) { where(master: user) }, through: :friendships, source: :leashes
  has_many :obeying_leashes, ->(user) { where(pet: user) }, through: :friendships, source: :leashes
  has_many :pets, through: :held_leashes
  has_many :masters, through: :obeying_leashes
  belongs_to :profile, optional: true
  has_one :current_surrender, class_name: 'Surrender', dependent: :destroy
  has_many :scoops
  has_one :nut_pledge, dependent: :destroy

  validates_uniqueness_of :username

  validates :email, format: { with: /\A([^@\s]+)@((?:[-a-z0-9]+\.)+[a-z]{2,})\z/i,
                              message: 'must be a valid email address' }
  validates_uniqueness_of :email, :case_sensitive => false
  validates :password, confirmation: true
  validates :username, presence: true, format: { with: /\A[a-zA-Z0-9]+\Z/ }

  enum colour_preference: %i[auto light dark]

  scope :has_friendship_with, ->(other) {
    Friendship.find_friendship(other, self)
  }

  scope :controllable_by, ->(other) {
    controllable_user_ids = other.controllable_surrenders.pluck(:user_id).uniq
    where(id: controllable_user_ids)
  }

  def master
    masters.first || nil
  end

  def flair
    obeying_leashes.first&.flair || nil
  end

  # This was implemented so bad lol, should've been a relation.
  def find_pornlizard
    case mascot
    when 'taylor'
      User.find_by_username('PornLizardTaylor')
    when 'warren'
      User.find_by_username('PornLizardWarren')
    when 'ki'
      User.find_by_username('PornLizardKi')
    else
      User.find_by_username('PornLizardKi')
    end
  end

  def details
    return profile.content if profile
    profiles.order(id: :asc).first&.content || ''
  end

  def current_profile_name
    return profile.name || 'Unnamed' if profile
    '<Imported Profile>'
  end

  def assign_new_api_key
    self.api_key = SecureRandom.base64(6).slice 0..7
    save
  end

  def view_link(link)
    self.viewing_link_id = link.id
    save
  end

  def leave_link
    self.viewing_link_id = nil
    save
  end

  def controllable_surrenders
    friendship_ids = Friendship.involving(self).is_confirmed.pluck(:id)
    Surrender.not_for_user(self).where(id: friendship_ids)
  end

  def snapshot
    <<~OUT.strip
      #{username}
      #{details}

      Recent messages:
      #{messages.limit(6).map { |message| "=> (to #{message.message_thread&.users&.map(&:username).join(',')}) #{message.content}" }.join("\n")}

      Recent wallpapers set for others:
      #{past_links.limit(6).map { |pl| "=> (for #{pl.link&.user&.username} on ##{pl.link&.id}) #{pl.post_url}" }.join("\n")}

      All links:

      ======= LINK ========
      #{link.map(&:snapshot).join("\n\n======= LINK ========\n")}
    OUT
  end

  def to_s
    username
  end

  def api_payload(viewer = nil)
    has_friendship = Rails.cache.fetch("v1/user-api/#{username}/#{viewer&.username || 'anon'}/has_friendship", expires: 1.hour) { Friendship.find_friendship(viewer, self).exists? } if viewer
    online_links_ids = Rails.cache.fetch("v1/user-api/#{username}/online-links/as-anon", expires: 7.minutes) { link.where(friends_only: false).and(link.where('expires > ?', Time.now).or(link.where(never_expires: true))).and(link.is_online).pluck(:id) } unless has_friendship
    online_links_ids = Rails.cache.fetch("v1/user-api/#{username}/online-links/as-friend", expires: 7.minutes) { link.where('expires > ?', Time.now).or(link.where(never_expires: true)).and(link.is_online).pluck(:id) } if has_friendship
    public_links = link.where(friends_only: false).and(link.where('expires > ?', Time.now).or(link.where(never_expires: true)))

    payload = {
      username: username,
      id: id,
      set_count: set_count,
      is_reporter: is_reporter,
      is_cutie: is_cutie,
      is_supporter: is_supporter,
      online: online_links_ids.length > 0,
      authenticated: !!viewer,
      links: public_links.map(&:api_payload_for_user),
      flair: flair || "",
      master: master&.username || false,
      pets: pets.map(&:username) || []
    }

    if viewer
      payload[:friend] = !!has_friendship
      payload[:self] = id == viewer.id
    end

    payload
  end

  def self.broadcast_api_update(user)
    return unless user

    broadcast_api_update_for_username(user.username)
  end

  def self.broadcast_api_update_for_username(username)
    return unless username

    ActionCable.server.broadcast("User::#{username}", { type: 'user.changed' })
  end

  after_commit do
    if api_visible_fields_previously_changed?
      User.broadcast_api_update(self)
      User.broadcast_api_update_for_username(username_before_last_save) if username_previously_changed?
    end

    if viewing_link_id
      viewed_link = Link.find(viewing_link_id)
    elsif viewing_link_id_before_last_save
      viewed_link = Link.find(viewing_link_id_before_last_save)
    end

    if viewed_link
      users_viewing_links = User.where.not(viewing_link_id: nil)
      broadcast_replace_to "link_viewing_users_#{viewed_link.id}", target: "link_viewing_users_#{viewed_link.id}", partial: 'links/viewing_users', locals: { link: viewed_link }
      broadcast_replace_to "dashboard_users_viewing_links", target: "users_viewing_links", partial: 'dashboard/users_viewing_links', locals: { users_viewing_links: }
    end
  end

  def api_visible_fields_previously_changed?
    (
      previous_changes.keys & %w[
        is_cutie
        is_reporter
        is_supporter
        profile_id
        set_count
        username
        viewing_link_id
      ]
    ).any?
  end
end

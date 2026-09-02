class User < ApplicationRecord
  USERNAME_CHANGE_COOLDOWN = 1.week

  include ActiveModel::SecurePassword
  has_secure_password
  has_many :link, dependent: :destroy
  has_many :history_events, dependent: :destroy
  has_many :past_links, foreign_key: :set_by_id
  has_many :orgasms, foreign_key: :user_id, class_name: 'Nuttracker::Orgasm'
  has_many :caused_orgasms, foreign_key: :caused_by_user_id, class_name: 'Nuttracker::Orgasm'
  has_many :notifications
  has_many :ahoy_visits, :class_name => 'Ahoy::Visit'
  has_many :nut_pledges, dependent: :destroy
  has_many :kink_havers, -> { order(created_at: :asc, id: :asc) }
  has_many :kinks, -> { joins(:kink_havers).order('kink_havers.created_at ASC, kink_havers.id ASC') }, through: :kink_havers
  attribute :colour_preference, :integer
  belongs_to :viewing_link, foreign_key: :viewing_link_id, class_name: 'Link', optional: true
  has_many :message_thread_participants
  has_many :message_threads, through: :message_thread_participants
  has_many :messages, through: :message_threads
  has_many :reports, as: :reportable
  has_many :profiles, inverse_of: :user
  has_one :user_icon, dependent: :destroy
  has_many :friendships, ->(user) { unscope(:where).where(receiver_id: user.id).or(where(sender_id: user.id)) }
  has_many :held_leashes, ->(user) { where(master: user) }, through: :friendships, source: :leashes
  has_many :obeying_leashes, ->(user) { where(pet: user) }, through: :friendships, source: :leashes
  has_many :pets, through: :held_leashes
  has_many :masters, through: :obeying_leashes
  belongs_to :profile, optional: true
  has_one :current_surrender, class_name: 'Surrender', dependent: :destroy
  has_many :scoops
  has_one :current_nut_pledge, -> { where(year: Time.current.year) }, class_name: 'NutPledge'

  validates_uniqueness_of :username

  validates :email, format: { with: /\A([^@\s]+)@((?:[-a-z0-9]+\.)+[a-z]{2,})\z/i,
                              message: 'must be a valid email address' }
  validates_uniqueness_of :email, :case_sensitive => false
  validates :password, confirmation: true
  validates :username, presence: true, format: { with: /\A[a-zA-Z0-9]+\Z/ }
  validate :system_account_credentials_are_immutable, on: :update
  validate :username_change_cooldown_has_elapsed, on: :update

  before_update :record_username_change, if: :will_save_change_to_username?

  enum colour_preference: %i[auto light dark]

  scope :active, -> { where(deleted_at: nil) }
  scope :deleted, -> { where.not(deleted_at: nil) }

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

  def evil_account?
    username == 'evil' || username_in_database == 'evil'
  end

  def system_account?
    evil_account? || (has_attribute?(:system_account) && self[:system_account])
  end

  def deleted?
    deleted_at.present?
  end

  def soft_delete!
    with_lock do
      raise ActiveRecord::RecordNotDestroyed, 'System accounts cannot be deleted.' if system_account?
      return true if deleted?

      original_username = username
      tombstone_username = unique_deleted_username(original_username)
      update_columns(
        deleted_at: Time.current,
        deleted_username: original_username,
        username: tombstone_username
      )
      User.broadcast_api_update_for_username(original_username)
      true
    end
  end

  def restore_account!
    with_lock do
      return true unless deleted?

      restored_username = deleted_username
      restored_username = username if restored_username.blank? || username_exists?(restored_username)
      update_columns(deleted_at: nil, username: restored_username)
      true
    end
  end

  def purge!
    raise ActiveRecord::RecordNotDestroyed, 'Only deleted accounts can be purged.' unless deleted?
    raise ActiveRecord::RecordNotDestroyed, 'System accounts cannot be purged.' if system_account?

    transaction do
      user_id = id
      link_ids = Link.unscoped.where(user_id:).pluck(:id)
      past_link_ids = PastLink.where(user_id:).pluck(:id)
      profile_ids = Profile.unscoped.where(user_id:).pluck(:id)

      BannedIp.where(banned_by_id: user_id).update_all(banned_by_id: nil)
      HistoryEvent.where(surrender_controller_id: user_id).update_all(surrender_controller_id: nil)
      Link.unscoped.where(set_by_id: user_id).update_all(set_by_id: nil)
      Nuttracker::Orgasm.where(caused_by_user_id: user_id).update_all(caused_by_user_id: nil)
      PastLink.where(set_by_id: user_id).update_all(set_by_id: nil)
      User.where(profile_id: profile_ids).update_all(profile_id: nil)
      NutPledge.where(past_link_id: past_link_ids).update_all(past_link_id: nil)
      Scoop.where(link_id: link_ids).update_all(link_id: nil)

      Surrender.where(controller_user_id: user_id).delete_all
      Friendship.involving(self).find_each(&:destroy!)
      Message.where(from_user_id: user_id).delete_all
      MessageThreadParticipant.where(user_id: user_id).delete_all
      Comment.where(user_id: user_id).delete_all
      Report.where(reporter_id: user_id).or(Report.where(reportable_type: 'User', reportable_id: user_id)).delete_all
      Report.where(reportable_type: 'Link', reportable_id: link_ids).delete_all
      Notification.where(user_id: user_id).delete_all
      KinkHaver.where(user_id: user_id).delete_all
      NutPledge.where(user_id: user_id).delete_all
      Nuttracker::Orgasm.where(user_id: user_id).delete_all
      Scoop.where(user_id: user_id).delete_all
      Ahoy::Event.where(user_id: user_id).update_all(user_id: nil)
      Ahoy::Visit.where(user_id: user_id).update_all(user_id: nil)

      Link.unscoped.where(id: link_ids).find_each(&:destroy!)
      PastLink.where(id: past_link_ids).delete_all
      Profile.unscoped.where(id: profile_ids).find_each(&:destroy!)
      HistoryEvent.where(user_id: user_id).delete_all
      destroy!
    end
  end

  def can_change_username?(at: Time.current)
    username_changed_at.nil? || username_changed_at <= at - USERNAME_CHANGE_COOLDOWN
  end

  def update_bypassing_username_change_cooldown(attributes)
    previous_bypass = @bypass_username_change_cooldown
    @bypass_username_change_cooldown = true
    update(attributes)
  ensure
    @bypass_username_change_cooldown = previous_bypass
  end

  def next_username_change_at
    username_changed_at + USERNAME_CHANGE_COOLDOWN if username_changed_at
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

  def view_link(link_or_id)
    link_id = link_or_id.respond_to?(:id) ? link_or_id.id : link_or_id
    return if viewing_link_id == link_id

    self.viewing_link_id = link_id
    save
  end

  def leave_link
    return if viewing_link_id.nil?

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

  private

  def system_account_credentials_are_immutable
    flagged_system_account = has_attribute?(:system_account) && system_account_in_database
    return unless flagged_system_account || evil_account?

    errors.add(:username, 'cannot be changed for a system account') if will_save_change_to_username?
    errors.add(:password, 'cannot be changed for a system account') if will_save_change_to_password_digest?
    errors.add(:system_account, 'cannot be disabled') if will_save_change_to_system_account?
  end

  def username_change_cooldown_has_elapsed
    return unless will_save_change_to_username?
    return if @bypass_username_change_cooldown
    return if can_change_username?

    errors.add(:username, 'can only be changed once a week')
  end

  def record_username_change
    self.username_changed_at = Time.current
  end

  def unique_deleted_username(original_username)
    loop do
      candidate = "#{original_username}#{SecureRandom.alphanumeric(10)}"
      return candidate unless User.where('lower(username) = ?', candidate.downcase).exists?
    end
  end

  def username_exists?(candidate)
    User.where('lower(username) = ?', candidate.downcase).where.not(id: id).exists?
  end
end

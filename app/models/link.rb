class Link < ApplicationRecord
  include PgSearch::Model
  belongs_to :user
  belongs_to :set_by, foreign_key: :set_by_id, class_name: 'User', optional: true
  belongs_to :forked_from, foreign_key: :forked_from_id, class_name: 'Link', inverse_of: :forks, optional: true
  has_many :forks, foreign_key: :forked_from_id, class_name: 'Link', inverse_of: :forked_from, dependent: :nullify
  has_many :viewing_users, foreign_key: :viewing_link_id, class_name: 'User'
  has_many :past_links
  has_many :comments, dependent: :destroy
  has_many :abilities, class_name: 'LinkAbility', inverse_of: :link, dependent: :destroy
  has_many :users_viewing, class_name: 'User', foreign_key: :viewing_link_id, inverse_of: :viewing_link, dependent: :nullify
  enum response_type: %i[horny came disgust ok]
  validates :expires, presence: true, unless: :never_expires?
  validates :theme, format: { without: /\s+/i, message: 'must be only 1 tag.' }
  validates :theme, format: { without: /\:/, message: 'must not contain filter or sort tags. (like score:>30) Use the Minimum Score setting instead.' }
  validates :min_score, comparison: { greater_than: -1, less_than: 301 }
  validates :custom_url, format: { with: /\A[a-zA-Z\-_]*\z/, message: 'must be a valid in a url, with no spaces or special characters' }
  validates_uniqueness_of :custom_url, allow_nil: true, unless: ->(l) { l.custom_url.blank? }
  has_many :reports, as: :reportable
  has_many :history_events, dependent: :destroy

  visitable :ahoy_visit

  pg_search_scope :search_positive, against: %i[terms theme custom_url response_text post_description], associated_against: {
    user: %i[username details]
  }, using: { tsearch: { dictionary: 'english', prefix: true, any_word: true } }

  pg_search_scope :search_negative, against: :blacklist, using: { tsearch: { dictionary: 'english', any_word: true } }

  scope :is_online, -> {
    where('last_ping > ?', Time.now - 1.minute)
      .or(where('live_client_started_at > ?', Time.now - LinkPresence::TTL))
      .or(where("last_ping_user_agent LIKE '%widgetExtension%'").where('last_ping > ?', Time.now - 20.minutes))
  }

  scope :with_ability_to, ->(ability_name) { joins(:abilities).where('link_abilities.ability': ability_name) }

  scope :is_public, -> {
    (
      where(friends_only: false)
    ).and(
      where('expires > ?', Time.now).or(where(never_expires: true))
    )
  }

  def is_online?
    is_ios = last_ping_user_agent&.match(/widgetExtension/) || false

    last_ping_online = last_ping > Time.now - 20.minutes if is_ios && last_ping_user_agent && last_ping
    last_ping_online = last_ping > Time.now - 1.minute if !is_ios && last_ping_user_agent && last_ping
    live_client_online = LinkPresence.online?(self) || (live_client_started_at && (live_client_started_at > Time.now - LinkPresence::TTL))
    !!(last_ping_online || live_client_online)
  end

  # @param ["can_show_videos"] ability
  def check_ability(ability)
    result = abilities.any? { |edge| edge.ability == ability }

    return result && user.master.present? if ability == 'is_master_only'
    result
  end

  def toggle_ability(ability_name)
    set_ability(ability_name, !check_ability(ability_name))
  end

  def set_ability(ability_name, value)
    able_to = check_ability ability_name
    if able_to && !value
      abilities.delete_by ability: ability_name
    elsif !able_to && value
      abilities.create ability: ability_name
    end
  end

  # @return [User | nil]
  def get_set_by_user
    return set_by if self.set_by_id
    nil unless self.set_by_id
  end

  def api_payload
    {
      success: true,
      id: id,
      expires: expires,
      username: user.username,
      terms: terms,
      blacklist: blacklist,
      post_url: post_url,
      post_thumbnail_url: post_thumbnail_url,
      post_description: post_description,
      created_at: created_at,
      updated_at: updated_at,
      set_by: get_set_by_user&.username,
      response_type: response_type,
      response_text: response_text,
      online: is_online?
    }
  end

  def api_payload_for_user
    payload = api_payload.except(:success, :set_by, :post_description)
    payload[:post_description] = post_description.truncate(100) if post_description.present?
    payload
  end

  def seconds_since_last_set
    past_links.last.present? ? Time.now - past_links.last.created_at : 99999
  end

  def e621_post_md5
    post_url&.match(%r{/([0-9a-f]{32})\.(png|jpe?g|bmp|webm|mp4|gif|webp)(?:\?|$)}i)&.[](1)
  end

  after_update_commit do
    next unless client_visible_fields_previously_changed?

    broadcast_link_page_updates
    ActionCable.server.broadcast("Link::#{id}", api_payload)
    User.broadcast_api_update(user)
  end

  def client_visible_fields_previously_changed?
    (
      previous_changes.keys & %w[
        blacklist
        created_at
        expires
        friends_only
        last_ping
        last_ping_user_agent
        live_client_started_at
        never_expires
        post_description
        post_thumbnail_url
        post_url
        response_text
        response_type
        set_by_id
        terms
        theme
        updated_at
      ]
    ).any?
  end

  def broadcast_link_page_updates
    broadcast_update
    broadcast_update_to "link_preview_#{id}_image", target: "preview_image", partial: 'links/embed_image', locals: { link: self }
    broadcast_update_to "link_preview_#{id}_text", target: "preview_text", partial: 'links/embed_text', locals: { link: self }
  rescue => e
    Rails.logger.warn("Link #{id} page broadcast failed: #{e.class}: #{e.message}")
  end

  def snapshot
    <<~OUT.strip
      ##{id}
      Creator: #{user.username}
      #{terms}

      Theme: #{theme}
      Blacklist: #{blacklist}
      Post URL: #{post_url}
      Set By: #{set_by&.username || 'anon or no one'}
      Response Text: #{response_text}
    OUT
  end

  def to_s
    "Link ##{id}"
  end
end

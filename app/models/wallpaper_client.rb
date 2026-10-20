class WallpaperClient < ApplicationRecord
  SECTIONS = %w[clients companion_apps hidden].freeze
  DEVICE_TYPES = %w[desktop mobile].freeze

  validates :name, presence: true
  validates :section, inclusion: { in: SECTIONS }
  validates :device_type, inclusion: { in: DEVICE_TYPES }, allow_blank: true
  validates :position, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
  validates :match_position, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
  validates :icon_name, format: {
    with: /\A[a-z0-9]+(?:-[a-z0-9]+)*\z/,
    message: 'must be a valid Ionicon name'
  }, allow_blank: true
  validates :url, format: { with: %r{\Ahttps?://} }, allow_blank: true
  validate :listed_client_has_url

  scope :ordered, -> { order(:position, :id) }
  scope :in_section, ->(section) { where(section:).ordered }
  scope :recognized, -> { where.not(match_text: [nil, '']).ordered }

  before_validation :place_at_end, on: :create

  def self.for_user_agent(user_agent)
    return if user_agent.blank?

    recognized.find { |client| user_agent.include?(client.match_text) }
  end

  def link_label
    link_name.presence || name
  end

  def move_up!
    move_to_index([self.class.ordered.index(self) - 1, 0].max)
  end

  def move_down!
    move_to_index([self.class.ordered.index(self) + 1, self.class.count - 1].min)
  end

  private

  def place_at_end
    self.position = (self.class.maximum(:position) || 0) + 10
    self.match_position = position
  end

  def move_to_index(index)
    other = self.class.ordered.offset(index).first
    return if other.nil? || other == self

    self.class.transaction do
      old_position = position
      update_columns(position: other.position, match_position: other.position)
      other.update_columns(position: old_position, match_position: old_position)
    end
  end

  def listed_client_has_url
    errors.add(:url, "can't be blank for a homepage entry") if section != 'hidden' && url.blank?
  end
end

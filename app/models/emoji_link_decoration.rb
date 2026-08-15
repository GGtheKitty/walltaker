class EmojiLinkDecoration < ApplicationRecord
  CACHE_KEY = 'emoji_link_decorations/map'

  validates :link_id, presence: true, numericality: { only_integer: true, greater_than: 0 }, uniqueness: true
  validates :emoji, presence: true
  validate :emoji_is_single_character

  after_commit :clear_emoji_map_cache

  class << self
    def emoji_map
      Rails.cache.fetch(CACHE_KEY) { pluck(:link_id, :emoji).to_h }
    end

    def clear_cache
      Rails.cache.delete(CACHE_KEY)
    end
  end

  private

  def emoji_is_single_character
    return if emoji.blank?

    errors.add(:emoji, 'must be a single emoji') unless emoji.grapheme_clusters.one? && emoji.match?(/\p{Emoji}/)
  end

  def clear_emoji_map_cache
    self.class.clear_cache
  end
end

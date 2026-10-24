class SiteSetting < ApplicationRecord
  validates :key, presence: true, uniqueness: true
  validates :value, presence: true

  class << self
    def boolean(key, default: false)
      if NodeBrowserBackend.enabled?
        flags = NodeBrowserBackend.context&.data&.fetch('flags', nil) || NodeBrowserBackend.request('site').fetch('flags')
        return flags.fetch(key.to_s, default)
      end
      value = find_by(key:)&.value
      return default if value.nil?

      ActiveModel::Type::Boolean.new.cast(value)
    end

    def set_boolean(key, enabled)
      setting = find_or_initialize_by(key:)
      setting.value = enabled ? "true" : "false"
      setting.save!
      Rails.cache.delete(cache_key(key))
      enabled
    end

    def cached_boolean(key, default: false)
      return boolean(key, default:) if NodeBrowserBackend.enabled?
      Rails.cache.fetch(cache_key(key), expires_in: 1.minute) do
        boolean(key, default:)
      end
    end

    private

    def cache_key(key)
      "site_settings/#{key}"
    end
  end
end

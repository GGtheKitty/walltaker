require "uri"

class SiteConfig
  DEFAULT_BASE_URL = "https://walltaker.joi.how"

  def self.base_url
    ENV.fetch("WALLTAKER_BASE_URL", DEFAULT_BASE_URL).delete_suffix("/")
  end

  def self.host
    URI.parse(base_url).host || ENV.fetch("WALLTAKER_HOST", "walltaker.joi.how")
  rescue URI::InvalidURIError
    ENV.fetch("WALLTAKER_HOST", "walltaker.joi.how")
  end

  def self.url(path = nil)
    return base_url if path.blank?

    "#{base_url}/#{path.to_s.delete_prefix("/")}"
  end

  def self.mail_from
    ENV.fetch("WALLTAKER_MAIL_FROM", "mailgun@#{host}")
  end

  def self.e621_user_agent
    ENV.fetch("E621_USER_AGENT")
  end

  def self.nut_tracker_enabled?
    SiteSetting.cached_boolean("nut_tracker_enabled", default: false)
  end

  def self.nut_tracker_enabled=(enabled)
    SiteSetting.set_boolean("nut_tracker_enabled", enabled)
  end
end
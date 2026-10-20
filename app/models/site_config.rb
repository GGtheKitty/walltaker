require "open3"
require "time"
require "uri"

class SiteConfig
  DEFAULT_BASE_URL = "https://walltaker.joi.how"
  GITHUB_MAIN_REF = "refs/remotes/origin/main"

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

  def self.commit_hash
    return ENV["HEROKU_SLUG_COMMIT"] if ENV["HEROKU_SLUG_COMMIT"].present?

    @commit_hash ||= git_value("rev-parse", GITHUB_MAIN_REF)
  end

  def self.commit_time
    if ENV["HEROKU_RELEASE_CREATED_AT"].present?
      return Time.iso8601(ENV["HEROKU_RELEASE_CREATED_AT"])
    end

    @commit_time ||= begin
      value = git_value("show", "-s", "--format=%cI", GITHUB_MAIN_REF)
      Time.iso8601(value) if value.present?
    end
  rescue ArgumentError
    nil
  end

  def self.mail_from
    ENV.fetch("WALLTAKER_MAIL_FROM", "walltaker@#{host}")
  end

  def self.resend_smtp_address
    ENV.fetch("RESEND_SMTP_ADDRESS", "smtp.resend.com")
  end

  def self.resend_smtp_port
    ENV.fetch("RESEND_SMTP_PORT", "587").to_i
  end

  def self.resend_smtp_user_name
    ENV.fetch("RESEND_SMTP_USER_NAME", "resend")
  end

  def self.resend_smtp_password
    ENV["RESEND_API_KEY"] || ENV["RESEND_SMTP_PASSWORD"]
  end

  def self.resend_smtp_authentication
    ENV.fetch("RESEND_SMTP_AUTHENTICATION", "plain").to_sym
  end

  def self.resend_smtp_starttls_auto?
    ActiveModel::Type::Boolean.new.cast(ENV.fetch("RESEND_SMTP_ENABLE_STARTTLS_AUTO", "true"))
  end

  def self.e621_user_agent
    ENV.fetch("E621_USER_AGENT", "#{host} (by ailurus on e621)")
  end

  def self.nnn_enabled?
    SiteSetting.cached_boolean("nnn_enabled", default: false)
  end

  def self.nnn_enabled=(enabled)
    SiteSetting.set_boolean("nnn_enabled", enabled)
  end

  def self.invite_only?
    SiteSetting.cached_boolean("invite_only", default: false)
  end

  def self.invite_only=(enabled)
    SiteSetting.set_boolean("invite_only", enabled)
  end

  def self.git_value(*arguments)
    output, status = Open3.capture2("git", "-C", Rails.root.to_s, *arguments)
    output.strip.presence if status.success?
  rescue Errno::ENOENT
    nil
  end
  private_class_method :git_value
end

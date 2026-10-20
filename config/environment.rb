# Load the Rails application.
require_relative "application"

# Initialize the Rails application.
Rails.application.initialize!

ActionMailer::Base.smtp_settings = {
  :port => SiteConfig.resend_smtp_port,
  :address => SiteConfig.resend_smtp_address,
  :user_name => SiteConfig.resend_smtp_user_name,
  :password => SiteConfig.resend_smtp_password,
  :domain => SiteConfig.host,
  :authentication => SiteConfig.resend_smtp_authentication,
  :enable_starttls_auto => SiteConfig.resend_smtp_starttls_auto?
}
ActionMailer::Base.delivery_method = :smtp
ActionMailer::Base.perform_deliveries = true
ActionMailer::Base.raise_delivery_errors = true

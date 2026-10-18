require 'uri'

class E621MediaProxy
  PURPOSE = :e621_media
  ALLOWED_HOST = 'static1.e621.net'
  ALLOWED_PATH = %r{\A/data/[0-9a-f]{2}/[0-9a-f]{2}/[0-9a-f]{32}\.(?:png|jpe?g|gif|webp|webm|mp4|bmp)\z}i

  def self.fallback_url(source_url)
    uri = source_uri(source_url)
    return if uri.nil?

    token = verifier.generate(uri.to_s, purpose: PURPOSE)
    SiteConfig.url("/e621-media?token=#{ERB::Util.url_encode(token)}")
  end

  def self.resolve(token)
    source_url = verifier.verify(token.to_s, purpose: PURPOSE)
    source_uri(source_url)
  rescue ActiveSupport::MessageVerifier::InvalidSignature
    nil
  end

  def self.source_uri(source_url)
    uri = URI.parse(source_url.to_s)
    return unless uri.is_a?(URI::HTTPS)
    return unless uri.host == ALLOWED_HOST
    return unless uri.port == 443 && uri.userinfo.nil?
    return unless uri.query.nil? && uri.fragment.nil?
    return unless uri.path.match?(ALLOWED_PATH)

    uri
  rescue URI::InvalidURIError
    nil
  end
  private_class_method :source_uri

  def self.verifier
    Rails.application.message_verifier(PURPOSE)
  end
  private_class_method :verifier
end

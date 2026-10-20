require 'addressable/uri'
require 'cgi'
require 'ipaddr'

class ProfileDomainFilter
  Result = Data.define(:content, :domains, :blocked_domains)

  URL_ATTRIBUTES = %w[action cite formaction href poster src].freeze
  MARKDOWN_URL_NODES = %i[image link].freeze
  HTML_ATTRIBUTE_PATTERN = /(\b(?:#{URL_ATTRIBUTES.join('|')})\s*=\s*)(["'])(.*?)\2/im
  HTML_UNQUOTED_ATTRIBUTE_PATTERN = /(\b(?:#{URL_ATTRIBUTES.join('|')})\s*=\s*)([^\s>]+)/im
  CSS_URL_PATTERN = /(url\(\s*)(["']?)(.*?)(\2\s*\))/im
  CSS_IMPORT_PATTERN = /(@import\s+)(["'])(.*?)\2/im
  HOSTNAME_PATTERN = /\A(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\z/

  class << self
    def filter_and_record(content)
      filter = new(content)
      result = filter.call
      record_domains(result.domains)
      result
    end

    def filter(content)
      new(content).call
    end

    def normalize_hostname(hostname)
      value = hostname.to_s.strip.downcase.delete_prefix('[').delete_suffix(']').delete_suffix('.')
      return IPAddr.new(value).to_s if ip_address?(value)

      value = Addressable::IDNA.to_ascii(value) if value.present?
      return if value.length > 253 || !value.match?(HOSTNAME_PATTERN)

      value
    rescue Addressable::IDNA::PunycodeBadInput,
           Addressable::IDNA::PunycodeBigOutput,
           Addressable::IDNA::PunycodeOverflow,
           IPAddr::InvalidAddressError
      nil
    end

    def ip_address?(value)
      value.include?(':') || value.match?(/\A\d{1,3}(?:\.\d{1,3}){3}\z/)
    end

    def record_domains(domains)
      now = Time.current

      domains.each do |domain|
        next if internal_domain?(domain)

        record = ProfileDomain.decision_for(domain) || ProfileDomain.find_or_create_by!(domain:) do |new_record|
          new_record.status = :pending
          new_record.seen_count = 0
          new_record.first_seen_at = now
          new_record.last_seen_at = now
        end
        record.update_columns(seen_count: record.seen_count + 1, last_seen_at: now, updated_at: now)
      rescue ActiveRecord::RecordNotUnique
        retry
      end
    end

    def scrub_saved_profiles!
      Profile.unscoped.find_each do |profile|
        result = filter(profile.content)
        next if result.blocked_domains.empty? || result.content == profile.content

        profile.update_columns(content: result.content, updated_at: Time.current)
      end
    end

    def internal_domain?(domain)
      configured_host = normalize_hostname(SiteConfig.host)
      domain == configured_host || domain.end_with?(".#{configured_host}")
    end
  end

  def initialize(content)
    @content = content.to_s
    @domains = Set.new
    @blocked_domains = Set.new
  end

  def call
    filtered = if ProfileMarkdown.markdown?(@content)
                 ProfileMarkdown::MARKER + filter_markdown(ProfileMarkdown.source(@content))
               else
                 filter_html(@content)
               end
    filtered = @content if @blocked_domains.empty?

    Result.new(content: filtered, domains: @domains.to_a.sort, blocked_domains: @blocked_domains.to_a.sort)
  end

  private

  def filter_markdown(source)
    document = Commonmarker.parse(source, options: ProfileMarkdown::OPTIONS)

    document.walk do |node|
      if MARKDOWN_URL_NODES.include?(node.type)
        node.url = '' if blocked_url?(node.url)
      elsif %i[html_block html_inline].include?(node.type)
        node.literal = filter_raw_html(node.literal)
      end
    end

    document.to_commonmark
  end

  def filter_html(content)
    fragment = Nokogiri::HTML5.fragment(content)

    fragment.css('*').each do |node|
      URL_ATTRIBUTES.each do |attribute|
        next unless node.key?(attribute)

        node.remove_attribute(attribute) if blocked_url?(node[attribute])
      end

      node['style'] = filter_css(node['style']) if node.key?('style')
      node.content = filter_css(node.content) if node.name == 'style'
    end

    fragment.to_html
  end

  def filter_raw_html(content)
    filtered = content.to_s.gsub(HTML_ATTRIBUTE_PATTERN) do
      prefix = Regexp.last_match(1)
      quote = Regexp.last_match(2)
      url = Regexp.last_match(3)
      blocked_url?(CGI.unescape_html(url)) ? "#{prefix}#{quote}#{quote}" : Regexp.last_match(0)
    end

    filtered = filtered.gsub(HTML_UNQUOTED_ATTRIBUTE_PATTERN) do
      prefix = Regexp.last_match(1)
      url = Regexp.last_match(2)
      blocked_url?(CGI.unescape_html(url)) ? "#{prefix}\"\"" : Regexp.last_match(0)
    end

    filtered.match?(/<style\b/i) ? filter_css(filtered) : filtered.gsub(/style\s*=\s*(["'])(.*?)\1/im) do
      quote = Regexp.last_match(1)
      "style=#{quote}#{filter_css(Regexp.last_match(2))}#{quote}"
    end
  end

  def filter_css(content)
    filtered = content.to_s.gsub(CSS_URL_PATTERN) do
      prefix = Regexp.last_match(1)
      quote = Regexp.last_match(2)
      url = Regexp.last_match(3).strip
      suffix = Regexp.last_match(4)
      blocked_url?(url) ? "#{prefix}#{quote}#{quote})" : Regexp.last_match(0)
    end

    filtered.gsub(CSS_IMPORT_PATTERN) do
      prefix = Regexp.last_match(1)
      quote = Regexp.last_match(2)
      url = Regexp.last_match(3)
      blocked_url?(url) ? "#{prefix}#{quote}#{quote}" : Regexp.last_match(0)
    end
  end

  def blocked_url?(url)
    hostname = hostname_from(url)
    return false if hostname.blank?

    @domains << hostname
    decision = ProfileDomain.decision_for(hostname)
    return false unless decision&.blocked?

    @blocked_domains << decision.domain
    true
  end

  def hostname_from(url)
    value = CGI.unescape_html(url.to_s.strip)
    return if value.blank? || value.start_with?('#', '/', 'mailto:', 'tel:') && !value.start_with?('//')

    uri = Addressable::URI.parse(value.start_with?('//') ? "https:#{value}" : value)
    return unless %w[http https].include?(uri.scheme&.downcase)

    self.class.normalize_hostname(uri.host)
  rescue Addressable::URI::InvalidURIError
    nil
  end
end

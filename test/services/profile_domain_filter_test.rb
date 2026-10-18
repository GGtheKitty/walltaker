require 'test_helper'

class ProfileDomainFilterTest < ActiveSupport::TestCase
  setup do
    ProfileDomain.delete_all
  end

  test 'unknown domains remain and enter the moderation queue' do
    result = ProfileDomainFilter.filter_and_record(<<~HTML)
      <a href="https://New.Example/path">Link</a>
      <img src="//cdn.example/image.png">
      <style>.profile { background: url(https://images.example/background.png); }</style>
    HTML

    assert_includes result.content, 'https://New.Example/path'
    assert_equal %w[cdn.example images.example new.example], result.domains
    assert_equal %w[cdn.example images.example new.example], ProfileDomain.pending.order(:domain).pluck(:domain)
  end

  test 'a blocked parent domain removes HTML and CSS URLs from its subdomains' do
    create_domain('example.test', :blocked)

    result = ProfileDomainFilter.filter(<<~HTML)
      <a href="https://sub.example.test/path">Blocked link</a>
      <img src="https://allowed.test/image.png">
      <style>.profile { background: url('https://example.test/background.png'); }</style>
    HTML

    assert_not_includes result.content, 'sub.example.test'
    assert_not_includes result.content, 'example.test/background.png'
    assert_includes result.content, 'allowed.test/image.png'
    assert_equal ['example.test'], result.blocked_domains
  end

  test 'a more specific decision takes precedence' do
    create_domain('example.test', :blocked)
    create_domain('safe.example.test', :approved)

    result = ProfileDomainFilter.filter('<img src="https://safe.example.test/image.png"><img src="https://other.example.test/image.png">')

    assert_includes result.content, 'safe.example.test/image.png'
    assert_not_includes result.content, 'other.example.test/image.png'
  end

  test 'blocked Markdown links are removed while allowed links remain' do
    create_domain('blocked.test', :blocked)
    content = ProfileMarkdown.dump('[blocked](https://blocked.test/path) ![allowed](https://allowed.test/image.png)')

    result = ProfileDomainFilter.filter(content)

    assert_equal "[blocked]() ![allowed](https://allowed.test/image.png)\n", ProfileMarkdown.source(result.content)
  end

  private

  def create_domain(domain, status)
    ProfileDomain.create!(
      domain:,
      status:,
      seen_count: 0,
      first_seen_at: Time.current,
      last_seen_at: Time.current
    )
  end
end

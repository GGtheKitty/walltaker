require 'test_helper'

class E621MediaProxyTest < ActiveSupport::TestCase
  VALID_URL = 'https://static1.e621.net/data/ab/cd/0123456789abcdef0123456789abcdef.jpg'

  test 'round trips an allowed e621 media URL through a signed fallback URL' do
    fallback_url = URI.parse(E621MediaProxy.fallback_url(VALID_URL))
    token = Rack::Utils.parse_query(fallback_url.query)['token']

    assert_equal URI.parse(VALID_URL), E621MediaProxy.resolve(token)
  end

  test 'rejects non-e621 and non-media URLs' do
    assert_nil E621MediaProxy.fallback_url('https://example.com/data/ab/cd/0123456789abcdef0123456789abcdef.jpg')
    assert_nil E621MediaProxy.fallback_url('https://static1.e621.net/posts.json')
  end

  test 'rejects a modified token' do
    fallback_url = URI.parse(E621MediaProxy.fallback_url(VALID_URL))
    token = Rack::Utils.parse_query(fallback_url.query)['token']

    assert_nil E621MediaProxy.resolve("#{token}changed")
  end
end

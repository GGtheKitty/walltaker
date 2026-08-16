require 'test_helper'
require 'action_cable/test_helper'

class LinkTest < ActiveSupport::TestCase
  include ActionCable::TestHelper

  test 'expiry date required when not never_expires' do
    link = Link.new
    link.never_expires = false
    link.expires = nil

    assert_not link.save, 'saved an expiring link with a nil expiry date'
  end
  test 'theme should not have spaces' do
    link = Link.new
    link.never_expires = true
    link.theme = 'this is a multi tag theme'

    assert_not link.save, 'saved a theme with multiple tags'
  end

  test 'is_online handles links that have never pinged' do
    link = links(:one)
    link.update!(last_ping: nil, live_client_started_at: nil)

    assert_not link.is_online?
  end

  test 'api_payload matches client update shape' do
    link = links(:one)
    link.user.update!(username: 'payloaduser', email: 'payload@example.com')
    link.update!(
      blacklist: 'blood',
      post_url: 'https://static1.e621.net/data/example.png',
      post_thumbnail_url: 'https://static1.e621.net/data/preview/example.jpg',
      response_type: 'horny',
      response_text: 'nice'
    )

    payload = link.api_payload

    assert_equal true, payload[:success]
    assert_equal link.id, payload[:id]
    assert_equal 'payloaduser', payload[:username]
    assert_equal 'https://static1.e621.net/data/example.png', payload[:post_url]
    assert payload.key?(:online)
  end

  test 'metadata edits broadcast the full current client payload' do
    link = links(:one)
    setter = users(:two)

    link.user.update!(username: 'payloaduser', email: 'payload@example.com')
    setter.update!(username: 'setteruser', email: 'setter@example.com')
    link.update!(
      post_url: 'https://static1.e621.net/data/example.png',
      post_thumbnail_url: 'https://static1.e621.net/data/preview/example.jpg',
      post_description: 'example',
      set_by: setter
    )

    broadcasts = capture_broadcasts("Link::#{link.id}") do
      link.update!(blacklist: 'blood', terms: 'updated terms')
    end

    payload = broadcasts.last
    assert_equal true, payload['success']
    assert_equal 'payloaduser', payload['username']
    assert_equal 'setteruser', payload['set_by']
    assert_equal 'https://static1.e621.net/data/example.png', payload['post_url']
    assert_equal 'https://static1.e621.net/data/preview/example.jpg', payload['post_thumbnail_url']
    assert_equal 'blood', payload['blacklist']
    assert_equal 'updated terms', payload['terms']
  end

  test 'is_online handles links that have never pinged' do
    link = links(:one)
    link.update!(last_ping: nil, live_client_started_at: nil)

    assert_not link.is_online?
  end

  test 'recent live_client_started_at does not make a link online without redis presence' do
    link = links(:one)
    link.update!(last_ping: nil, last_ping_user_agent: nil, live_client_started_at: Time.now.utc)

    assert_not link.is_online?
    assert_not_includes Link.is_online, link
  end

  test 'redis presence makes a link online even when live_client_started_at is old' do
    link = links(:one)
    link.update!(
      last_ping: nil,
      last_ping_user_agent: nil,
      live_client_started_at: LinkPresence::TTL.ago - 1.minute
    )

    LinkPresence.join(link, 'test-connection')

    assert link.is_online?
    assert_includes Link.is_online, link
  end

  test 'redis ttl expiry makes live client presence go offline' do
    link = links(:one)
    link.update!(last_ping: nil, last_ping_user_agent: nil, live_client_started_at: Time.now.utc)

    LinkPresence.join(link, 'test-connection')
    assert link.is_online?

    travel LinkPresence::TTL + 1.second

    assert_not link.is_online?
    assert_not_includes Link.is_online, link
  ensure
    travel_back
  end

  test 'api_payload matches client update shape' do
    link = links(:one)
    link.user.update!(username: 'payloaduser', email: 'payload@example.com')
    link.update!(
      blacklist: 'blood',
      post_url: 'https://static1.e621.net/data/example.png',
      post_thumbnail_url: 'https://static1.e621.net/data/preview/example.jpg',
      response_type: 'horny',
      response_text: 'nice'
    )

    payload = link.api_payload

    assert_equal true, payload[:success]
    assert_equal link.id, payload[:id]
    assert_equal 'payloaduser', payload[:username]
    assert_equal 'https://static1.e621.net/data/example.png', payload[:post_url]
    assert payload.key?(:online)
  end

  test 'e621_post_md5 supports webp source urls' do
    link = links(:one)
    link.post_url = 'https://static1.e621.net/data/ab/cd/0123456789abcdef0123456789abcdef.webp'

    assert_equal '0123456789abcdef0123456789abcdef', link.e621_post_md5
  end

  test 'e621_post_md5 returns nil for unsupported source urls' do
    link = links(:one)
    link.post_url = 'https://example.com/not-e621'

    assert_nil link.e621_post_md5
  end

  test 'metadata edits broadcast the full current client payload' do
    link = links(:one)
    setter = users(:two)

    link.user.update!(username: 'payloaduser', email: 'payload@example.com')
    setter.update!(username: 'setteruser', email: 'setter@example.com')
    link.update!(
      post_url: 'https://static1.e621.net/data/example.png',
      post_thumbnail_url: 'https://static1.e621.net/data/preview/example.jpg',
      post_description: 'example',
      set_by: setter
    )

    broadcasts = capture_broadcasts("Link::#{link.id}") do
      link.update!(blacklist: 'blood', terms: 'updated terms')
    end

    payload = broadcasts.last
    assert_equal true, payload['success']
    assert_equal 'payloaduser', payload['username']
    assert_equal 'setteruser', payload['set_by']
    assert_equal 'https://static1.e621.net/data/example.png', payload['post_url']
    assert_equal 'https://static1.e621.net/data/preview/example.jpg', payload['post_thumbnail_url']
    assert_equal 'blood', payload['blacklist']
    assert_equal 'updated terms', payload['terms']
  end
end

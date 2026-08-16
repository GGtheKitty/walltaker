require "test_helper"

class LinkChannelTest < ActionCable::Channel::TestCase
  setup do
    @link = links(:one)
    @link.user.update!(username: 'channeluser', email: 'channel@example.com')
    @link.update!(
      blacklist: 'gore',
      post_url: 'https://static1.e621.net/data/example.png',
      post_thumbnail_url: 'https://static1.e621.net/data/preview/example.jpg',
      post_description: 'example',
      response_type: 'horny',
      response_text: 'nice'
    )
  end

  test 'subscribes to a link stream and sends the current link state' do
    subscribe id: @link.id

    assert subscription.confirmed?
    assert_has_stream "Link::#{@link.id}"

    payload = transmissions.last
    assert_equal true, payload[:success]
    assert_equal @link.id, payload[:id]
    assert_equal 'channeluser', payload[:username]
    assert_equal 'https://static1.e621.net/data/example.png', payload[:post_url]
    assert_equal true, payload[:online]
  end

  test 'refreshing presence does not update live_client_started_at heartbeat' do
    subscribe id: @link.id
    started_at = @link.reload.live_client_started_at

    travel 45.seconds
    subscription.send(:refresh_presence)

    assert_equal started_at.to_i, @link.reload.live_client_started_at.to_i
  ensure
    travel_back
  end

  test 'unsubscribing keeps live_client_started_at as historical timestamp' do
    subscribe id: @link.id
    started_at = @link.reload.live_client_started_at

    unsubscribe

    assert_equal started_at.to_i, @link.reload.live_client_started_at.to_i
    assert_not @link.reload.is_online?
  end

  test 'rejects subscriptions without a link identifier' do
    subscribe

    assert subscription.rejected?
  end

  test 'sends an error payload for unknown links' do
    subscribe id: 0

    assert subscription.confirmed?
    assert_equal false, transmissions.last[:success]
    assert_equal 'Link 0 does not exist.', transmissions.last[:why]
  end

  test 'accepts link_id as an alias for id' do
    subscribe link_id: @link.id

    assert subscription.confirmed?
    assert_has_stream "Link::#{@link.id}"
  end

  test 'watch_user sends the current user state over the link channel' do
    subscribe id: @link.id

    perform :watch_user, username: @link.user.username

    payload = transmissions.last
    assert_equal 'user', payload[:type]
    assert_equal true, payload[:success]
    assert_equal true, payload[:watching]
    assert_equal @link.user.username, payload[:user][:username]
    assert_equal false, payload[:user][:authenticated]
    assert_has_stream "User::#{@link.user.username}"
  end

  test 'watch_user can switch to another user' do
    other_user = users(:two)
    other_user.update!(username: 'otherchanneluser', email: 'otherchannel@example.com')

    subscribe id: @link.id
    perform :watch_user, username: @link.user.username
    perform :watch_user, username: other_user.username

    assert_no_stream "User::#{@link.user.username}"
    assert_has_stream "User::#{other_user.username}"
    assert_equal other_user.username, transmissions.last[:user][:username]
  end

  test 'watch_user sends an error payload for unknown users' do
    subscribe id: @link.id

    perform :watch_user, username: 'missinguser'

    assert_equal 'user', transmissions.last[:type]
    assert_equal false, transmissions.last[:success]
    assert_equal 'User missinguser does not exist.', transmissions.last[:why]
  end
end

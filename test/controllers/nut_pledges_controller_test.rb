require "test_helper"

class NutPledgesControllerTest < ActionDispatch::IntegrationTest
  self.fixture_table_names = []

  setup do
    host! "walltaker.joi.how"
    SiteConfig.nnn_enabled = true
    @user = User.create!(
      username: "VideoFailure",
      email: "video-failure@example.com",
      password: "password",
      password_confirmation: "password"
    )
    link = @user.link.create!(never_expires: true, min_score: 0)
    past_link = PastLink.create!(
      link:,
      user: @user,
      e621_post_id: 123_456,
      post_url: "https://static.example/video.mp4",
      post_thumbnail_url: "https://static.example/video-thumbnail.jpg"
    )
    NutPledge.create!(user: @user, past_link:, failed_on: Time.current)
  end

  teardown do
    SiteConfig.nnn_enabled = false
    Rails.cache.delete("site_settings/nnn_enabled")
  end

  test "failed video pledge uses its thumbnail in current status and history" do
    get user_nut_pledge_path(@user.username)

    assert_response :success
    assert_select "a[href='https://e621.net/posts/123456'][target='_blank'] img[src='https://static.example/video-thumbnail.jpg']"
    assert_select "img[src='https://static.example/video.mp4']", count: 0

    get history_user_nut_pledge_path(@user.username)

    assert_response :success
    assert_select "a[href='https://e621.net/posts/123456'][target='_blank'] img[src='https://static.example/video-thumbnail.jpg']"
    assert_select "img[src='https://static.example/video.mp4']", count: 0
  end
end

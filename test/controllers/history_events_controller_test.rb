require "test_helper"

class HistoryEventsControllerTest < ActionDispatch::IntegrationTest
  test "should show history events without an ahoy visit" do
    user = User.create!(
      email: "history-user@example.com",
      username: "HistoryUser",
      password: "password"
    )
    link = Link.create!(
      user:,
      terms: "Test link",
      never_expires: true,
      theme: "",
      blacklist: "",
      min_score: 0
    )
    HistoryEvent.create!(user:, link:, did_what: :looked_at, ahoy_visit: nil)

    cookies.signed[:permanent_session_id] = user.id

    get history_events_url

    assert_response :success
  end
end

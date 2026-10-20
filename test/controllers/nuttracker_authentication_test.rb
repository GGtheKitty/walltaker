require "test_helper"

class NuttrackerAuthenticationTest < ActionDispatch::IntegrationTest
  test "stale permanent session redirects instead of raising" do
    cookies.signed[:permanent_session_id] = User.maximum(:id).to_i + 1

    get "/nut/orgasms/new"

    assert_redirected_to "/"
  end
end

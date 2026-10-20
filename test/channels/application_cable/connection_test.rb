require "test_helper"

class ApplicationCable::ConnectionTest < ActionCable::Connection::TestCase
  test "connects anonymously when the permanent session references a missing user" do
    cookies.signed[:permanent_session_id] = User.maximum(:id).to_i + 1

    assert_nothing_raised { connect }
    assert_nil connection.current_user
  end
end
